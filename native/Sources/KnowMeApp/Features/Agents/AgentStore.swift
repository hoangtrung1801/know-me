import Foundation
import Observation
import KnowMeCore

@MainActor
@Observable
final class AgentStore {
    let model: AppModel
    let service: AgentService

    var sessions: [ChatSessionDTO] = []
    var activeSessionId: String?
    var activeSession: ChatSessionDTO?
    var isLoadingSessions = false
    var isLoadingActiveSession = false
    var isSending = false
    var errorMessage: String?
    var queueStatus: ChatQueueStatusDTO?
    var ompStatus: CodexStatusDTO?
    var openCodeStatus: OpenCodeStatusDTO?

    // Task workflow state
    var taskSnapshot: AgentTaskSnapshotDTO?
    var taskDiff: String?
    var activeRunLog: String?
    var selectedRunId: String?
    var isTaskActionBusy = false
    var taskActionError: String?
    var taskProgressMessage: String?

    // Internal tracking
    private var lastSeenEventSequence: UInt64 = 0
    private var sessionSelectionGeneration = UUID()
    private var capturedRevision = WorkspaceRevision()
    private var webSocketTask: URLSessionWebSocketTask?

    init(model: AppModel) {
        self.model = model
        self.service = AgentService(model: model)
        self.capturedRevision = model.workspace
    }

    deinit {
        // WebSocket task will be cancelled by URLSession
    }

    // MARK: - Lifecycle & Workspace Sync

    func syncWorkspace() async {
        if capturedRevision != model.workspace {
            capturedRevision = model.workspace
            sessionSelectionGeneration = UUID()
            webSocketTask?.cancel(with: .normalClosure, reason: nil)
            webSocketTask = nil
            queueStatus = nil
            isLoadingActiveSession = false
            activeSessionId = nil
            activeSession = nil
            taskSnapshot = nil
            taskDiff = nil
            activeRunLog = nil
            await loadSessions()
            await refreshStatuses()
        }
    }

    func refreshStatuses() async {
        async let ompResult = try? service.getOMPStatus()
        async let openCodeResult = try? service.getOpenCodeStatus()
        self.ompStatus = await ompResult
        self.openCodeStatus = await openCodeResult
    }

    // MARK: - Sessions CRUD

    func loadSessions() async {
        guard model.connected else { return }
        isLoadingSessions = true
        errorMessage = nil
        do {
            let loaded = try await service.listSessions()
            self.sessions = loaded
            if activeSessionId == nil, let first = loaded.first {
                await selectSession(id: first.id)
            } else if let activeSessionId {
                if let matched = loaded.first(where: { $0.id == activeSessionId }) {
                    self.activeSession = matched
                }
            }
        } catch {
            if !(error is CancellationError) {
                self.errorMessage = "Failed to load chat sessions: \(error.localizedDescription)"
                model.report(error)
            }
        }
        isLoadingSessions = false
    }

    func selectSession(id: String?) async {
        guard activeSessionId != id else { return }
        sessionSelectionGeneration = UUID()
        let generation = sessionSelectionGeneration
        let workspace = model.workspace
        webSocketTask?.cancel(with: .normalClosure, reason: nil)
        webSocketTask = nil
        queueStatus = nil
        activeSession = nil
        isLoadingActiveSession = false
        activeSessionId = id
        guard let id else {
            activeSession = nil
            return
        }

        isLoadingActiveSession = true
        errorMessage = nil
        do {
            let session = try await service.getSession(id: id)
            guard generation == sessionSelectionGeneration, workspace == model.workspace else { return }
            self.activeSession = session
            await refreshQueue(for: id)
            guard generation == sessionSelectionGeneration, workspace == model.workspace else { return }
            await attachWebSocket(for: id)
        } catch {
            if !(error is CancellationError) {
                guard generation == sessionSelectionGeneration, workspace == model.workspace else { return }
                self.errorMessage = "Could not open session: \(error.localizedDescription)"
                model.report(error)
            }
        }
        if generation == sessionSelectionGeneration { isLoadingActiveSession = false }
    }

    func createSession(
        title: String,
        agentType: String = "omp",
        model modelName: String? = nil,
        taskId: String? = nil
    ) async -> ChatSessionDTO? {
        errorMessage = nil
        do {
            let created = try await service.createSession(
                title: title,
                agentType: agentType,
                model: modelName,
                taskId: taskId
            )
            // Insert or replace in sessions list
            if let index = sessions.firstIndex(where: { $0.id == created.id }) {
                sessions[index] = created
            } else {
                sessions.insert(created, at: 0)
            }
            await selectSession(id: created.id)
            return created
        } catch {
            self.errorMessage = "Failed to create session: \(error.localizedDescription)"
            model.report(error)
            return nil
        }
    }

