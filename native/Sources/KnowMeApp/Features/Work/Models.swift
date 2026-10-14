import Foundation
import KnowMeCore

// MARK: - Task Models

struct TaskItem: Codable, Sendable, Identifiable, Equatable, Hashable {
    var id: String
    var projectId: String?
    var title: String
    var description: String?
    var status: String
    var priority: String
    var assignee: String?
    var labels: [String]
    var parent: String?
    var subtasks: [String]
    var spec: String?
    var fulfills: [String]
    var order: Int?
    var createdAt: String?
    var updatedAt: String?
    var completedAt: String?
    var archivedAt: String?
    var archived: Bool
    var acceptanceCriteria: [AcceptanceCriterionItem]
    var timeSpent: Int
    var timeEntries: [TimeEntryItem]
    var activeTimer: ActiveTimerItem?
    var implementationPlan: String?
    var implementationNotes: String?
    var lifecycleState: String?

    init(
        id: String,
        projectId: String? = nil,
        title: String,
        description: String? = nil,
        status: String = "todo",
        priority: String = "medium",
        assignee: String? = nil,
        labels: [String] = [],
        parent: String? = nil,
        subtasks: [String] = [],
        spec: String? = nil,
        fulfills: [String] = [],
        order: Int? = nil,
        createdAt: String? = nil,
        updatedAt: String? = nil,
        completedAt: String? = nil,
        archivedAt: String? = nil,
        archived: Bool = false,
        acceptanceCriteria: [AcceptanceCriterionItem] = [],
        timeSpent: Int = 0,
        timeEntries: [TimeEntryItem] = [],
        activeTimer: ActiveTimerItem? = nil,
        implementationPlan: String? = nil,
        implementationNotes: String? = nil,
        lifecycleState: String? = nil
    ) {
        self.id = id
        self.projectId = projectId
        self.title = title
        self.description = description
        self.status = status
        self.priority = priority
        self.assignee = assignee
        self.labels = labels
        self.parent = parent
        self.subtasks = subtasks
        self.spec = spec
        self.fulfills = fulfills
        self.order = order
        self.createdAt = createdAt
        self.updatedAt = updatedAt
        self.completedAt = completedAt
        self.archivedAt = archivedAt
        self.archived = archived
        self.acceptanceCriteria = acceptanceCriteria
        self.timeSpent = timeSpent
        self.timeEntries = timeEntries
        self.activeTimer = activeTimer
        self.implementationPlan = implementationPlan
        self.implementationNotes = implementationNotes
        self.lifecycleState = lifecycleState
    }

    enum CodingKeys: String, CodingKey {
        case id, projectId, title, description, status, priority, assignee, labels
        case parent, subtasks, spec, fulfills, order
        case createdAt, updatedAt, completedAt, archivedAt, archived
        case acceptanceCriteria, timeSpent, timeEntries, activeTimer
        case implementationPlan, implementationNotes, lifecycleState
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        self.id = try container.decode(String.self, forKey: .id)
        self.projectId = try container.decodeIfPresent(String.self, forKey: .projectId)
        self.title = try container.decodeIfPresent(String.self, forKey: .title) ?? "Untitled Task"
        self.description = try container.decodeIfPresent(String.self, forKey: .description)
        self.status = try container.decodeIfPresent(String.self, forKey: .status) ?? "todo"
        self.priority = try container.decodeIfPresent(String.self, forKey: .priority) ?? "medium"
        self.assignee = try container.decodeIfPresent(String.self, forKey: .assignee)
        self.labels = try container.decodeIfPresent([String].self, forKey: .labels) ?? []
        self.parent = try container.decodeIfPresent(String.self, forKey: .parent)
        self.subtasks = try container.decodeIfPresent([String].self, forKey: .subtasks) ?? []
        self.spec = try container.decodeIfPresent(String.self, forKey: .spec)
        self.fulfills = try container.decodeIfPresent([String].self, forKey: .fulfills) ?? []
        self.order = try container.decodeIfPresent(Int.self, forKey: .order)
        self.createdAt = try container.decodeIfPresent(String.self, forKey: .createdAt)
        self.updatedAt = try container.decodeIfPresent(String.self, forKey: .updatedAt)
        self.completedAt = try container.decodeIfPresent(String.self, forKey: .completedAt)
        self.archivedAt = try container.decodeIfPresent(String.self, forKey: .archivedAt)
        self.archived = try container.decodeIfPresent(Bool.self, forKey: .archived) ?? false
        self.acceptanceCriteria = try container.decodeIfPresent([AcceptanceCriterionItem].self, forKey: .acceptanceCriteria) ?? []
        self.timeSpent = try container.decodeIfPresent(Int.self, forKey: .timeSpent) ?? 0
        self.timeEntries = try container.decodeIfPresent([TimeEntryItem].self, forKey: .timeEntries) ?? []
        self.activeTimer = try container.decodeIfPresent(ActiveTimerItem.self, forKey: .activeTimer)
        self.implementationPlan = try container.decodeIfPresent(String.self, forKey: .implementationPlan)
        self.implementationNotes = try container.decodeIfPresent(String.self, forKey: .implementationNotes)
        self.lifecycleState = try container.decodeIfPresent(String.self, forKey: .lifecycleState)
    }

