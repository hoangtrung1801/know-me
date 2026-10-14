import Foundation
import KnowMeCore

// MARK: - Configuration DTOs

public struct ProjectConfig: Codable, Sendable, Equatable {
    public var name: String?
    public var id: String?
    public var createdAt: String?
    public var workspacePath: String?
    public var defaultAssignee: String?
    public var defaultPriority: String?
    public var defaultLabels: [String]?
    public var timeFormat: String?
    public var editor: String?
    public var gitTrackingMode: String?
    public var serverPort: Int?
    public var statuses: [String]?
    public var statusColors: [String: String]?
    public var visibleColumns: [String]?
    public var platforms: [String]?
    public var enableChatUI: Bool?
    public var taskLifecycle: TaskLifecycleConfig?
    public var semanticSearch: SemanticSearchConfig?
    public var runtimeMemory: RuntimeMemoryConfig?
    public var opencodeServer: OpenCodeServerConfig?
    public var opencodeModels: OpenCodeModelSettings?
    public var opencodeInstalled: Bool?
    public var localONNX: LocalONNXCapability?
    public var capabilities: [String: Bool]?

    public init(
        name: String? = nil,
        id: String? = nil,
        createdAt: String? = nil,
        workspacePath: String? = nil,
        defaultAssignee: String? = nil,
        defaultPriority: String? = nil,
        defaultLabels: [String]? = nil,
        timeFormat: String? = nil,
        editor: String? = nil,
        gitTrackingMode: String? = nil,
        serverPort: Int? = nil,
        statuses: [String]? = nil,
        statusColors: [String: String]? = nil,
        visibleColumns: [String]? = nil,
        platforms: [String]? = nil,
        enableChatUI: Bool? = nil,
        taskLifecycle: TaskLifecycleConfig? = nil,
        semanticSearch: SemanticSearchConfig? = nil,
        runtimeMemory: RuntimeMemoryConfig? = nil,
        opencodeServer: OpenCodeServerConfig? = nil,
        opencodeModels: OpenCodeModelSettings? = nil,
        opencodeInstalled: Bool? = nil,
        localONNX: LocalONNXCapability? = nil,
        capabilities: [String: Bool]? = nil
    ) {
        self.name = name
        self.id = id
        self.createdAt = createdAt
        self.workspacePath = workspacePath
        self.defaultAssignee = defaultAssignee
        self.defaultPriority = defaultPriority
        self.defaultLabels = defaultLabels
        self.timeFormat = timeFormat
        self.editor = editor
        self.gitTrackingMode = gitTrackingMode
        self.serverPort = serverPort
        self.statuses = statuses
        self.statusColors = statusColors
        self.visibleColumns = visibleColumns
        self.platforms = platforms
        self.enableChatUI = enableChatUI
        self.taskLifecycle = taskLifecycle
        self.semanticSearch = semanticSearch
        self.runtimeMemory = runtimeMemory
        self.opencodeServer = opencodeServer
        self.opencodeModels = opencodeModels
        self.opencodeInstalled = opencodeInstalled
        self.localONNX = localONNX
        self.capabilities = capabilities
    }
}

public struct ConfigEnvelope: Codable, Sendable {
    public let config: ProjectConfig

    public init(config: ProjectConfig) {
        self.config = config
    }
}

public struct TaskLifecycleConfig: Codable, Sendable, Equatable {
    public var excludeDoneFromDefaultRetrieval: Bool
    public var autoArchive: Bool
    public var archiveAfter: String
    public var purgeAfter: String?

    public init(
        excludeDoneFromDefaultRetrieval: Bool = true,
        autoArchive: Bool = true,
        archiveAfter: String = "30d",
        purgeAfter: String? = nil
    ) {
        self.excludeDoneFromDefaultRetrieval = excludeDoneFromDefaultRetrieval
        self.autoArchive = autoArchive
        self.archiveAfter = archiveAfter
        self.purgeAfter = purgeAfter
    }
}

public struct SemanticSearchConfig: Codable, Sendable, Equatable {
    public var enabled: Bool
    public var provider: String?
    public var model: String?
    public var dimensions: Int?
    public var maxTokens: Int?

