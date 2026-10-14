import Foundation
import Observation
import KnowMeCore

@MainActor
@Observable
final class WorkStore {
    let model: AppModel
    var configuredStatuses = ["todo", "in-progress", "in-review", "done", "blocked", "on-hold"]
    var visibleColumns = ["todo", "in-progress", "in-review", "done"]
    var canHardDelete = false
    var isReordering = false
    private var taskFetchGeneration: UInt64 = 0

    // Tasks state
    var tasks: [TaskItem] = []
    var historicalTasks: [TaskItem] = []
    var isLoadingTasks = false
    var tasksError: String?
    var selectedTaskID: String?

    // Timers state
    var activeTimers: [ActiveTimerItem] = []
    var isLoadingTimers = false
    var timerError: String?

    // Activities state
    var activities: [ActivityFeedEntry] = []
    var isLoadingActivities = false
    var activitiesError: String?

    // Workspaces CRUD state
    var isMutatingWorkspace = false
    var workspaceError: String?

    init(model: AppModel) {
        self.model = model
    }

    var selectedTask: TaskItem? {
        guard let id = selectedTaskID else { return nil }
        return tasks.first { $0.id == id } ?? historicalTasks.first { $0.id == id }
    }

    // MARK: - Task Loading

    func loadConfiguration() async {
        do {
            let config = try await model.request(path: "/api/config")
            let statuses = config["statuses"].arrayValue.map(\.stringValue).filter { !$0.isEmpty }
            if !statuses.isEmpty { configuredStatuses = statuses }
            let columns = config["visibleColumns"].arrayValue.map(\.stringValue).filter { !$0.isEmpty }
            visibleColumns = config["visibleColumns"] == .null ? configuredStatuses : columns
            canHardDelete = config["capabilities"]["taskHardDelete"].boolValue
        } catch { model.report(error) }
    }

    func statusChoices(including status: String = "") -> [String] {
        configuredStatuses.contains(status) || status.isEmpty ? configuredStatuses : configuredStatuses + [status]
    }

    func fetchTasks(includeHistorical: Bool = false) async {
        guard model.connected else { return }
        taskFetchGeneration &+= 1
        let generation = taskFetchGeneration
        let capturedWorkspace = model.workspace
        isLoadingTasks = true
        tasksError = nil

        do {
            var query: [String: String] = [:]
            if includeHistorical {
                query["includeHistorical"] = "true"
            }
            if let projectID = capturedWorkspace.projectID {
                query["projectId"] = projectID
            }

            let loadedTasks: [TaskItem] = try await model.decode(
                [TaskItem].self,
                method: .GET,
                path: "/api/tasks",
                query: query,
                projectScoped: false
            )

            guard model.workspace == capturedWorkspace, generation == taskFetchGeneration else { return }
            if includeHistorical {
                self.historicalTasks = loadedTasks
            } else {
                self.tasks = loadedTasks
            }
            self.isLoadingTasks = false
        } catch is CancellationError {
            // Workspace changed or cancelled; silently ignore
        } catch {
            guard model.workspace == capturedWorkspace, generation == taskFetchGeneration else { return }
            self.tasksError = error.localizedDescription
            self.isLoadingTasks = false
        }
    }

    func fetchSingleTask(id: String) async throws -> TaskItem {
        let captured = model.workspace
        let path = "/api/tasks/\(APIClient.segment(id))"
        var query: [String: String] = [:]
        if let projectID = captured.projectID {
            query["projectId"] = projectID
        }

        let task: TaskItem = try await model.decode(
            TaskItem.self,
            method: .GET,
            path: path,
            query: query,
            projectScoped: false
        )
        guard model.workspace == captured else { throw CancellationError() }

        // Update local state if present
        if let index = tasks.firstIndex(where: { $0.id == id }) {
            tasks[index] = task
        }
        if let index = historicalTasks.firstIndex(where: { $0.id == id }) {
            historicalTasks[index] = task
        }
        return task
    }

    // MARK: - Task Mutations

