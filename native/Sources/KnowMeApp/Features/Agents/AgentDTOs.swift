import Foundation
import KnowMeCore

// MARK: - Chat Session & Message DTOs

struct ChatSessionDTO: Codable, Sendable, Identifiable, Equatable {
    let id: String
    var sessionId: String
    var title: String
    var agentType: String // "claude" | "opencode" | "codex" | "omp"
    var model: String?
    var status: String // "idle" | "streaming" | "error"
    var projectId: String?
    var taskId: String?
    var parentSessionId: String?
    var createdAt: String
    var updatedAt: String
    var messages: [ChatMessageDTO]
    var messageQueue: [String]?

    init(
        id: String,
        sessionId: String = UUID().uuidString,
        title: String = "New Chat",
        agentType: String = "omp",
        model: String? = nil,
        status: String = "idle",
        projectId: String? = nil,
        taskId: String? = nil,
        parentSessionId: String? = nil,
        createdAt: String = "",
        updatedAt: String = "",
        messages: [ChatMessageDTO] = [],
        messageQueue: [String]? = nil
    ) {
        self.id = id
        self.sessionId = sessionId
        self.title = title
        self.agentType = agentType
        self.model = model
        self.status = status
        self.projectId = projectId
        self.taskId = taskId
        self.parentSessionId = parentSessionId
        self.createdAt = createdAt
        self.updatedAt = updatedAt
        self.messages = messages
        self.messageQueue = messageQueue
    }

    var isTaskBound: Bool {
        (agentType == "omp" || agentType == "codex") && taskId != nil && !(taskId?.isEmpty ?? true)
    }

    var isStreaming: Bool {
        status == "streaming"
    }
}

struct ChatMessageDTO: Codable, Sendable, Identifiable, Equatable {
    let id: String
    var role: String // "user" | "assistant"
    var content: String
    var model: String?
    var createdAt: String
    var runId: String?
    var phase: String? // "investigation" | "implementation" | "fix" | "chat"
    var cost: Double?
    var duration: Int? // milliseconds
    var tokens: Int?
    var inputTokens: Int?
    var outputTokens: Int?
    var toolCalls: [ChatToolCallDTO]?
    var questionBlocks: [ChatQuestionBlockDTO]?
    var attachments: [ChatAttachmentDTO]?
    var error: String?

    init(
        id: String = UUID().uuidString,
        role: String = "user",
        content: String = "",
        model: String? = nil,
        createdAt: String = "",
        runId: String? = nil,
        phase: String? = nil,
        cost: Double? = nil,
        duration: Int? = nil,
        tokens: Int? = nil,
        inputTokens: Int? = nil,
        outputTokens: Int? = nil,
        toolCalls: [ChatToolCallDTO]? = nil,
        questionBlocks: [ChatQuestionBlockDTO]? = nil,
        attachments: [ChatAttachmentDTO]? = nil,
        error: String? = nil
    ) {
        self.id = id
        self.role = role
        self.content = content
        self.model = model
        self.createdAt = createdAt
        self.runId = runId
        self.phase = phase
        self.cost = cost
        self.duration = duration
        self.tokens = tokens
        self.inputTokens = inputTokens
        self.outputTokens = outputTokens
        self.toolCalls = toolCalls
        self.questionBlocks = questionBlocks
        self.attachments = attachments
        self.error = error
    }
}

struct ChatToolCallDTO: Codable, Sendable, Identifiable, Equatable {
    let id: String
    var name: String
    var input: JSONValue?
    var output: String?
    var status: String // "loading" | "success" | "error"
    var title: String?
    var metadata: JSONValue?

    init(
        id: String = UUID().uuidString,
        name: String,
        input: JSONValue? = nil,
        output: String? = nil,
        status: String = "loading",
        title: String? = nil,
        metadata: JSONValue? = nil
    ) {
        self.id = id
        self.name = name
        self.input = input
        self.output = output
        self.status = status
        self.title = title
        self.metadata = metadata
    }
}

struct ChatAttachmentDTO: Codable, Sendable, Identifiable, Equatable {
    let id: String
    var mime: String
    var url: String
    var filename: String

    init(id: String = UUID().uuidString, mime: String, url: String, filename: String) {
        self.id = id
        self.mime = mime
        self.url = url
        self.filename = filename
    }
}