    var effectiveLifecycleState: String {
        if let state = lifecycleState, !state.isEmpty { return state }
        if archived { return "archived" }
        if status.lowercased() == "done" { return "done" }
        return "active"
    }

    var isArchived: Bool {
        archived || effectiveLifecycleState == "archived"
    }

    var isDone: Bool {
        effectiveLifecycleState == "done" || status.lowercased() == "done"
    }

    var createdDate: Date? {
        ISO8601Parser.parse(createdAt)
    }

    var updatedDate: Date? {
        ISO8601Parser.parse(updatedAt)
    }

    var completedDate: Date? {
        ISO8601Parser.parse(completedAt)
    }

    var completedAcceptanceCriteriaCount: Int {
        acceptanceCriteria.filter(\.completed).count
    }

    var acceptanceCriteriaProgress: Double {
        guard !acceptanceCriteria.isEmpty else { return 0 }
        return Double(completedAcceptanceCriteriaCount) / Double(acceptanceCriteria.count)
    }
}

struct AcceptanceCriterionItem: Codable, Sendable, Identifiable, Equatable, Hashable {
    var id: String { text }
    var text: String
    var completed: Bool

    init(text: String, completed: Bool = false) {
        self.text = text
        self.completed = completed
    }
}

// MARK: - Time Tracking Models

struct TimeEntryItem: Codable, Sendable, Identifiable, Equatable, Hashable {
    var id: String
    var startedAt: String
    var endedAt: String?
    var duration: Int
    var note: String?

    init(id: String, startedAt: String, endedAt: String? = nil, duration: Int = 0, note: String? = nil) {
        self.id = id
        self.startedAt = startedAt
        self.endedAt = endedAt
        self.duration = duration
        self.note = note
    }

    var startedDate: Date? { ISO8601Parser.parse(startedAt) }
    var endedDate: Date? { ISO8601Parser.parse(endedAt) }
}

struct ActiveTimerItem: Codable, Sendable, Identifiable, Equatable, Hashable {
    var id: String { taskId }
    var taskId: String
    var taskTitle: String?
    var startedAt: String
    var pausedAt: String?
    var totalPausedMs: Int64

    init(taskId: String, taskTitle: String? = nil, startedAt: String, pausedAt: String? = nil, totalPausedMs: Int64 = 0) {
        self.taskId = taskId
        self.taskTitle = taskTitle
        self.startedAt = startedAt
        self.pausedAt = pausedAt
        self.totalPausedMs = totalPausedMs
    }

    var isPaused: Bool {
        pausedAt != nil
    }

    var startedDate: Date? {
        ISO8601Parser.parse(startedAt)
    }

    var pausedDate: Date? {
        ISO8601Parser.parse(pausedAt)
    }

    /// Calculate elapsed active seconds up to now
    func elapsedSeconds(now: Date = Date()) -> Int {
        guard let start = startedDate else { return 0 }
        let end = pausedDate ?? now
        let totalElapsedMs = Int64(end.timeIntervalSince(start) * 1000)
        let activeMs = max(0, totalElapsedMs - totalPausedMs)
        return Int(activeMs / 1000)
    }
}

struct TimeStateResponse: Codable, Sendable {
    var active: [ActiveTimerItem]
    init(active: [ActiveTimerItem] = []) {
        self.active = active
    }
}

// MARK: - Lifecycle Models

struct LifecycleReason: Codable, Sendable, Equatable, Hashable {
    var code: String
    var message: String
    var relatedTaskId: String?
    var deadline: String?
}

struct LifecycleWarning: Codable, Sendable, Equatable, Hashable {
    var code: String
    var message: String
    var references: [String]?
}

struct LifecycleItemResult: Codable, Sendable, Identifiable, Equatable {
    var id: String { taskId }
    var taskId: String
    var operation: String
    var changed: Bool
    var eligible: Bool
    var before: String
    var after: String
    var reasons: [LifecycleReason]
    var warnings: [LifecycleWarning]
    var completedAt: String?
    var archivedAt: String?
    var deadline: String?