    func createTask(
        title: String,
        description: String? = nil,
        status: String = "todo",
        priority: String = "medium",
        assignee: String? = nil,
        labels: [String] = [],
        parent: String? = nil,
        spec: String? = nil,
        fulfills: [String] = [],
        acceptanceCriteria: [AcceptanceCriterionItem] = [],
        implementationPlan: String? = nil,
        implementationNotes: String? = nil,
        global: Bool = false
    ) async throws -> TaskItem {
        let captured = model.workspace
        var bodyFields: [String: JSONValue] = [
            "title": .string(title),
            "status": .string(status),
            "priority": .string(priority),
            "global": .bool(global),
            "labels": .array(labels.map { .string($0) }),
            "fulfills": .array(fulfills.map { .string($0) }),
            "acceptanceCriteria": .array(acceptanceCriteria.map { ac in
                .object(["text": .string(ac.text), "completed": .bool(ac.completed)])
            })
        ]

        if let description, !description.isEmpty { bodyFields["description"] = .string(description) }
        if let assignee, !assignee.isEmpty { bodyFields["assignee"] = .string(assignee) }
        if let parent, !parent.isEmpty { bodyFields["parent"] = .string(parent) }
        if let spec, !spec.isEmpty { bodyFields["spec"] = .string(spec) }
        if let plan = implementationPlan, !plan.isEmpty { bodyFields["implementationPlan"] = .string(plan) }
        if let notes = implementationNotes, !notes.isEmpty { bodyFields["implementationNotes"] = .string(notes) }
        if !global, let projectID = captured.projectID { bodyFields["projectId"] = .string(projectID) }

        var query: [String: String] = [:]
        if !global, let projectID = captured.projectID { query["projectId"] = projectID }

        let created: TaskItem = try await model.decode(
            TaskItem.self,
            method: .POST,
            path: "/api/tasks",
            query: query,
            body: .object(bodyFields),
            projectScoped: false
        )

        guard model.workspace == captured else { throw CancellationError() }
        tasks.insert(created, at: 0)
        return created
    }

    func updateTask(id: String, patch: [String: JSONValue]) async throws -> TaskItem {
        let captured = model.workspace
        let path = "/api/tasks/\(APIClient.segment(id))"
        var query: [String: String] = [:]
        if let projectID = captured.projectID { query["projectId"] = projectID }

        let updated: TaskItem = try await model.decode(
            TaskItem.self,
            method: .PUT,
            path: path,
            query: query,
            body: .object(patch),
            projectScoped: false
        )

        guard model.workspace == captured else { throw CancellationError() }
        if let index = tasks.firstIndex(where: { $0.id == id }) {
            tasks[index] = updated
        }
        if let index = historicalTasks.firstIndex(where: { $0.id == id }) {
            historicalTasks[index] = updated
        }
        return updated
    }

    func reorderTasks(orders: [ReorderItem]) async throws {
        let captured = model.workspace
        let expectedChanges = orders.filter { item in
            tasks.first(where: { $0.scopedID == item.id })?.order != item.order
        }.count
        let body: JSONValue = .object([
            "orders": .array(orders.map { item in
                .object(["id": .string(item.id), "order": .number(Double(item.order))])
            })
        ])

        let response = try await model.request(
            method: .POST,
            path: "/api/tasks/reorder",
            body: body,
            projectScoped: true
        )
        guard model.workspace == captured else { throw CancellationError() }
        guard response["success"].boolValue, response["updated"].numberValue >= Double(expectedChanges) else {
            throw APIError(status: 0, message: "Some task positions could not be saved. The board has been reloaded; try the move again.")
        }
    }

    func moveBoardTask(id: String, status: String, before anchor: String? = nil) async throws {
        guard !isReordering, configuredStatuses.contains(status),
              let moving = tasks.first(where: { $0.scopedID == id }),
              let orders = TaskOrdering.orders(in: tasks, moving: id, to: status, before: anchor) else { return }
        isReordering = true
        defer { isReordering = false }
        do {
            // The server must observe the new status before writing the column order.
            if moving.status != status { _ = try await updateTask(id: id, patch: ["status": .string(status)]) }
            try await reorderTasks(orders: orders)
            if !historicalTasks.isEmpty { await fetchTasks(includeHistorical: true) }
            await fetchTasks()
        } catch {
            // A status update may have succeeded before an ordering failure. Reload
            // canonical state rather than pretending the two requests were atomic.
            if !historicalTasks.isEmpty { await fetchTasks(includeHistorical: true) }
            await fetchTasks()
            throw error
        }
    }