    public init(
        enabled: Bool = false,
        provider: String? = nil,
        model: String? = nil,
        dimensions: Int? = 384,
        maxTokens: Int? = 512
    ) {
        self.enabled = enabled
        self.provider = provider
        self.model = model
        self.dimensions = dimensions
        self.maxTokens = maxTokens
    }
}

public struct RuntimeMemoryConfig: Codable, Sendable, Equatable {
    public var mode: String?
    public var maxItems: Int?
    public var maxBytes: Int?

    public init(
        mode: String? = "auto",
        maxItems: Int? = 0,
        maxBytes: Int? = 0
    ) {
        self.mode = mode
        self.maxItems = maxItems
        self.maxBytes = maxBytes
    }
}

public struct OpenCodeServerConfig: Codable, Sendable, Equatable {
    public var host: String?
    public var port: Int?
    public var password: String?
    public var mode: String?

    public init(
        host: String? = nil,
        port: Int? = nil,
        password: String? = nil,
        mode: String? = nil
    ) {
        self.host = host
        self.port = port
        self.password = password
        self.mode = mode
    }
}

public struct OpenCodeModelRef: Codable, Sendable, Equatable {
    public var providerID: String
    public var modelID: String

    public init(providerID: String, modelID: String) {
        self.providerID = providerID
        self.modelID = modelID
    }
}

public struct OpenCodeModelSettings: Codable, Sendable, Equatable {
    public var version: Int?
    public var defaultModel: OpenCodeModelRef?
    public var activeModels: [String]?
    public var variantModels: [String: String]?

    public init(
        version: Int? = 1,
        defaultModel: OpenCodeModelRef? = nil,
        activeModels: [String]? = nil,
        variantModels: [String: String]? = nil
    ) {
        self.version = version
        self.defaultModel = defaultModel
        self.activeModels = activeModels
        self.variantModels = variantModels
    }
}

public struct LocalONNXCapability: Codable, Sendable, Equatable {
    public var supported: Bool
    public var reason: String?

    public init(supported: Bool = false, reason: String? = nil) {
        self.supported = supported
        self.reason = reason
    }
}

// MARK: - Link Classifier DTOs

public struct ClassifierConfigDTO: Codable, Sendable, Equatable {
    public var apiBase: String
    public var model: String
    public var configured: Bool

    public init(apiBase: String = "", model: String = "", configured: Bool = false) {
        self.apiBase = apiBase
        self.model = model
        self.configured = configured
    }
}

public struct LinkClassifierSaveRequest: Codable, Sendable {
    public var apiBase: String
    public var apiKey: String
    public var model: String

    public init(apiBase: String, apiKey: String, model: String) {
        self.apiBase = apiBase
        self.apiKey = apiKey
        self.model = model
    }
}

public struct LinkClassifierTestRequest: Codable, Sendable {
    public var apiBase: String
    public var apiKey: String
    public var model: String

    public init(apiBase: String, apiKey: String, model: String) {
        self.apiBase = apiBase
        self.apiKey = apiKey
        self.model = model
    }
}

public struct LinkClassifierTestResult: Codable, Sendable, Equatable {
    public var success: Bool
    public var error: String?

    public init(success: Bool, error: String? = nil) {
        self.success = success
        self.error = error
    }
}

// MARK: - OMP / Agent Status DTOs

public struct OMPStatus: Codable, Sendable, Equatable {
    public var installed: Bool
    public var loggedIn: Bool
    public var version: String?
    public var error: String?
    public var installCommand: String?
    public var loginCommand: String?
    public var docsUrl: String?

    public init(
        installed: Bool = false,
        loggedIn: Bool = false,
        version: String? = nil,
        error: String? = nil,
        installCommand: String? = nil,
        loginCommand: String? = nil,
        docsUrl: String? = nil
    ) {
        self.installed = installed
        self.loggedIn = loggedIn
        self.version = version
        self.error = error
        self.installCommand = installCommand
        self.loginCommand = loginCommand
        self.docsUrl = docsUrl
    }
}

// MARK: - OpenCode Runtime Status DTOs

public struct OpenCodeRuntimeStatus: Codable, Sendable, Equatable {
    public var configured: Bool?
    public var mode: String?
    public var state: String?
    public var available: Bool?
    public var ready: Bool?
    public var host: String?
    public var port: Int?
    public var cliInstalled: Bool?
    public var compatible: Bool?
    public var version: String?
    public var minVersion: String?
    public var lastError: String?
    public var restartCount: Int?

