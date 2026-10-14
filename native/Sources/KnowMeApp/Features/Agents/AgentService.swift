import Foundation
import KnowMeCore

@MainActor
struct AgentService: Sendable {
    let model: AppModel

    init(model: AppModel) {
        self.model = model
    }

    // MARK: - Chat Session CRUD

    func listSessions() async throws -> [ChatSessionDTO] {
        try await model.decode([ChatSessionDTO].self, method: .GET, path: "/api/chats", projectScoped: false)
    }

    func getSession(id: String) async throws -> ChatSessionDTO {
        let path = "/api/chats/\(APIClient.segment(id))"
        return try await model.decode(ChatSessionDTO.self, method: .GET, path: path, projectScoped: false)
    }

    func createSession(
        title: String,
        agentType: String,
        model modelName: String? = nil,
        taskId: String? = nil
    ) async throws -> ChatSessionDTO {
        var body: [String: JSONValue] = [
            "title": .string(title.isEmpty ? "New Chat" : title),
            "agentType": .string(agentType)
        ]
        if let modelName, !modelName.isEmpty {
            body["model"] = .string(modelName)
        }
        if let taskId, !taskId.isEmpty {
            body["taskId"] = .string(taskId)
        }
        return try await model.decode(ChatSessionDTO.self, method: .POST, path: "/api/chats", body: .object(body), projectScoped: false)
    }

    func updateSession(id: String, title: String? = nil, model modelName: String? = nil) async throws -> ChatSessionDTO {
        var body: [String: JSONValue] = [:]
        if let title {
            body["title"] = .string(title)
        }
        if let modelName {
            body["model"] = .string(modelName)
        }
        let path = "/api/chats/\(APIClient.segment(id))"
        return try await model.decode(ChatSessionDTO.self, method: .PATCH, path: path, body: .object(body), projectScoped: false)
    }

    func deleteSession(id: String) async throws {
        let path = "/api/chats/\(APIClient.segment(id))"
        _ = try await model.request(method: .DELETE, path: path, projectScoped: false)
    }

    // MARK: - Chat Streaming & Messages

    func sendMessage(id: String, content: String) async throws -> SendMessageResponseDTO {
        let path = "/api/chats/\(APIClient.segment(id))/send"
        return try await model.decode(
            SendMessageResponseDTO.self,
            method: .POST,
            path: path,
            body: .object(["content": .string(content)]),
            projectScoped: false
        )
    }

    func stopChat(id: String) async throws {
        let path = "/api/chats/\(APIClient.segment(id))/stop"
        _ = try await model.request(method: .POST, path: path, projectScoped: false)
    }

    func getQueue(id: String) async throws -> ChatQueueStatusDTO {
        let path = "/api/chats/\(APIClient.segment(id))/queue"
        return try await model.decode(ChatQueueStatusDTO.self, method: .GET, path: path, projectScoped: false)
    }

    func processQueue(id: String) async throws -> ChatProcessQueueResponseDTO {
        let path = "/api/chats/\(APIClient.segment(id))/process-queue"
        return try await model.decode(ChatProcessQueueResponseDTO.self, method: .POST, path: path, projectScoped: false)
    }

    func listAgents() async throws -> AgentsAndModelsDTO {
        try await model.decode(AgentsAndModelsDTO.self, method: .GET, path: "/api/chats/agents", projectScoped: false)
    }

    // MARK: - OMP / Codex Workflow

    func getOMPStatus() async throws -> CodexStatusDTO {
        do {
            return try await model.decode(CodexStatusDTO.self, method: .GET, path: "/api/omp/status", projectScoped: false)
        } catch {
            return try await model.decode(CodexStatusDTO.self, method: .GET, path: "/api/codex/status", projectScoped: false)
        }
    }

    func getTaskSnapshot(taskId: String) async throws -> AgentTaskSnapshotDTO {
        let path = "/api/tasks/\(APIClient.segment(taskId))/agent"
        return try await model.decode(AgentTaskSnapshotDTO.self, method: .GET, path: path, projectScoped: true)
    }

    func getTaskDiff(taskId: String) async throws -> String {
        let path = "/api/tasks/\(APIClient.segment(taskId))/agent/diff"
        let json = try await model.request(method: .GET, path: path, projectScoped: true)
        return json["diff"].stringValue
    }

    func runTaskAction(taskId: String, action: AgentAction, comment: String = "") async throws -> AgentTaskSnapshotDTO {
        let path = "/api/tasks/\(APIClient.segment(taskId))/agent/\(APIClient.segment(action.rawValue))"
        let body: [String: JSONValue] = ["comment": .string(comment)]
        return try await model.decode(AgentTaskSnapshotDTO.self, method: .POST, path: path, body: .object(body), projectScoped: true)
    }

    func getTaskRunLog(taskId: String, runId: String) async throws -> String {
        let path = "/api/tasks/\(APIClient.segment(taskId))/agent/runs/\(APIClient.segment(runId))/log"
        let json = try await model.request(method: .GET, path: path, projectScoped: true)
        return json["content"].stringValue
    }

    // MARK: - OpenCode Proxy & Questions

    func getOpenCodeStatus() async throws -> OpenCodeStatusDTO {
        try await model.decode(OpenCodeStatusDTO.self, method: .GET, path: "/api/opencode/status", projectScoped: false)
    }

    func replyOpenCodeQuestion(questionId: String, answers: [[String]]) async throws {
        let path = "/api/opencode/question/\(APIClient.segment(questionId))/reply"
        let jsonAnswers = JSONValue.array(answers.map { list in
            JSONValue.array(list.map { JSONValue.string($0) })
        })
        _ = try await model.request(method: .POST, path: path, body: .object(["answers": jsonAnswers]), projectScoped: false)
    }

    func rejectOpenCodeQuestion(questionId: String) async throws {
        let path = "/api/opencode/question/\(APIClient.segment(questionId))/reject"
        _ = try await model.request(method: .POST, path: path, projectScoped: false)
    }

    enum PermissionReply: String, Sendable { case once, always, reject }
    func respondOpenCodePermission(sessionId: String, permissionId: String, response: PermissionReply) async throws {
        let path = "/api/opencode/session/\(APIClient.segment(sessionId))/permissions/\(APIClient.segment(permissionId))"
        _ = try await model.request(method: .POST, path: path, body: .object(["response": .string(response.rawValue)]), projectScoped: false)
    }

    // MARK: - WebSocket Connect (Protocol Audit & Inspection)

    func openChatWebSocket(chatId: String) async throws -> URLSessionWebSocketTask? {
        guard let client = model.client else { return nil }
        return try await client.webSocket(path: "/ws/chat", query: ["chatId": chatId])
    }
}