    func syncSpecACs() async throws -> SyncSpecACsResponse {
        let captured = model.workspace
        var query: [String: String] = [:]
        if let projectID = captured.projectID { query["projectId"] = projectID }

        let response: SyncSpecACsResponse = try await model.decode(
            SyncSpecACsResponse.self,
            method: .POST,
            path: "/api/tasks/sync-spec-acs",
            query: query,
            projectScoped: false
        )
        guard model.workspace == captured else { throw CancellationError() }
        return response
    }

    func fetchTaskHistory(id: String) async throws -> TaskVersionHistoryResponse {
        let captured = model.workspace
        let path = "/api/tasks/\(APIClient.segment(id))/history"
        var query: [String: String] = [:]
        if let projectID = captured.projectID { query["projectId"] = projectID }

        let history: TaskVersionHistoryResponse = try await model.decode(
            TaskVersionHistoryResponse.self,
            method: .GET,
            path: path,
            query: query,
            projectScoped: false
        )
        guard model.workspace == captured else { throw CancellationError() }
        return history
    }

    // MARK: - Lifecycle Actions

    func archiveTask(id: String, execute: Bool) async throws -> LifecycleResponse {
        let captured = model.workspace
        let path = "/api/tasks/\(APIClient.segment(id))/archive"
        let body: JSONValue = .object([
            "taskId": .string(id),
            "execute": .bool(execute),
            "actor": .string("native-macos")
        ])
        var query: [String: String] = [:]
        if let projectID = captured.projectID { query["projectId"] = projectID }

        let response: LifecycleResponse = try await model.decode(
            LifecycleResponse.self,
            method: .POST,
            path: path,
            query: query,
            body: body,
            projectScoped: false
        )
        guard model.workspace == captured else { throw CancellationError() }
        if execute {
            await fetchTasks()
        }
        return response
    }

    func unarchiveTask(id: String, execute: Bool, status: String? = nil) async throws -> LifecycleResponse {
        let captured = model.workspace
        let path = "/api/tasks/\(APIClient.segment(id))/unarchive"
        var bodyFields: [String: JSONValue] = [
            "taskId": .string(id),
            "execute": .bool(execute),
            "actor": .string("native-macos")
        ]
        if let status { bodyFields["status"] = .string(status) }
        var query: [String: String] = [:]
        if let projectID = captured.projectID { query["projectId"] = projectID }

        let response: LifecycleResponse = try await model.decode(
            LifecycleResponse.self,
            method: .POST,
            path: path,
            query: query,
            body: .object(bodyFields),
            projectScoped: false
        )
        guard model.workspace == captured else { throw CancellationError() }
        if execute {
            await fetchTasks(includeHistorical: true)
        }
        return response
    }

    func batchArchive(ids: [String]?, minimumAgeMs: Int64?, execute: Bool) async throws -> LifecycleResponse {
        let captured = model.workspace
        var bodyFields: [String: JSONValue] = [
            "execute": .bool(execute),
            "actor": .string("native-macos")
        ]
        if let ids {
            bodyFields["ids"] = .array(ids.map { .string($0) })
        }
        if let minimumAgeMs {
            bodyFields["minimumAgeMs"] = .number(Double(minimumAgeMs))
        }
        var query: [String: String] = [:]
        if let projectID = captured.projectID { query["projectId"] = projectID }

        let response: LifecycleResponse = try await model.decode(
            LifecycleResponse.self,
            method: .POST,
            path: "/api/tasks/batch-archive",
            query: query,
            body: .object(bodyFields),
            projectScoped: false
        )
        guard model.workspace == captured else { throw CancellationError() }
        if execute {
            await fetchTasks()
        }
        return response
    }