struct ChatQuestionOptionDTO: Codable, Sendable, Equatable {
    var label: String
    var description: String?

    init(label: String, description: String? = nil) {
        self.label = label
        self.description = description
    }
}

struct ChatQuestionPromptDTO: Codable, Sendable, Equatable {
    var header: String?
    var question: String
    var multiple: Bool?
    var options: [ChatQuestionOptionDTO]

    init(header: String? = nil, question: String, multiple: Bool? = false, options: [ChatQuestionOptionDTO] = []) {
        self.header = header
        self.question = question
        self.multiple = multiple
        self.options = options
    }
}

struct ChatQuestionBlockDTO: Codable, Sendable, Identifiable, Equatable {
    let id: String
    var prompts: [ChatQuestionPromptDTO]
    var selectedAnswers: [[String]]?
    var status: String? // "idle" | "submitting" | "submitted" | "rejecting" | "rejected" | "error"
    var error: String?

    init(
        id: String = UUID().uuidString,
        prompts: [ChatQuestionPromptDTO] = [],
        selectedAnswers: [[String]]? = nil,
        status: String? = "idle",
        error: String? = nil
    ) {
        self.id = id
        self.prompts = prompts
        self.selectedAnswers = selectedAnswers
        self.status = status
        self.error = error
    }
}

// MARK: - Queue & Agents Info

struct ChatQueueStatusDTO: Codable, Sendable, Equatable {
    var queueSize: Int
    var maxSize: Int
    var messages: [String]

    init(queueSize: Int = 0, maxSize: Int = 10, messages: [String] = []) {
        self.queueSize = queueSize
        self.maxSize = maxSize
        self.messages = messages
    }
}

struct ChatProcessQueueResponseDTO: Codable, Sendable, Equatable {
    var hasMore: Bool?
    var message: String?
    var queueSize: Int?
}

struct AgentInfoDTO: Codable, Sendable, Identifiable, Equatable {
    var id: String { name }
    var name: String
    var displayName: String
    var available: Bool

    init(name: String, displayName: String, available: Bool) {
        self.name = name
        self.displayName = displayName
        self.available = available
    }
}

struct AgentsAndModelsDTO: Codable, Sendable, Equatable {
    var agents: [AgentInfoDTO]
    var models: [String]

    init(agents: [AgentInfoDTO] = [], models: [String] = []) {
        self.agents = agents
        self.models = models
    }
}

struct SendMessageResponseDTO: Codable, Sendable, Equatable {
    var accepted: Bool?
    var queued: Bool?
    var position: Int?
    var queueSize: Int?
}

// MARK: - OMP / Codex Workflow DTOs

enum AgentPhase: String, Codable, Sendable, CaseIterable {
    case idle = "idle"
    case investigating = "investigating"
    case planReview = "plan-review"
    case implementing = "implementing"
    case interrupted = "interrupted"
    case codeReview = "code-review"
    case fixReady = "fix-ready"
    case readyToMerge = "ready-to-merge"
    case completed = "completed"

    var title: String {
        switch self {
        case .idle: return "Idle"
        case .investigating: return "Investigating"
        case .planReview: return "Plan Review"
        case .implementing: return "Implementing"
        case .interrupted: return "Interrupted"
        case .codeReview: return "Code Review"
        case .fixReady: return "Fix Ready"
        case .readyToMerge: return "Ready to Merge"
        case .completed: return "Completed"
        }
    }

    var symbol: String {
        switch self {
        case .idle: return "circle"
        case .investigating: return "magnifyingglass"
        case .planReview: return "doc.text.magnifyingglass"
        case .implementing: return "gearshape.arrow.triangle.2.circlepath"
        case .interrupted: return "pause.circle"
        case .codeReview: return "checklist"
        case .fixReady: return "wrench.and.screwdriver"
        case .readyToMerge: return "arrow.triangle.merge"
        case .completed: return "checkmark.circle.fill"
        }
    }
}

enum AgentAction: String, Codable, Sendable, CaseIterable {
    case startInvestigation = "start-investigation"
    case approvePlan = "approve-plan"
    case requestPlanChanges = "request-plan-changes"
    case approveImplementation = "approve-implementation"
    case requestImplementationChanges = "request-implementation-changes"
    case startFix = "start-fix"
    case createWorktree = "create-worktree"
    case startAgent = "start-agent"
    case commitWorktree = "commit-worktree"
    case mergeWorktree = "merge-worktree"
    case completeWithoutMerge = "complete-without-merge"
    case resume = "resume"
    case cancel = "cancel"

