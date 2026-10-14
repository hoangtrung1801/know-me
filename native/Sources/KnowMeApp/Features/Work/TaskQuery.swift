import Foundation

enum TaskGrouping: String, CaseIterable, Sendable {
    case none = "None", status = "Status", priority = "Priority", assignee = "Assignee", spec = "Spec"
}

struct TaskGroup: Identifiable {
    let id: String
    let title: String
    let tasks: [TaskItem]
}

struct TaskQuery {
    var lifecycle: TaskLifecycleFilter = .current
    var project = "all"
    var priority = "all"
    var status = "all"
    var assignee = "all"
    var label = "all"
    var spec = "all"
    var search = ""
    var sort: TaskSortOption = .order

    var hasFilters: Bool {
        project != "all" || priority != "all" || status != "all" || assignee != "all" || label != "all" || spec != "all" || !search.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    func apply(to tasks: [TaskItem]) -> [TaskItem] {
        let query = search.trimmingCharacters(in: .whitespacesAndNewlines)
        return tasks.filter { task in
            switch lifecycle {
            case .current: if task.isArchived { return false }
            case .active: if task.isArchived || task.isDone { return false }
            case .done: if task.isArchived || !task.isDone { return false }
            case .archived: if !task.isArchived { return false }
            case .all: break
            }
            if project != "all" && (project == "global" ? task.projectId != nil : task.projectId != project) { return false }
            if priority != "all" && task.priority != priority { return false }
            if status != "all" && task.status != status { return false }
            if assignee != "all" && (assignee == "unassigned" ? !(task.assignee ?? "").isEmpty : task.assignee != assignee) { return false }
            if spec != "all" && (spec == "none" ? !(task.spec ?? "").isEmpty : task.spec != spec) { return false }
            if label != "all" && !task.labels.contains(label) { return false }
            let searchable = [task.id, task.title, task.description ?? "", task.assignee ?? ""] + task.labels
            return query.isEmpty || searchable.contains { $0.localizedCaseInsensitiveContains(query) }
        }.sorted { a, b in
            switch sort {
            case .order: if a.order != b.order { return (a.order ?? Int.max) < (b.order ?? Int.max) }
            case .priority: if Self.priorityRank(a.priority) != Self.priorityRank(b.priority) { return Self.priorityRank(a.priority) < Self.priorityRank(b.priority) }
            case .title:
                let result = a.title.localizedCaseInsensitiveCompare(b.title)
                if result != .orderedSame { return result == .orderedAscending }
            case .created: if a.createdDate != b.createdDate { return (a.createdDate ?? .distantPast) > (b.createdDate ?? .distantPast) }
            case .updated: if a.updatedDate != b.updatedDate { return (a.updatedDate ?? .distantPast) > (b.updatedDate ?? .distantPast) }
            }
            // Stable ordering keeps live refreshes from shuffling equal-valued rows.
            return a.id.localizedStandardCompare(b.id) == .orderedAscending
        }
    }

    static func priorityRank(_ priority: String) -> Int {
        switch priority { case "urgent": 0; case "high": 1; case "medium": 2; case "low": 3; default: 4 }
    }

    static func groups(_ tasks: [TaskItem], by grouping: TaskGrouping, statuses: [String]) -> [TaskGroup] {
        guard grouping != .none else { return [TaskGroup(id: "all", title: "Tasks", tasks: tasks)] }
        func key(_ task: TaskItem) -> String {
            switch grouping {
            case .none: return "all"
            case .status: return task.status
            case .priority: return task.priority
            case .assignee: return task.assignee ?? ""
            case .spec: return task.spec ?? ""
            }
        }
        let buckets = Dictionary(grouping: tasks, by: key)
        let keys = buckets.keys.sorted { a, b in
            if grouping == .status {
                let first = statuses.firstIndex(of: a) ?? Int.max, second = statuses.firstIndex(of: b) ?? Int.max
                if first != second { return first < second }
            } else if grouping == .priority, priorityRank(a) != priorityRank(b) { return priorityRank(a) < priorityRank(b) }
            return a.localizedStandardCompare(b) == .orderedAscending
        }
        return keys.map { key in
            TaskGroup(id: key, title: key.isEmpty ? (grouping == .assignee ? "Unassigned" : "No spec") : key, tasks: buckets[key] ?? [])
        }
    }
}
