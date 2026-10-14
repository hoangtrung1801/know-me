import AppKit
import Foundation
import Observation
import KnowMeCore

struct DocumentLocation: Equatable, Sendable {
    let path: String
    let projectID: String?
    var heading: String? = nil
}

enum Destination: String, CaseIterable, Identifiable, Codable {
    case overview, tasks, documents, chat, links, memos, projects, audit
    var id: String { rawValue }
    var title: String {
        switch self {
        case .overview: "Overview"
        case .tasks: "Tasks"
        case .documents: "Documents"
        case .chat: "AI Chat"
        case .links: "Saved Links"
        case .memos: "Memos"
        case .projects: "Projects"
        case .audit: "Audit"
        }
    }
    var symbol: String {
        switch self {
        case .overview: "square.grid.2x2"
        case .tasks: "checklist"
        case .documents: "doc.text"
        case .chat: "bubble.left.and.bubble.right"
        case .links: "link"
        case .memos: "note.text"
        case .projects: "folder"
        case .audit: "clock.arrow.circlepath"
        }
    }
}

@MainActor @Observable final class AppModel {
    var destination: Destination = .overview
    var inspectorVisible = true
    var showSearch = false
    var showCreate = false
    var pendingTaskID: String?
    var pendingDocument: DocumentLocation?
    var agentTaskID: String?
    var serverAddress: String
    var helperPath: String
    var workingDirectory: String
    private(set) var client: APIClient?
    private(set) var projects: [WorkspaceProject] = []
    private(set) var status: ProjectStatus?
    private(set) var workspace = WorkspaceRevision()
    private(set) var isConnecting = false
    private(set) var isSwitching = false
    private(set) var connected = false
    private(set) var eventsConnected = false
    private(set) var requiresLogin = false
    private(set) var eventSequence: UInt64 = 0
    private(set) var recentEvents: [ServerEvent] = []
    var errorMessage: String?
    var eventError: String?
    @ObservationIgnored private var eventTask: Task<Void, Never>?
    @ObservationIgnored private var connectionGeneration: UInt64 = 0
    @ObservationIgnored let backend = BackendProcess()
    @ObservationIgnored let drafts: DraftStore
    @ObservationIgnored private let preferences: UserDefaults
    @ObservationIgnored private let persistServerAddress: Bool

    init(preferences: UserDefaults = .standard) {
        self.preferences = preferences
        self.drafts = DraftStore(preferences: preferences)
        let args = ProcessInfo.processInfo.arguments
        let addressArgument = args.firstIndex(of: "--server-url").flatMap { index in args.indices.contains(index + 1) ? args[index + 1] : nil }
        persistServerAddress = addressArgument == nil && ProcessInfo.processInfo.environment["KNOWME_SERVER_URL"] == nil
        serverAddress = addressArgument ?? ProcessInfo.processInfo.environment["KNOWME_SERVER_URL"] ?? preferences.string(forKey: "serverAddress") ?? "http://127.0.0.1:6420"
        helperPath = preferences.string(forKey: "helperPath") ?? Bundle.main.url(forResource: "knowme", withExtension: nil)?.path ?? ""
        workingDirectory = preferences.string(forKey: "workingDirectory") ?? FileManager.default.homeDirectoryForCurrentUser.path
        if let saved = preferences.string(forKey: "destination"), let d = Destination(rawValue: saved) { destination = d }
    }
    var selectedProject: WorkspaceProject? { projects.first { $0.id == workspace.projectID } }
    var scopeTitle: String { selectedProject?.name ?? "All projects" }
    var ownsBackend: Bool { backend.isRunning }
    var workspaceKey: String { "\(workspace.projectID ?? "global"):\(workspace.generation)" }

    func navigate(_ destination: Destination) {
        self.destination = destination
        preferences.set(destination.rawValue, forKey: "destination")
    }
    func openTask(_ id: String, projectID: String?) async {
        await selectProject(projectID)
        guard workspace.projectID == projectID else { return }
        pendingTaskID = id
        inspectorVisible = true
        showSearch = false
        navigate(.tasks)
    }
    func openDocument(_ path: String, projectID: String?) async {
        await selectProject(projectID)
        guard workspace.projectID == projectID else { return }
        let parts = path.split(separator: "#", maxSplits: 1, omittingEmptySubsequences: false)
        pendingDocument = DocumentLocation(path: String(parts[0]), projectID: projectID, heading: parts.count > 1 ? String(parts[1]) : nil)
        showSearch = false
        navigate(.documents)
    }
    func connect() async {
        guard !isConnecting else { return }
        disconnect()
        isConnecting = true
        defer { isConnecting = false }
        let generation = connectionGeneration
        do {
            let url = try APIClient.validateBaseURL(serverAddress)
            let newClient = APIClient(baseURL: url)
            let auth: AuthStatus = try await newClient.decode(path: "/api/auth/status")
            guard generation == connectionGeneration else { return }
            client = newClient
            requiresLogin = auth.protected && !auth.authenticated
            if persistServerAddress { preferences.set(serverAddress, forKey: "serverAddress") }
            if requiresLogin { return }
            try await finishConnection(newClient, generation: generation)
        } catch { if generation == connectionGeneration { errorMessage = error.localizedDescription } }
    }
    func login(password: String) async {
        guard let client, !isConnecting else { return }
        isConnecting = true; errorMessage = nil
        defer { isConnecting = false }
        let generation = connectionGeneration
        do {
            _ = try await client.request(method: .POST, path: "/api/auth/login", body: .object(["password": .string(password)]))
            guard generation == connectionGeneration else { return }
            requiresLogin = false
            try await finishConnection(client, generation: generation)
        } catch { if generation == connectionGeneration { errorMessage = error.localizedDescription } }
    }
    private func finishConnection(_ client: APIClient, generation: UInt64) async throws {
        let repository = WorkspaceRepository(client: client)
        async let nextStatus = repository.status()
        async let nextProjects = repository.list()
        let (s, p) = try await (nextStatus, nextProjects)
        guard generation == connectionGeneration else { return }
        status = s; projects = p; connected = true
        let savedID = preferences.string(forKey: "projectID")
        workspace.invalidate(projectID: p.first { $0.id == savedID }?.id)
        startEvents(client, generation: generation)
    }
    func reloadProjects() async throws {
        guard let client else { throw APIError(status: 0, message: "Connect to a KnowMe server first.") }
        let revision = workspace
        let loaded = try await WorkspaceRepository(client: client).list()
        guard revision == workspace else { throw CancellationError() }
        projects = loaded
        if let id = workspace.projectID, !loaded.contains(where: { $0.id == id }) { workspace.invalidate(projectID: nil) }
    }
    func selectProject(_ id: String?) async {
        guard !isSwitching, !isConnecting, let client, id != workspace.projectID else { return }
        guard id == nil || projects.contains(where: { $0.id == id }) else { return }
        isSwitching = true
        // Invalidate before the request so work already in flight cannot apply to the next selection.
        let previousID = workspace.projectID
        workspace.invalidate(projectID: nil)
        let switchingRevision = workspace
        defer { isSwitching = false }
        do {
            if let id { try await WorkspaceRepository(client: client).select(id) }
            guard workspace == switchingRevision, connected else { return }
            workspace.invalidate(projectID: id)
            preferences.set(id, forKey: "projectID")
            errorMessage = nil
        } catch {
            guard workspace == switchingRevision else { return }
            workspace.invalidate(projectID: previousID)
            errorMessage = error.localizedDescription
        }
    }