    var title: String {
        switch self {
        case .startInvestigation: return "Start Investigation"
        case .approvePlan: return "Approve Plan & Implement"
        case .requestPlanChanges: return "Request Plan Changes"
        case .approveImplementation: return "Approve Implementation"
        case .requestImplementationChanges: return "Request Implementation Changes"
        case .startFix: return "Start Fix"
        case .createWorktree: return "Create Worktree"
        case .startAgent: return "Start OMP Agent"
        case .commitWorktree: return "Commit Worktree Changes"
        case .mergeWorktree: return "Merge to Main"
        case .completeWithoutMerge: return "Complete Without Merge"
        case .resume: return "Resume"
        case .cancel: return "Cancel Run"
        }
    }
}

struct AgentWorkflowDTO: Codable, Sendable, Equatable {
    var projectId: String
    var taskId: String
    var phase: AgentPhase
    var activeRunId: String?
    var ompSessionId: String?
    var codexSessionId: String?
    var chatSessionId: String?
    var worktreePath: String?
    var worktreeBranch: String?
    var worktreeCommit: String?
    var resumePhase: String?
    var updatedAt: String

    init(
        projectId: String = "",
        taskId: String = "",
        phase: AgentPhase = .idle,
        activeRunId: String? = nil,
        ompSessionId: String? = nil,
        codexSessionId: String? = nil,
        chatSessionId: String? = nil,
        worktreePath: String? = nil,
        worktreeBranch: String? = nil,
        worktreeCommit: String? = nil,
        resumePhase: String? = nil,
        updatedAt: String = ""
    ) {
        self.projectId = projectId
        self.taskId = taskId
        self.phase = phase
        self.activeRunId = activeRunId
        self.ompSessionId = ompSessionId
        self.codexSessionId = codexSessionId
        self.chatSessionId = chatSessionId
        self.worktreePath = worktreePath
        self.worktreeBranch = worktreeBranch
        self.worktreeCommit = worktreeCommit
        self.resumePhase = resumePhase
        self.updatedAt = updatedAt
    }
}

struct AgentRunDTO: Codable, Sendable, Identifiable, Equatable {
    var id: String
    var projectId: String
    var taskId: String
    var phase: String // "investigation" | "implementation" | "fix" | "chat"
    var status: String // "running" | "succeeded" | "failed" | "cancelled" | "interrupted"
    var codexThreadId: String?
    var ompSessionId: String?
    var codexSessionId: String?
    var startedAt: String?
    var finishedAt: String?
    var exitCode: Int?
    var summary: String?
    var tests: [String]?
    var error: String?
    var logPath: String?

    init(
        id: String,
        projectId: String = "",
        taskId: String = "",
        phase: String = "investigation",
        status: String = "running",
        codexThreadId: String? = nil,
        ompSessionId: String? = nil,
        codexSessionId: String? = nil,
        startedAt: String? = nil,
        finishedAt: String? = nil,
        exitCode: Int? = nil,
        summary: String? = nil,
        tests: [String]? = nil,
        error: String? = nil,
        logPath: String? = nil
    ) {
        self.id = id
        self.projectId = projectId
        self.taskId = taskId
        self.phase = phase
        self.status = status
        self.codexThreadId = codexThreadId
        self.ompSessionId = ompSessionId
        self.codexSessionId = codexSessionId
        self.startedAt = startedAt
        self.finishedAt = finishedAt
        self.exitCode = exitCode
        self.summary = summary
        self.tests = tests
        self.error = error
        self.logPath = logPath
    }
}

struct ReviewCommentDTO: Codable, Sendable, Identifiable, Equatable {
    var id: String
    var projectId: String
    var taskId: String
    var stage: String // "plan" | "implementation"
    var body: String
    var createdAt: String
    var runId: String?

    init(
        id: String,
        projectId: String = "",
        taskId: String = "",
        stage: String = "plan",
        body: String = "",
        createdAt: String = "",
        runId: String? = nil
    ) {
        self.id = id
        self.projectId = projectId
        self.taskId = taskId
        self.stage = stage
        self.body = body
        self.createdAt = createdAt
        self.runId = runId
    }
}