    func updateTitle(id: String, title: String) async {
        do {
            let updated = try await service.updateSession(id: id, title: title)
            updateLocalSession(updated)
        } catch {
            self.errorMessage = "Failed to rename session: \(error.localizedDescription)"
            model.report(error)
        }
    }

    func updateModel(id: String, modelName: String) async {
        do {
            let updated = try await service.updateSession(id: id, model: modelName)
            updateLocalSession(updated)
        } catch {
            self.errorMessage = "Failed to update model: \(error.localizedDescription)"
            model.report(error)
        }
    }

    func deleteSession(id: String) async {
        errorMessage = nil
        do {
            try await service.deleteSession(id: id)
            sessions.removeAll { $0.id == id }
            if activeSessionId == id {
                await selectSession(id: sessions.first?.id)
            }
            clearDraft(sessionId: id)
        } catch {
            self.errorMessage = "Failed to delete session: \(error.localizedDescription)"
            model.report(error)
        }
    }

    // MARK: - Messaging, Streaming & Queue

    @discardableResult
    func sendMessage(content: String, sessionID: String? = nil) async -> Bool {
        guard let sessionId = activeSessionId, !isSending, sessionID == nil || sessionID == sessionId else { return false }
        let workspace = model.workspace
        let trimmed = content.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return false }
        saveDraft(sessionId: sessionId, text: content)
        isSending = true
        defer { isSending = false }
        errorMessage = nil

        // Optimistically append user message if not already present
        let userMessage = ChatMessageDTO(
            id: UUID().uuidString,
            role: "user",
            content: trimmed,
            model: activeSession?.model ?? "omp",
            createdAt: ISO8601DateFormatter().string(from: Date())
        )
        if var session = activeSession {
            session.messages.append(userMessage)
            session.status = "streaming"
            updateLocalSession(session)
        }