    public init(
        configured: Bool? = nil,
        mode: String? = nil,
        state: String? = nil,
        available: Bool? = nil,
        ready: Bool? = nil,
        host: String? = nil,
        port: Int? = nil,
        cliInstalled: Bool? = nil,
        compatible: Bool? = nil,
        version: String? = nil,
        minVersion: String? = nil,
        lastError: String? = nil,
        restartCount: Int? = nil
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
    }
}

// MARK: - Runtime Services DTOs

public struct RuntimeService: Codable, Sendable, Identifiable, Equatable {
    public var id: String { "\(type):\(name)" }
    public var name: String
    public var type: String
    public var status: String
    public var pid: Int?
    public var port: Int?
    public var uptime: String?
    public var enabledInConfig: Bool
    public var details: [String: String]?

    public init(
        name: String,
        type: String,
        status: String,
        pid: Int? = nil,
        port: Int? = nil,
        uptime: String? = nil,
        enabledInConfig: Bool = true,
        details: [String: String]? = nil
    ) {
        self.name = name
        self.type = type
        self.status = status
        self.pid = pid
        self.port = port
        self.uptime = uptime
        self.enabledInConfig = enabledInConfig
        self.details = details
    }
}

public struct RuntimeServicesResponse: Codable, Sendable {
    public var services: [RuntimeService]

    public init(services: [RuntimeService] = []) {
        self.services = services
    }
}

// MARK: - Auth Password DTOs

public struct PasswordSetRequest: Codable, Sendable {
    public var password: String

    public init(password: String) {
        self.password = password
    }
}

public struct PasswordActionResponse: Codable, Sendable {
    public var success: Bool
    public var protected: Bool?
    public var token: String?

    public init(success: Bool, protected: Bool? = nil, token: String? = nil) {
        self.success = success
        self.protected = protected
        self.token = token
    }
}

// MARK: - Audit DTOs

public struct AuditEvent: Codable, Sendable, Identifiable, Equatable {
    public var id: String { "\(timestamp):\(toolName):\(action ?? ""):\(durationMs)" }
    public var timestamp: String
    public var toolName: String
    public var action: String?
    public var actionClass: String
    public var projectRoot: String?
    public var dryRun: Bool?
    public var result: String
    public var durationMs: Int64
    public var errorMessage: String?
    public var entityRefs: [String]?
    public var argumentSummary: [String: String]?

    public init(
        timestamp: String,
        toolName: String,
        action: String? = nil,
        actionClass: String,
        projectRoot: String? = nil,
        dryRun: Bool? = nil,
        result: String,
        durationMs: Int64,
        errorMessage: String? = nil,
        entityRefs: [String]? = nil,
        argumentSummary: [String: String]? = nil
    ) {
        self.timestamp = timestamp
        self.toolName = toolName
        self.action = action
        self.actionClass = actionClass
        self.projectRoot = projectRoot
        self.dryRun = dryRun
        self.result = result
        self.durationMs = durationMs
        self.errorMessage = errorMessage
        self.entityRefs = entityRefs
        self.argumentSummary = argumentSummary
    }
}

public struct AuditRecentResponse: Codable, Sendable {
    public var events: [AuditEvent]
    public var count: Int

    public init(events: [AuditEvent] = [], count: Int = 0) {
        self.events = events
        self.count = count
    }
}

public struct AuditStats: Codable, Sendable, Equatable {
    public var totalCalls: Int
    public var byTool: [String: Int]
    public var byActionClass: [String: Int]
    public var byResult: [String: Int]
    public var dryRunCount: Int
    public var executeCount: Int
    public var byToolResult: [String: [String: Int]]

    public init(
        totalCalls: Int = 0,
        byTool: [String: Int] = [:],
        byActionClass: [String: Int] = [:],
        byResult: [String: Int] = [:],
        dryRunCount: Int = 0,
        executeCount: Int = 0,
        byToolResult: [String: [String: Int]] = [:]
    ) {
        self.totalCalls = totalCalls
        self.byTool = byTool
        self.byActionClass = byActionClass
        self.byResult = byResult
        self.dryRunCount = dryRunCount
        self.executeCount = executeCount
        self.byToolResult = byToolResult
    }
}