    func batchUnarchive(ids: [String], status: String? = nil, execute: Bool) async throws -> LifecycleResponse {
        let captured = model.workspace
        var bodyFields: [String: JSONValue] = [
            "ids": .array(ids.map { .string($0) }),
            "execute": .bool(execute),
            "actor": .string("native-macos")
        ]
        if let status { bodyFields["status"] = .string(status) }
        var query: [String: String] = [:]
        if let projectID = captured.projectID { query["projectId"] = projectID }

        let response: LifecycleResponse = try await model.decode(
            LifecycleResponse.self,
            method: .POST,
            path: "/api/tasks/batch-unarchive",
            query: query,
            body: .object(bodyFields),
            projectScoped: false
        )
        guard model.workspace == captured else { throw CancellationError() }
        if execute {
            await fetchTasks(includeHistorical: true)
        }
        return response
    }

    func hardDeleteTask(id: String, reason: String, confirmed: Bool) async throws -> LifecycleResponse {
        let captured = model.workspace
        let path = "/api/tasks/\(APIClient.segment(id))/hard-delete"
        let body: JSONValue = .object([
            "taskId": .string(id),
            "reason": .string(reason),
            "confirmed": .bool(confirmed),
            "execute": .bool(confirmed),
            "actor": .string("native-macos")
        ])
        var query: [String: String] = [:]
        if let projectID = captured.projectID { query["projectId"] = projectID }

        let response: LifecycleResponse = try await model.decode(
            LifecycleResponse.self,
            method: .POST,
            path: path,
            query: query,
            body: body,
            projectScoped: false
        )
        guard model.workspace == captured else { throw CancellationError() }
        tasks.removeAll { $0.id == id }
        historicalTasks.removeAll { $0.id == id }
        if selectedTaskID == id { selectedTaskID = nil }
        return response
    }

    // MARK: - Time Tracking Actions

    func fetchTimers() async {
        guard model.connected else { return }
        let captured = model.workspace
        isLoadingTimers = true
        timerError = nil

        do {
            let state: TimeStateResponse = try await model.decode(
                TimeStateResponse.self,
                method: .GET,
                path: "/api/time/status",
                projectScoped: false
            )
            guard model.workspace == captured else { return }
            self.activeTimers = state.active
            self.isLoadingTimers = false
        } catch is CancellationError {
        } catch {
            guard model.workspace == captured else { return }
            self.timerError = error.localizedDescription
            self.isLoadingTimers = false
        }
    }

    func startTimer(taskID: String) async throws {
        let captured = model.workspace
        let body: JSONValue = .object(["taskId": .string(taskID)])
        _ = try await model.request(
            method: .POST,
            path: "/api/time/start",
            body: body,
            projectScoped: false
        )
        guard model.workspace == captured else { throw CancellationError() }
        await fetchTimers()
        _ = try? await fetchSingleTask(id: taskID)
    }

    func stopTimer(taskID: String? = nil, all: Bool = false) async throws {
        let captured = model.workspace
        var fields: [String: JSONValue] = ["all": .bool(all)]
        if let taskID { fields["taskId"] = .string(taskID) }

        _ = try await model.request(
            method: .POST,
            path: "/api/time/stop",
            body: .object(fields),
            projectScoped: false
        )
        guard model.workspace == captured else { throw CancellationError() }
        await fetchTimers()
        if let taskID {
            _ = try? await fetchSingleTask(id: taskID)
        } else {
            await fetchTasks()
        }
    }

    func pauseTimer(taskID: String) async throws {
        let captured = model.workspace
        let body: JSONValue = .object(["taskId": .string(taskID)])
        _ = try await model.request(
            method: .POST,
            path: "/api/time/pause",
            body: body,
            projectScoped: false
        )
        guard model.workspace == captured else { throw CancellationError() }
        await fetchTimers()
        _ = try? await fetchSingleTask(id: taskID)
    }

    func resumeTimer(taskID: String) async throws {
        let captured = model.workspace
        let body: JSONValue = .object(["taskId": .string(taskID)])
        _ = try await model.request(
            method: .POST,
            path: "/api/time/resume",
            body: body,
            projectScoped: false
        )
        guard model.workspace == captured else { throw CancellationError() }
        await fetchTimers()
        _ = try? await fetchSingleTask(id: taskID)
    }