    /// Every feature must set projectScoped deliberately after auditing its route contract.
    /// Explicit IDs remain captured across an await; stale responses are rejected.
    func request(method: HTTPMethod = .GET, path: String, query: [String: String] = [:], body: JSONValue? = nil, projectScoped: Bool = false) async throws -> JSONValue {
        guard let client, connected, !isSwitching else { throw APIError(status: 0, message: "Connect to a server and wait for project selection to finish.") }
        let revision = workspace
        var query = query; var body = body
        if projectScoped, let id = revision.projectID {
            query["projectId"] = id
            if case .object(var fields) = body { fields["projectId"] = .string(id); body = .object(fields) }
        }
        let result = try await client.request(method: method, path: path, query: query, body: body)
        guard workspace == revision else { throw CancellationError() }
        return result
    }
    func decode<T: Decodable & Sendable>(_ type: T.Type = T.self, method: HTTPMethod = .GET, path: String, query: [String: String] = [:], body: JSONValue? = nil, projectScoped: Bool = false) async throws -> T {
        try await request(method: method, path: path, query: query, body: body, projectScoped: projectScoped).decoded(type)
    }
    func report(_ error: Error) { if !(error is CancellationError) { errorMessage = error.localizedDescription } }
    func recordServerEvent(_ event: ServerEvent) {
        eventSequence &+= 1
        recentEvents.append(ServerEvent(name: event.name, data: event.data, id: event.id, sequence: eventSequence))
        if recentEvents.count > 100 { recentEvents.removeFirst(recentEvents.count - 100) }
    }
    private func startEvents(_ client: APIClient, generation: UInt64) {
        eventTask?.cancel()
        eventTask = Task { [weak self] in
            var failures = 0
            while !Task.isCancelled {
                guard let self, self.connectionGeneration == generation else { return }
                do {
                    let stream = await client.events()
                    for try await event in stream {
                        guard !Task.isCancelled, self.connectionGeneration == generation else { return }
                        self.eventsConnected = true; self.eventError = nil; failures = 0
                        self.recordServerEvent(event)
                        if event.name == "auth:status" {
                            // Password additions and removals both invalidate sessions. Re-check the actual status.
                            Task { await self.connect() }
                            return
                        }
                    }
                    self.eventError = "Live updates disconnected. Reconnecting…"
                } catch {
                    if Task.isCancelled { return }
                    self.eventError = error.localizedDescription
                }
                self.eventsConnected = false
                failures = min(failures + 1, 5)
                do {
                    try await Task.sleep(for: .seconds(min(pow(2.0, Double(failures)), 30)))
                    // Reconcile snapshots after reconnect; SSE replay is not assumed.
                    let fresh = try await WorkspaceRepository(client: client).status()
                    guard generation == self.connectionGeneration else { return }
                    self.status = fresh
                    self.eventSequence &+= 1
                } catch { if Task.isCancelled { return } }
            }
        }
    }
    func startBackend() async {
        guard !isConnecting else { return }
        isConnecting = true; errorMessage = nil
        do {
            let url = try await backend.start(executable: URL(fileURLWithPath: helperPath), workingDirectory: URL(fileURLWithPath: workingDirectory))
            serverAddress = url.absoluteString
            preferences.set(helperPath, forKey: "helperPath")
            preferences.set(workingDirectory, forKey: "workingDirectory")
            isConnecting = false
            await connect()
            if !connected && !requiresLogin { backend.stop() }
        } catch { isConnecting = false; report(error) }
    }
    func disconnect() {
        connectionGeneration &+= 1
        eventTask?.cancel(); eventTask = nil
        client = nil; connected = false; eventsConnected = false; requiresLogin = false
        status = nil; projects = []; recentEvents = []; errorMessage = nil; eventError = nil
        workspace.invalidate(projectID: nil)
    }
    func stopBackend() { disconnect(); backend.stop() }
    func shutdown() { disconnect(); backend.stop() }
}