        do {
            let res = try await service.sendMessage(id: sessionId, content: trimmed)
            // On successful submission, clear composer draft
            if model.drafts.load(namespace: "chat", projectID: workspace.projectID, entityID: sessionId) == content {
                model.drafts.remove(namespace: "chat", projectID: workspace.projectID, entityID: sessionId)
            }
            if res.queued == true {
                await refreshQueue(for: sessionId)
            }
            return true
        } catch {
            guard activeSessionId == sessionId, model.workspace == workspace else { return false }
            self.errorMessage = "Failed to send message: \(error.localizedDescription)"
            model.report(error)
            // Update session status out of streaming
            if var session = activeSession {
                session.status = "error"
                session.messages.append(ChatMessageDTO(
                    id: UUID().uuidString,
                    role: "assistant",
                    content: "",
                    error: error.localizedDescription
                ))
                updateLocalSession(session)
            }
            return false
        }
    }

    func stopChat() async {
        guard let sessionId = activeSessionId else { return }
        do {
            try await service.stopChat(id: sessionId)
            if var session = activeSession {
                session.status = "idle"
                updateLocalSession(session)
            }
        } catch {
            self.errorMessage = "Failed to stop chat: \(error.localizedDescription)"
            model.report(error)
        }
    }

    func refreshQueue(for sessionId: String) async {
        do {
            let workspace = model.workspace
            let q = try await service.getQueue(id: sessionId)
            guard activeSessionId == sessionId, workspace == model.workspace else { return }
            self.queueStatus = q
        } catch {
            // Queue fetch may fail silently if not supported
        }
    }

    func processQueue(for sessionId: String) async {
        do {
            _ = try await service.processQueue(id: sessionId)
            await refreshQueue(for: sessionId)
        } catch {
            self.errorMessage = "Failed to process queue: \(error.localizedDescription)"
            model.report(error)
        }
    }

    // MARK: - Task Workflow (OMP / Codex)

    func loadTaskWorkflow(taskId: String) async {
        guard model.connected else { return }
        taskActionError = nil
        isTaskActionBusy = true
        async let statusTask = service.getOMPStatus()
        async let snapshotTask = service.getTaskSnapshot(taskId: taskId)

        do {
            let (status, snapshot) = try await (statusTask, snapshotTask)
            self.ompStatus = status
            self.taskSnapshot = snapshot
        } catch {
            if !(error is CancellationError) {
                self.taskActionError = "Unable to load task agent: \(error.localizedDescription)"
            }
        }
        isTaskActionBusy = false
    }

    func runTaskAction(taskId: String, action: AgentAction, comment: String = "") async {
        taskActionError = nil
        isTaskActionBusy = true
        taskProgressMessage = "Executing \(action.title)…"
        do {
            let updated = try await service.runTaskAction(taskId: taskId, action: action, comment: comment)
            self.taskSnapshot = updated
            taskProgressMessage = nil
            if action == .approveImplementation || action == .startInvestigation || action == .approvePlan {
                // Refresh diff and logs
                await loadTaskDiff(taskId: taskId)
            }
        } catch {
            self.taskActionError = error.localizedDescription
            taskProgressMessage = nil
        }
        isTaskActionBusy = false
    }

    func loadTaskDiff(taskId: String) async {
        do {
            let diff = try await service.getTaskDiff(taskId: taskId)
            self.taskDiff = diff
        } catch {
            self.taskDiff = nil
        }
    }

    func loadRunLog(taskId: String, runId: String) async {
        selectedRunId = runId
        do {
            let log = try await service.getTaskRunLog(taskId: taskId, runId: runId)
            self.activeRunLog = log
        } catch {
            self.activeRunLog = "Could not load run log: \(error.localizedDescription)"
        }
    }

    // MARK: - SSE & Real-Time Processing

    func checkServerEvents() {
        guard model.eventSequence != lastSeenEventSequence else { return }
        let previousSequence = lastSeenEventSequence
        lastSeenEventSequence = model.eventSequence
        for event in model.recentEvents where (event.sequence ?? 0) > previousSequence {
            processEvent(event)
        }
    }

    private func processEvent(_ event: ServerEvent) {
        guard let json = event.json else { return }

        switch event.name {
        case "connected", "refresh":
            Task { [weak self] in await self?.loadSessions() }
        case "chats:message":
            let chatId = json["chatId"].stringValue
            guard !chatId.isEmpty, chatId == activeSessionId else { return }
            let messageJson = json["message"]
            guard messageJson != .null else { return }
            do {
                let msg = try messageJson.decoded(ChatMessageDTO.self)
                appendOrUpdateMessage(msg)
            } catch {}

        case "chats:updated":
            let sessionJson = json["session"]
            guard sessionJson != .null else { return }
            do {
                let updated = try sessionJson.decoded(ChatSessionDTO.self)
                updateLocalSession(updated)
            } catch {}

        case "chats:created":
            let sessionJson = json["session"]
            guard sessionJson != .null else { return }
            do {
                let created = try sessionJson.decoded(ChatSessionDTO.self)
                if !sessions.contains(where: { $0.id == created.id }) {
                    sessions.insert(created, at: 0)
                }
            } catch {}

        case "chats:deleted":
            let chatId = json["chatId"].stringValue
            guard !chatId.isEmpty else { return }
            sessions.removeAll { $0.id == chatId }
            if activeSessionId == chatId {
                activeSession = nil
                activeSessionId = nil
            }

        case "agent:progress":
            let msg = json["message"].stringValue
            if !msg.isEmpty {
                taskProgressMessage = msg
            }

        case "agent:updated":
            let taskId = json["taskId"].stringValue
            if !taskId.isEmpty, taskSnapshot?.workflow.taskId == taskId {
                Task { [weak self] in
                    await self?.loadTaskWorkflow(taskId: taskId)
                }
            }

        default:
            break
        }
    }

    private func appendOrUpdateMessage(_ message: ChatMessageDTO) {
        guard var session = activeSession else { return }
        if let idx = session.messages.firstIndex(where: { $0.id == message.id }) {
            session.messages[idx] = message
        } else {
            session.messages.append(message)
        }
        updateLocalSession(session)
    }

    private func updateLocalSession(_ session: ChatSessionDTO) {
        if let idx = sessions.firstIndex(where: { $0.id == session.id }) {
            sessions[idx] = session
        }
        if activeSessionId == session.id {
            activeSession = session
        }
    }

    // MARK: - Draft Recovery

    func loadDraft(sessionId: String) -> String {
        model.drafts.load(namespace: "chat", projectID: model.workspace.projectID, entityID: sessionId) ?? ""
    }

    func saveDraft(sessionId: String, text: String) {
        model.drafts.save(text, namespace: "chat", projectID: model.workspace.projectID, entityID: sessionId)
    }

    func clearDraft(sessionId: String) {
        model.drafts.remove(namespace: "chat", projectID: model.workspace.projectID, entityID: sessionId)
    }

    // MARK: - WebSocket Protocol Connection

    private func attachWebSocket(for chatId: String) async {
        do {
            let workspace = model.workspace
            let socket = try await service.openChatWebSocket(chatId: chatId)
            guard activeSessionId == chatId, workspace == model.workspace else {
                socket?.cancel(with: .normalClosure, reason: nil)
                return
            }
            self.webSocketTask = socket
        } catch {
            // Keep connection attempt failure non-fatal, as SSE provides canonical chat events
        }
    }
}