    func addManualTime(taskID: String, durationSeconds: Int, note: String?, startedAt: Date? = nil) async throws {
        let captured = model.workspace
        var fields: [String: JSONValue] = [
            "taskId": .string(taskID),
            "duration": .number(Double(durationSeconds))
        ]
        if let note, !note.isEmpty { fields["note"] = .string(note) }
        if let startedAt { fields["startedAt"] = .string(ISO8601Parser.format(startedAt)) }

        _ = try await model.request(
            method: .POST,
            path: "/api/time/add",
            body: .object(fields),
            projectScoped: false
        )
        guard model.workspace == captured else { throw CancellationError() }
        _ = try? await fetchSingleTask(id: taskID)
    }

    // MARK: - Activities Feed

    func fetchActivities(limit: Int = 20, typeFilter: String? = nil) async {
        guard model.connected else { return }
        let captured = model.workspace
        isLoadingActivities = true
        activitiesError = nil

        var query: [String: String] = ["limit": "\(limit)"]
        if let typeFilter, !typeFilter.isEmpty { query["type"] = typeFilter }

        do {
            let response: ActivityFeedResponse = try await model.decode(
                ActivityFeedResponse.self,
                method: .GET,
                path: "/api/activities",
                query: query,
                projectScoped: false
            )
            guard model.workspace == captured else { return }
            self.activities = response.activities
            self.isLoadingActivities = false
        } catch is CancellationError {
        } catch {
            guard model.workspace == captured else { return }
            self.activitiesError = error.localizedDescription
            self.isLoadingActivities = false
        }
    }

    // MARK: - Workspace CRUD

    func createWorkspace(name: String, path: String?) async throws -> WorkspaceProject {
        isMutatingWorkspace = true
        defer { isMutatingWorkspace = false }

        var bodyFields: [String: JSONValue] = ["name": .string(name)]
        if let path, !path.isEmpty { bodyFields["path"] = .string(path) }

        let project: WorkspaceProject = try await model.decode(
            WorkspaceProject.self,
            method: .POST,
            path: "/api/workspaces",
            body: .object(bodyFields),
            projectScoped: false
        )

        try await model.reloadProjects()
        return project
    }

    func updateWorkspace(id: String, name: String, path: String?) async throws -> WorkspaceProject {
        isMutatingWorkspace = true
        defer { isMutatingWorkspace = false }

        let bodyFields: [String: JSONValue] = [
            "name": .string(name),
            "path": .string(path ?? "")
        ]

        let project: WorkspaceProject = try await model.decode(
            WorkspaceProject.self,
            method: .PATCH,
            path: "/api/workspaces/\(APIClient.segment(id))",
            body: .object(bodyFields),
            projectScoped: false
        )

        try await model.reloadProjects()
        return project
    }

    func deleteWorkspace(id: String) async throws {
        isMutatingWorkspace = true
        defer { isMutatingWorkspace = false }

        _ = try await model.request(
            method: .DELETE,
            path: "/api/workspaces/\(APIClient.segment(id))",
            projectScoped: false
        )

        try await model.reloadProjects()
        if model.workspace.projectID == id {
            await model.selectProject(nil)
        }
    }

    // MARK: - Scoped Search

    func search(
        query: String,
        type: String = "all",
        mode: String = "hybrid",
        limit: Int = 20,
        projectScoped: Bool = false
    ) async throws -> SearchResponsePayload {
        let captured = model.workspace
        var queryParams: [String: String] = [
            "q": query,
            "type": type,
            "mode": mode,
            "limit": "\(limit)"
        ]
        if projectScoped, let projectID = captured.projectID {
            queryParams["projectId"] = projectID
        }

        let payload: SearchResponsePayload = try await model.decode(
            SearchResponsePayload.self,
            method: .GET,
            path: "/api/search",
            query: queryParams,
            projectScoped: false
        )
        guard model.workspace == captured else { throw CancellationError() }
        return payload
    }
}