    enum CodingKeys: String, CodingKey {
        case taskId, operation, changed, eligible, before, after, reasons, warnings, completedAt, archivedAt, deadline
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        self.taskId = try container.decode(String.self, forKey: .taskId)
        self.operation = try container.decodeIfPresent(String.self, forKey: .operation) ?? ""
        self.changed = try container.decodeIfPresent(Bool.self, forKey: .changed) ?? false
        self.eligible = try container.decodeIfPresent(Bool.self, forKey: .eligible) ?? false
        self.before = try container.decodeIfPresent(String.self, forKey: .before) ?? ""
        self.after = try container.decodeIfPresent(String.self, forKey: .after) ?? ""
        self.reasons = try container.decodeIfPresent([LifecycleReason].self, forKey: .reasons) ?? []
        self.warnings = try container.decodeIfPresent([LifecycleWarning].self, forKey: .warnings) ?? []
        self.completedAt = try container.decodeIfPresent(String.self, forKey: .completedAt)
        self.archivedAt = try container.decodeIfPresent(String.self, forKey: .archivedAt)
        self.deadline = try container.decodeIfPresent(String.self, forKey: .deadline)
    }
}

struct LifecycleResponse: Codable, Sendable {
    var operation: String
    var execute: Bool
    var completed: Bool
    var processed: Int
    var changed: Int
    var failedTaskId: String?
    var items: [LifecycleItemResult]

    enum CodingKeys: String, CodingKey {
        case operation, execute, completed, processed, changed, failedTaskId, items
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        self.operation = try container.decodeIfPresent(String.self, forKey: .operation) ?? ""
        self.execute = try container.decodeIfPresent(Bool.self, forKey: .execute) ?? false
        self.completed = try container.decodeIfPresent(Bool.self, forKey: .completed) ?? false
        self.processed = try container.decodeIfPresent(Int.self, forKey: .processed) ?? 0
        self.changed = try container.decodeIfPresent(Int.self, forKey: .changed) ?? 0
        self.failedTaskId = try container.decodeIfPresent(String.self, forKey: .failedTaskId)
        self.items = try container.decodeIfPresent([LifecycleItemResult].self, forKey: .items) ?? []
    }
}

// MARK: - Reorder and Spec Sync

struct ReorderItem: Codable, Sendable {
    var id: String
    var order: Int
    init(id: String, order: Int) {
        self.id = id
        self.order = order
    }
}

struct ReorderRequest: Codable, Sendable {
    var orders: [ReorderItem]
    init(orders: [ReorderItem]) {
        self.orders = orders
    }
}

struct SyncSpecACsResponse: Codable, Sendable {
    var success: Bool
    var synced: Int
}

// MARK: - History and Versions

struct TaskChangeItem: Codable, Sendable, Identifiable, Equatable {
    var id: String { field }
    var field: String
    var oldValue: JSONValue?
    var newValue: JSONValue?

    enum CodingKeys: String, CodingKey {
        case field, oldValue, newValue
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        self.field = try container.decode(String.self, forKey: .field)
        self.oldValue = try container.decodeIfPresent(JSONValue.self, forKey: .oldValue)
        self.newValue = try container.decodeIfPresent(JSONValue.self, forKey: .newValue)
    }
}

struct TaskVersionItem: Codable, Sendable, Identifiable, Equatable {
    var id: String
    var taskId: String
    var version: Int
    var timestamp: String
    var author: String?
    var changes: [TaskChangeItem]

    enum CodingKeys: String, CodingKey {
        case id, taskId, version, timestamp, author, changes
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        self.id = try container.decodeIfPresent(String.self, forKey: .id) ?? "v\(try container.decodeIfPresent(Int.self, forKey: .version) ?? 1)"
        self.taskId = try container.decode(String.self, forKey: .taskId)
        self.version = try container.decodeIfPresent(Int.self, forKey: .version) ?? 1
        self.timestamp = try container.decodeIfPresent(String.self, forKey: .timestamp) ?? ""
        self.author = try container.decodeIfPresent(String.self, forKey: .author)
        self.changes = try container.decodeIfPresent([TaskChangeItem].self, forKey: .changes) ?? []
    }

    var date: Date? {
        ISO8601Parser.parse(timestamp)
    }
}

struct TaskVersionHistoryResponse: Codable, Sendable {
    var taskId: String
    var currentVersion: Int
    var versions: [TaskVersionItem]

    enum CodingKeys: String, CodingKey {
        case taskId, currentVersion, versions
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        self.taskId = try container.decodeIfPresent(String.self, forKey: .taskId) ?? ""
        self.currentVersion = try container.decodeIfPresent(Int.self, forKey: .currentVersion) ?? 1
        self.versions = try container.decodeIfPresent([TaskVersionItem].self, forKey: .versions) ?? []
    }
}

// MARK: - Activity Feed