struct AgentTaskSnapshotDTO: Codable, Sendable, Equatable {
    var workflow: AgentWorkflowDTO
    var chatSessionId: String?
    var runs: [AgentRunDTO]
    var reviewComments: [ReviewCommentDTO]
    var dirtyFiles: [String]
    var diff: String?
    var adapterState: String // "running" | "stopped"
    var resumable: Bool?
    var interrupted: Bool?

    init(
        workflow: AgentWorkflowDTO = AgentWorkflowDTO(),
        chatSessionId: String? = nil,
        runs: [AgentRunDTO] = [],
        reviewComments: [ReviewCommentDTO] = [],
        dirtyFiles: [String] = [],
        diff: String? = nil,
        adapterState: String = "stopped",
        resumable: Bool? = false,
        interrupted: Bool? = false
    ) {
        self.workflow = workflow
        self.chatSessionId = chatSessionId
        self.runs = runs
        self.reviewComments = reviewComments
        self.dirtyFiles = dirtyFiles
        self.diff = diff
        self.adapterState = adapterState
        self.resumable = resumable
        self.interrupted = interrupted
    }
}

struct CodexStatusDTO: Codable, Sendable, Equatable {
    var installed: Bool
    var loggedIn: Bool
    var version: String?
    var executable: String?
    var error: String?
    var installCommand: String?
    var loginCommand: String
    var docsUrl: String

    init(
        installed: Bool = false,
        loggedIn: Bool = false,
        version: String? = nil,
        executable: String? = nil,
        error: String? = nil,
        installCommand: String? = "brew install can1357/tap/omp",
        loginCommand: String = "omp auth-broker",
        docsUrl: String = "https://github.com/can1357/omp"
    ) {
        self.installed = installed
        self.loggedIn = loggedIn
        self.version = version
        self.executable = executable
        self.error = error
        self.installCommand = installCommand
        self.loginCommand = loginCommand
        self.docsUrl = docsUrl
    }

    var isReady: Bool {
        installed && loggedIn
    }
}

// MARK: - OpenCode DTOs

struct OpenCodeRuntimeReadinessDTO: Codable, Sendable, Equatable {
    var healthy: Bool
    var configOk: Bool
    var agentOk: Bool
    var ready: Bool
    var version: String?
    var error: String?

    init(
        healthy: Bool = false,
        configOk: Bool = false,
        agentOk: Bool = false,
        ready: Bool = false,
        version: String? = nil,
        error: String? = nil
    ) {
        self.healthy = healthy
        self.configOk = configOk
        self.agentOk = agentOk
        self.ready = ready
        self.version = version
        self.error = error
    }
}

struct OpenCodeStatusDTO: Codable, Sendable, Equatable {
    var configured: Bool
    var mode: String?
    var state: String?
    var available: Bool
    var ready: Bool
    var host: String?
    var port: Int?
    var cliInstalled: Bool?
    var compatible: Bool?
    var version: String?
    var minVersion: String?
    var lastError: String?
    var restartCount: Int?
    var readiness: OpenCodeRuntimeReadinessDTO?

    init(
        configured: Bool = false,
        mode: String? = "managed",
        state: String? = "unavailable",
        available: Bool = false,
        ready: Bool = false,
        host: String? = nil,
        port: Int? = nil,
        cliInstalled: Bool? = false,
        compatible: Bool? = false,
        version: String? = nil,
        minVersion: String? = nil,
        lastError: String? = nil,
        restartCount: Int? = 0,
        readiness: OpenCodeRuntimeReadinessDTO? = nil
    ) {
        self.configured = configured
        self.mode = mode
        self.state = state
        self.available = available
        self.ready = ready
        self.host = host
        self.port = port
        self.cliInstalled = cliInstalled
        self.compatible = compatible
        self.version = version
        self.minVersion = minVersion
        self.lastError = lastError
        self.restartCount = restartCount
        self.readiness = readiness
    }
}

struct OpenCodePermissionDTO: Codable, Sendable, Identifiable, Equatable {
    var id: String
    var permission: String
    var pattern: String
    var action: String

    init(id: String = UUID().uuidString, permission: String, pattern: String, action: String) {
        self.id = id
        self.permission = permission
        self.pattern = pattern
        self.action = action
    }
}

struct OpenCodeQuestionReplyPayloadDTO: Codable, Sendable {
    var answers: [[String]]

    init(answers: [[String]]) {
        self.answers = answers
    }
}