struct ActivityFeedEntry: Codable, Sendable, Identifiable, Equatable {
    var id: String { "\(taskId)-v\(version)" }
    var taskId: String
    var taskTitle: String
    var version: Int
    var timestamp: String
    var author: String?
    var changes: [TaskChangeItem]

    enum CodingKeys: String, CodingKey {
        case taskId, taskTitle, version, timestamp, author, changes
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        self.taskId = try container.decode(String.self, forKey: .taskId)
        self.taskTitle = try container.decodeIfPresent(String.self, forKey: .taskTitle) ?? "Untitled Task"
        self.version = try container.decodeIfPresent(Int.self, forKey: .version) ?? 1
        self.timestamp = try container.decodeIfPresent(String.self, forKey: .timestamp) ?? ""
        self.author = try container.decodeIfPresent(String.self, forKey: .author)
        self.changes = try container.decodeIfPresent([TaskChangeItem].self, forKey: .changes) ?? []
    }

    var date: Date? {
        ISO8601Parser.parse(timestamp)
    }
}

struct ActivityFeedResponse: Codable, Sendable {
    var activities: [ActivityFeedEntry]
    init(activities: [ActivityFeedEntry] = []) {
        self.activities = activities
    }
}

// MARK: - Search Models

struct SearchHitItem: Codable, Sendable, Identifiable, Equatable {
    var type: String
    var id: String
    var projectId: String?
    var title: String
    var score: Double?
    var snippet: String?
    var matchedBy: [String]?

    // Task fields
    var status: String?
    var priority: String?
    var lifecycleState: String?

    // Doc fields
    var path: String?
    var tags: [String]?

    // Memory fields
    var memoryLayer: String?
    var category: String?

    // Code fields
    var name: String?
    var signature: String?

    enum CodingKeys: String, CodingKey {
        case type, id, projectId, title, score, snippet, matchedBy
        case status, priority, lifecycleState, path, tags
        case memoryLayer, category, name, signature
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        self.type = try container.decodeIfPresent(String.self, forKey: .type) ?? "unknown"
        self.id = try container.decodeIfPresent(String.self, forKey: .id) ?? UUID().uuidString
        self.projectId = try container.decodeIfPresent(String.self, forKey: .projectId)
        self.title = try container.decodeIfPresent(String.self, forKey: .title) ?? ""
        self.score = try container.decodeIfPresent(Double.self, forKey: .score)
        self.snippet = try container.decodeIfPresent(String.self, forKey: .snippet)
        self.matchedBy = try container.decodeIfPresent([String].self, forKey: .matchedBy)
        self.status = try container.decodeIfPresent(String.self, forKey: .status)
        self.priority = try container.decodeIfPresent(String.self, forKey: .priority)
        self.lifecycleState = try container.decodeIfPresent(String.self, forKey: .lifecycleState)
        self.path = try container.decodeIfPresent(String.self, forKey: .path)
        self.tags = try container.decodeIfPresent([String].self, forKey: .tags)
        self.memoryLayer = try container.decodeIfPresent(String.self, forKey: .memoryLayer)
        self.category = try container.decodeIfPresent(String.self, forKey: .category)
        self.name = try container.decodeIfPresent(String.self, forKey: .name)
        self.signature = try container.decodeIfPresent(String.self, forKey: .signature)
    }
}

struct SearchResponsePayload: Codable, Sendable {
    var tasks: [SearchHitItem]?
    var docs: [SearchHitItem]?
    var memories: [SearchHitItem]?
    var decisions: [SearchHitItem]?
    var code: [SearchHitItem]?

    var allHits: [SearchHitItem] {
        var result: [SearchHitItem] = []
        if let tasks { result.append(contentsOf: tasks) }
        if let docs { result.append(contentsOf: docs) }
        if let memories { result.append(contentsOf: memories) }
        if let decisions { result.append(contentsOf: decisions) }
        if let code { result.append(contentsOf: code) }
        return result
    }
}

// MARK: - ISO8601 Helper

enum ISO8601Parser: Sendable {
    static func parse(_ string: String?) -> Date? {
        guard let s = string?.trimmingCharacters(in: .whitespacesAndNewlines), !s.isEmpty else { return nil }
        let withFractional = ISO8601DateFormatter()
        withFractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let d = withFractional.date(from: s) { return d }
        let standard = ISO8601DateFormatter()
        standard.formatOptions = [.withInternetDateTime]
        return standard.date(from: s)
    }

    static func format(_ date: Date) -> String {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime]
        return formatter.string(from: date)
    }

    static func relativeString(from date: Date?) -> String {
        guard let date else { return "Never" }
        let formatter = RelativeDateTimeFormatter()
        formatter.unitsStyle = .abbreviated
        return formatter.localizedString(for: date, relativeTo: Date())
    }
}
