import SwiftUI
import AppKit
import KnowMeCore

struct TasksView: View {
    @Bindable var model: AppModel
    @State private var store: WorkStore?

    // View mode: List vs Board (Kanban)
    @State private var viewMode: TaskViewMode = .list

    // Filters
    @State private var projectFilter: String = "all"
    @State private var lifecycleFilter: TaskLifecycleFilter = .current
    @State private var priorityFilter: String = "all"
    @State private var statusFilter: String = "all"
    @State private var assigneeFilter = "all"
    @State private var labelFilter = "all"
    @State private var specFilter = "all"
    @State private var grouping: TaskGrouping = .status
    @State private var showFilters = false
    @State private var searchFilter: String = ""

    // Sorting
    @State private var sortOption: TaskSortOption = .order

    // Creation Sheet
    @State private var showCreateSheet = false
    @State private var newTitle = ""
    @State private var newDescription = ""
    @State private var newStatus = "todo"
    @State private var newPriority = "medium"
    @State private var newAssignee = ""
    @State private var newLabelsText = ""
    @State private var newSpec = ""
    @State private var newFulfillsText = ""
    @State private var newParent = ""
    @State private var newCriteria: [AcceptanceCriterionItem] = []
    @State private var newCriteriaInput = ""
    @State private var isCreatingGlobal = false
    @State private var createError: String?

    // Batch Archive Modal
    @State private var showBatchArchiveModal = false
    @State private var batchArchiveAgeDays: Int = 14
    @State private var batchArchivePreviewResponse: LifecycleResponse?
    @State private var isPreviewingBatchArchive = false
    @State private var isExecutingBatchArchive = false
    @State private var batchArchiveError: String?

    // Batch Unarchive Modal
    @State private var showBatchUnarchiveModal = false
    @State private var batchUnarchivePreviewResponse: LifecycleResponse?
    @State private var isPreviewingBatchUnarchive = false
    @State private var isExecutingBatchUnarchive = false
    @State private var batchUnarchiveError: String?

    // Detail Sheet / Inspector
    @State private var inspectingTask: TaskItem?

    // Live timer tick
    @State private var timerTick = Date()

    init(model: AppModel) {
        self.model = model
    }

    private var activeStore: WorkStore {
        if let store { return store }
        let newStore = WorkStore(model: model)
        return newStore
    }

    var body: some View {
        Group {
            if let store {
                content(store)
            } else {
                ProgressView("Loading tasks...")
            }
        }
        .task(id: model.workspaceKey) {
            let s = WorkStore(model: model)
            self.store = s
            resetFilters()
            await s.loadConfiguration()
            await loadTasksAndTimers(s)
            await openPendingTask(s)
            restoreCreateDraft()
        }
        .onChange(of: model.pendingTaskID) { _, _ in
            if let store { Task { await openPendingTask(store) } }
        }
        .onChange(of: model.showCreate) { _, show in
            if show { model.showCreate = false; showCreateSheet = true }
        }
        .onChange(of: model.eventSequence) { _, _ in
            if let store { Task { await loadTasksAndTimers(store) } }
        }
        .onReceive(Timer.publish(every: 1, on: .main, in: .common).autoconnect()) { now in
            timerTick = now
        }
        .sheet(isPresented: $showCreateSheet) {
            createTaskSheet(activeStore)
        }
        .sheet(item: $inspectingTask) { task in
            TaskDetailModal(task: task, store: activeStore, model: model) { updated in
                self.inspectingTask = updated
            }
        }
        .sheet(isPresented: $showBatchArchiveModal) {
            batchArchiveSheet(activeStore)
        }
        .sheet(isPresented: $showBatchUnarchiveModal) {
            batchUnarchiveSheet(activeStore)
        }
    }

    private func openPendingTask(_ store: WorkStore) async {
        guard let id = model.pendingTaskID else { return }
        do {
            let task = try await store.fetchSingleTask(id: id)
            if !store.tasks.contains(where: { $0.id == task.id }) && !store.historicalTasks.contains(where: { $0.id == task.id }) {
                store.historicalTasks.append(task)
            }
            guard model.pendingTaskID == id else { return }
            if task.isArchived {
                lifecycleFilter = .all
                await store.fetchTasks(includeHistorical: true)
            } else { lifecycleFilter = .current }
            resetFilters()
            store.selectedTaskID = task.id
            model.pendingTaskID = nil
        } catch { model.report(error) }
    }

    private func loadTasksAndTimers(_ store: WorkStore) async {
        let includeHist = lifecycleFilter == .archived || lifecycleFilter == .all
        async let tLoad: () = store.fetchTasks(includeHistorical: includeHist)
        async let tmLoad: () = store.fetchTimers()
        _ = await (tLoad, tmLoad)
    }

    @ViewBuilder
    private func content(_ store: WorkStore) -> some View {
        VStack(spacing: 0) {
            toolbar(store)
            Divider()

            if let err = store.tasksError {
                HStack {
                    Image(systemName: "exclamationmark.triangle.fill").foregroundStyle(.yellow)
                    Text(err).font(.callout)
                    Spacer()
                    Button("Retry") { Task { await loadTasksAndTimers(store) } }
                }
                .padding(12)
                .background(Color.yellow.opacity(0.12))
            }

            let filtered = filteredTasks(store)

            if store.isLoadingTasks && filtered.isEmpty {
                VStack(spacing: 12) {
                    ProgressView()
                    Text("Loading tasks...").foregroundStyle(.secondary)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if filtered.isEmpty {
                ContentUnavailableView(
                    "No Tasks Found",
                    systemImage: "checklist",
                    description: Text(searchFilter.isEmpty ? "No tasks in this view. Create a new task to get started." : "No tasks match query '\(searchFilter)'.")
                )
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                HStack(spacing: 0) {
                    Group {
                        switch viewMode {
                        case .list:
                            TaskListView(
                                tasks: filtered,
                                store: store,
                                timerTick: timerTick,
                                grouping: grouping,
                                onSelect: { task in
                                    store.selectedTaskID = task.id
                                    model.inspectorVisible = true
                                }
                            )
                        case .board:
                            TaskBoardView(
                                tasks: filtered,
                                store: store,
                                timerTick: timerTick,
                                onManualOrder: { sortOption = .order },
                                onSelect: { task in
                                    store.selectedTaskID = task.id
                                    model.inspectorVisible = true
                                }
                            )
                        }
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity)

                    if model.inspectorVisible, let selected = store.selectedTask {
                        Divider()
                        TaskDetailInspector(task: selected, store: store, model: model) { updated in
                            store.selectedTaskID = updated.id
                        }
                        .frame(width: 360)
                        .id(selected.id)
                    }
                }
            }
        }
    }

    // MARK: - Toolbar

    private func toolbar(_ store: WorkStore) -> some View {
        VStack(spacing: 12) {
            HStack(spacing: 12) {
                // View Mode Picker
                Picker("View", selection: $viewMode) {
                    Label("List", systemImage: "list.bullet").tag(TaskViewMode.list)
                    Label("Board", systemImage: "square.grid.3x2").tag(TaskViewMode.board)
                }
                .pickerStyle(.segmented)
                .frame(width: 140)

                Button {
                    showFilters.toggle()
                } label: {
                    Label(taskQuery.hasFilters ? "Filters •" : "Filters", systemImage: "line.3.horizontal.decrease.circle")
                }
                .popover(isPresented: $showFilters, arrowEdge: .bottom) {
                    filterForm(store)
                }

                Spacer()

                // Batch Actions Menu
                Menu {
                    Button("Batch Archive Completed...") {
                        showBatchArchiveModal = true
                        Task { await previewBatchArchive(store) }
                    }
                    Button("Batch Restore Archived...") {
                        showBatchUnarchiveModal = true
                        Task { await previewBatchUnarchive(store) }
                    }
                    Divider()
                    Button("Sync Spec Acceptance Criteria") {
                        Task {
                            do {
                                let res = try await store.syncSpecACs()
                                model.report(APIError(status: 200, message: "Synced \(res.synced) spec acceptance criteria."))
                            } catch {
                                model.report(error)
                            }
                        }
                    }
                } label: {
                    Label("Batch", systemImage: "ellipsis.circle")
                }

                // Refresh Button
                Button {
                    Task { await loadTasksAndTimers(store) }
                } label: {
                    Image(systemName: "arrow.clockwise")
                }
                .disabled(store.isLoadingTasks)

                // New Task Button
                Button {
                    restoreCreateDraft()
                    showCreateSheet = true
                } label: {
                    Label("New Task", systemImage: "plus")
                }
                .buttonStyle(.borderedProminent)
                .tint(WorkspaceStyle.accent)
            }

            // Search filter
            HStack {
                Image(systemName: "magnifyingglass").foregroundStyle(.secondary)
                TextField("Search ID, title, description, assignee, or label…", text: $searchFilter)
                    .textFieldStyle(.plain)
                if !searchFilter.isEmpty {
                    Button { searchFilter = "" } label: {
                        Image(systemName: "xmark.circle.fill").foregroundStyle(.secondary)
                    }
                    .buttonStyle(.plain)
                }
                if taskQuery.hasFilters {
                    Button("Reset Filters") { resetFilters() }.buttonStyle(.borderless)
                }
            }
            .padding(8)
            .background(Color(nsColor: .controlBackgroundColor))
            .clipShape(RoundedRectangle(cornerRadius: 6))
        }
        .padding(16)
    }

    // MARK: - Filtering & Sorting

    private var taskQuery: TaskQuery {
        TaskQuery(lifecycle: lifecycleFilter, project: projectFilter, priority: priorityFilter, status: statusFilter,
                  assignee: assigneeFilter, label: labelFilter, spec: specFilter, search: searchFilter, sort: sortOption)
    }

    private func filteredTasks(_ store: WorkStore) -> [TaskItem] {
        taskQuery.apply(to: (lifecycleFilter == .archived || lifecycleFilter == .all) ? store.historicalTasks : store.tasks)
    }

    private func resetFilters() {
        projectFilter = "all"; priorityFilter = "all"; statusFilter = "all"
        assigneeFilter = "all"; labelFilter = "all"; specFilter = "all"; searchFilter = ""
    }

    private func filterForm(_ store: WorkStore) -> some View {
        let source = lifecycleFilter == .archived || lifecycleFilter == .all ? store.historicalTasks : store.tasks
        return Form {
            Picker("Lifecycle", selection: $lifecycleFilter) {
                Text("Current").tag(TaskLifecycleFilter.current)
                Text("Active").tag(TaskLifecycleFilter.active)
                Text("Done").tag(TaskLifecycleFilter.done)
                Text("Archived").tag(TaskLifecycleFilter.archived)
                Text("All states").tag(TaskLifecycleFilter.all)
            }.onChange(of: lifecycleFilter) { Task { await loadTasksAndTimers(store) } }
            Picker("Project", selection: $projectFilter) {
                Text("All loaded projects").tag("all")
                Text("Global").tag("global")
                ForEach(model.projects) { Text($0.name).tag($0.id) }
            }
            Picker("Status", selection: $statusFilter) {
                Text("All statuses").tag("all")
                ForEach(store.statusChoices(), id: \.self) { Text($0).tag($0) }
            }
            Picker("Priority", selection: $priorityFilter) {
                Text("All priorities").tag("all")
                ForEach(["urgent", "high", "medium", "low"], id: \.self) { Text($0.capitalized).tag($0) }
            }
            Picker("Assignee", selection: $assigneeFilter) {
                Text("All assignees").tag("all")
                Text("Unassigned").tag("unassigned")
                ForEach(Array(Set(source.compactMap(\.assignee))).filter { !$0.isEmpty }.sorted(), id: \.self) { Text($0).tag($0) }
            }
            Picker("Label", selection: $labelFilter) {
                Text("All labels").tag("all")
                ForEach(Array(Set(source.flatMap(\.labels))).sorted(), id: \.self) { Text($0).tag($0) }
            }
            Picker("Spec", selection: $specFilter) {
                Text("All specs").tag("all")
                Text("No spec").tag("none")
                ForEach(Array(Set(source.compactMap(\.spec))).filter { !$0.isEmpty }.sorted(), id: \.self) { Text($0).tag($0) }
            }
            Divider()
            Picker("Group list by", selection: $grouping) {
                ForEach(TaskGrouping.allCases, id: \.self) { Text($0.rawValue).tag($0) }
            }
            Picker("Sort", selection: $sortOption) {
                Text("Manual order").tag(TaskSortOption.order)
                Text("Priority").tag(TaskSortOption.priority)
                Text("Title").tag(TaskSortOption.title)
                Text("Created").tag(TaskSortOption.created)
                Text("Updated").tag(TaskSortOption.updated)
            }
            HStack {
                Button("Reset Filters") { resetFilters() }
                Spacer()
                Button("Done") { showFilters = false }.keyboardShortcut(.defaultAction)
            }
        }
        .formStyle(.grouped)
        .padding(12)
        .frame(width: 360)
    }

    // MARK: - Create Task Sheet

    private func createTaskSheet(_ store: WorkStore) -> some View {
        NavigationStack {
            Form {
                Section("Task Details") {
                    TextField("Title", text: $newTitle)
                        .onChange(of: newTitle) { saveCreateDraft() }

                    TextField("Description", text: $newDescription, axis: .vertical)
                        .lineLimit(3...6)
                        .onChange(of: newDescription) { saveCreateDraft() }
                }

                Section("Status & Priority") {
                    Picker("Status", selection: $newStatus) {
                        ForEach(store.statusChoices(including: newStatus), id: \.self) { Text($0).tag($0) }
                    }

                    Picker("Priority", selection: $newPriority) {
                        Text("High").tag("high")
                        Text("Medium").tag("medium")
                        Text("Low").tag("low")
                    }

                    TextField("Assignee (optional)", text: $newAssignee)
                    TextField("Labels (comma separated)", text: $newLabelsText)
                }

                Section("Spec & Hierarchy") {
                    TextField("Linked Spec Path (e.g. specs/auth.md)", text: $newSpec)
                    TextField("Fulfills Spec ACs (e.g. AC-1, AC-2)", text: $newFulfillsText)
                    TextField("Parent Task ID (optional)", text: $newParent)
                    Toggle("Global scope (not bound to current project)", isOn: $isCreatingGlobal)
                }

                Section("Acceptance Criteria") {
                    HStack {
                        TextField("Add acceptance criterion...", text: $newCriteriaInput)
                        Button("Add") {
                            let text = newCriteriaInput.trimmingCharacters(in: .whitespacesAndNewlines)
                            guard !text.isEmpty else { return }
                            newCriteria.append(AcceptanceCriterionItem(text: text))
                            newCriteriaInput = ""
                        }
                        .disabled(newCriteriaInput.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                    }

                    ForEach(newCriteria) { ac in
                        HStack {
                            Image(systemName: "circle")
                            Text(ac.text)
                            Spacer()
                            Button {
                                newCriteria.removeAll { $0.text == ac.text }
                            } label: {
                                Image(systemName: "trash").foregroundStyle(.red)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }

                if let err = createError {
                    Text(err).font(.caption).foregroundStyle(.red)
                }
            }
            .formStyle(.grouped)
            .navigationTitle("Create Task")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { showCreateSheet = false }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Create") {
                        Task {
                            do {
                                let labels = newLabelsText.split(separator: ",").map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }
                                let fulfills = newFulfillsText.split(separator: ",").map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }

                                _ = try await store.createTask(
                                    title: newTitle,
                                    description: newDescription.isEmpty ? nil : newDescription,
                                    status: newStatus,
                                    priority: newPriority,
                                    assignee: newAssignee.isEmpty ? nil : newAssignee,
                                    labels: labels,
                                    parent: newParent.isEmpty ? nil : newParent,
                                    spec: newSpec.isEmpty ? nil : newSpec,
                                    fulfills: fulfills,
                                    acceptanceCriteria: newCriteria,
                                    global: isCreatingGlobal
                                )
                                clearCreateDraft()
                                showCreateSheet = false
                            } catch {
                                createError = error.localizedDescription
                            }
                        }
                    }
                    .disabled(newTitle.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }
            .frame(width: 540, height: 500)
        }
    }

    private func saveCreateDraft() {
        model.drafts.save(newTitle, namespace: "task-title", projectID: model.workspace.projectID, entityID: "new")
        model.drafts.save(newDescription, namespace: "task-desc", projectID: model.workspace.projectID, entityID: "new")
    }

    private func restoreCreateDraft() {
        if let t = model.drafts.load(namespace: "task-title", projectID: model.workspace.projectID, entityID: "new"), !t.isEmpty {
            newTitle = t
        }
        if let d = model.drafts.load(namespace: "task-desc", projectID: model.workspace.projectID, entityID: "new"), !d.isEmpty {
            newDescription = d
        }
    }

    private func clearCreateDraft() {
        model.drafts.remove(namespace: "task-title", projectID: model.workspace.projectID, entityID: "new")
        model.drafts.remove(namespace: "task-desc", projectID: model.workspace.projectID, entityID: "new")
        newTitle = ""
        newDescription = ""
        newCriteria = []
        newCriteriaInput = ""
        createError = nil
    }

    // MARK: - Batch Archive Sheet

    private func previewBatchArchive(_ store: WorkStore) async {
        isPreviewingBatchArchive = true
        batchArchiveError = nil
        do {
            let ms = Int64(batchArchiveAgeDays) * 86_400_000
            let res = try await store.batchArchive(ids: nil, minimumAgeMs: ms, execute: false)
            batchArchivePreviewResponse = res
        } catch {
            batchArchiveError = error.localizedDescription
        }
        isPreviewingBatchArchive = false
    }

    private func batchArchiveSheet(_ store: WorkStore) -> some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: 16) {
                Text("Archive Completed Tasks").font(.headline)
                Text("Moves completed tasks older than the retention threshold to the archive storage.").font(.caption).foregroundStyle(.secondary)

                HStack {
                    Text("Completed older than:")
                    Picker("", selection: $batchArchiveAgeDays) {
                        Text("7 days").tag(7)
                        Text("14 days").tag(14)
                        Text("30 days").tag(30)
                        Text("90 days").tag(90)
                    }
                    .frame(width: 120)
                    .onChange(of: batchArchiveAgeDays) {
                        Task { await previewBatchArchive(store) }
                    }
                }

                Divider()

                if isPreviewingBatchArchive {
                    ProgressView("Analyzing eligible tasks...").frame(maxWidth: .infinity, minHeight: 120)
                } else if let res = batchArchivePreviewResponse {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Preview Results").font(.subheadline.weight(.semibold))
                        HStack {
                            Text("Eligible for archive:").foregroundStyle(.secondary)
                            Text("\(res.changed) of \(res.processed) tasks").bold()
                        }

                        if !res.items.isEmpty {
                            List(res.items) { item in
                                HStack {
                                    Image(systemName: item.eligible ? "checkmark.circle.fill" : "exclamationmark.circle.fill")
                                        .foregroundStyle(item.eligible ? .green : .orange)
                                    Text(item.taskId).font(.system(.caption, design: .monospaced))
                                    Spacer()
                                    if let reason = item.reasons.first?.message {
                                        Text(reason).font(.caption2).foregroundStyle(.secondary)
                                    }
                                }
                            }
                            .frame(height: 180)
                        }
                    }
                }

                if let err = batchArchiveError {
                    Text(err).font(.caption).foregroundStyle(.red)
                }

                Spacer()

                HStack {
                    Button("Cancel") { showBatchArchiveModal = false }
                    Spacer()
                    Button("Execute Archive") {
                        Task {
                            isExecutingBatchArchive = true
                            do {
                                let ms = Int64(batchArchiveAgeDays) * 86_400_000
                                _ = try await store.batchArchive(ids: nil, minimumAgeMs: ms, execute: true)
                                showBatchArchiveModal = false
                            } catch {
                                batchArchiveError = error.localizedDescription
                            }
                            isExecutingBatchArchive = false
                        }
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(.red)
                    .disabled(isExecutingBatchArchive || batchArchivePreviewResponse?.changed == 0)
                }
            }
            .padding(24)
            .frame(width: 520, height: 420)
        }
    }

    // MARK: - Batch Unarchive Sheet

    private func previewBatchUnarchive(_ store: WorkStore) async {
        isPreviewingBatchUnarchive = true
        batchUnarchiveError = nil
        do {
            let archivedIDs = store.historicalTasks.filter(\.isArchived).map(\.id)
            let res = try await store.batchUnarchive(ids: archivedIDs, status: "todo", execute: false)
            batchUnarchivePreviewResponse = res
        } catch {
            batchUnarchiveError = error.localizedDescription
        }
        isPreviewingBatchUnarchive = false
    }

    private func batchUnarchiveSheet(_ store: WorkStore) -> some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: 16) {
                Text("Restore Archived Tasks").font(.headline)
                Text("Restores archived tasks back to active workspace status.").font(.caption).foregroundStyle(.secondary)

                Divider()

                if isPreviewingBatchUnarchive {
                    ProgressView("Analyzing archived tasks...").frame(maxWidth: .infinity, minHeight: 120)
                } else if let res = batchUnarchivePreviewResponse {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Preview Results").font(.subheadline.weight(.semibold))
                        HStack {
                            Text("Eligible for restore:").foregroundStyle(.secondary)
                            Text("\(res.changed) of \(res.processed) tasks").bold()
                        }

                        if !res.items.isEmpty {
                            List(res.items) { item in
                                HStack {
                                    Image(systemName: item.eligible ? "checkmark.circle.fill" : "exclamationmark.circle.fill")
                                        .foregroundStyle(item.eligible ? .green : .orange)
                                    Text(item.taskId).font(.system(.caption, design: .monospaced))
                                    Spacer()
                                    if let reason = item.reasons.first?.message {
                                        Text(reason).font(.caption2).foregroundStyle(.secondary)
                                    }
                                }
                            }
                            .frame(height: 180)
                        }
                    }
                }

                if let err = batchUnarchiveError {
                    Text(err).font(.caption).foregroundStyle(.red)
                }

                Spacer()

                HStack {
                    Button("Cancel") { showBatchUnarchiveModal = false }
                    Spacer()
                    Button("Execute Restore") {
                        Task {
                            isExecutingBatchUnarchive = true
                            do {
                                let archivedIDs = store.historicalTasks.filter(\.isArchived).map(\.id)
                                _ = try await store.batchUnarchive(ids: archivedIDs, status: "todo", execute: true)
                                showBatchUnarchiveModal = false
                            } catch {
                                batchUnarchiveError = error.localizedDescription
                            }
                            isExecutingBatchUnarchive = false
                        }
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(WorkspaceStyle.accent)
                    .disabled(isExecutingBatchUnarchive || batchUnarchivePreviewResponse?.changed == 0)
                }
            }
            .padding(24)
            .frame(width: 520, height: 400)
        }
    }
}

// MARK: - Enums

enum TaskViewMode: String, CaseIterable, Sendable {
    case list, board
}

enum TaskLifecycleFilter: String, CaseIterable, Sendable {
    case current, active, done, archived, all
}

enum TaskSortOption: String, CaseIterable, Sendable {
    case order, priority, title, created, updated
}

// MARK: - List View

struct TaskListView: View {
    let tasks: [TaskItem]
    let store: WorkStore
    let timerTick: Date
    var grouping: TaskGrouping = .none
    let onSelect: (TaskItem) -> Void

    var body: some View {
        List {
            ForEach(TaskQuery.groups(tasks, by: grouping, statuses: store.configuredStatuses)) { group in
                if grouping == .none {
                    ForEach(group.tasks) { task in taskRow(task) }
                } else {
                    Section("\(group.title) (\(group.tasks.count))") {
                        ForEach(group.tasks) { task in taskRow(task) }
                    }
                }
            }
        }
        .listStyle(.inset)
    }

    private func taskRow(_ task: TaskItem) -> some View {
                HStack(spacing: 12) {
                    // Checkbox for quick completion toggle
                    Button {
                        let newStatus = task.isDone ? (store.configuredStatuses.first { $0 != "done" } ?? "todo") : "done"
                        Task {
                            do { _ = try await store.updateTask(id: task.id, patch: ["status": .string(newStatus)]) }
                            catch { store.model.report(error) }
                        }
                    } label: {
                        Image(systemName: task.isDone ? "checkmark.circle.fill" : "circle")
                            .foregroundStyle(task.isDone ? .green : .secondary)
                            .font(.title3)
                    }
                    .buttonStyle(.plain)
                    .disabled(task.isArchived || !store.configuredStatuses.contains("done"))

                    VStack(alignment: .leading, spacing: 4) {
                        HStack(spacing: 8) {
                            Text(task.title)
                                .font(.headline)
                                .strikethrough(task.isDone)
                                .foregroundStyle(task.isDone ? .secondary : .primary)
                            priorityBadge(task.priority)
                            statusBadge(task.status)
                            if task.isArchived {
                                Text("ARCHIVED")
                                    .font(.system(size: 8, weight: .bold))
                                    .padding(.horizontal, 4).padding(.vertical, 1)
                                    .background(Color.secondary.opacity(0.2))
                                    .clipShape(Capsule())
                            }
                        }

                        if let desc = task.description, !desc.isEmpty {
                            Text(desc).font(.caption).foregroundStyle(.secondary).lineLimit(1)
                        }

                        HStack(spacing: 12) {
                            Text("ID: \(task.id)").font(.system(.caption2, design: .monospaced)).foregroundStyle(.tertiary)

                            if !task.labels.isEmpty {
                                HStack(spacing: 4) {
                                    ForEach(task.labels, id: \.self) { label in
                                        Text("#\(label)").font(.caption2).foregroundStyle(.secondary)
                                    }
                                }
                            }

                            if !task.acceptanceCriteria.isEmpty {
                                Label("\(task.completedAcceptanceCriteriaCount)/\(task.acceptanceCriteria.count) ACs", systemImage: "checklist")
                                    .font(.caption2).foregroundStyle(.secondary)
                            }

                            if let spec = task.spec, !spec.isEmpty {
                                Label(spec, systemImage: "doc.text")
                                    .font(.caption2).foregroundStyle(.secondary)
                            }
                        }
                    }

                    Spacer()

                    // Timer indicator or trigger
                    if let timer = store.activeTimers.first(where: { $0.taskId == task.id }) {
                        let elapsed = timer.elapsedSeconds(now: timerTick)
                        HStack(spacing: 6) {
                            Circle().fill(timer.isPaused ? Color.orange : Color.green).frame(width: 8, height: 8)
                            Text(formatDuration(seconds: elapsed))
                                .font(.system(.caption, design: .monospaced).bold())
                                .foregroundStyle(timer.isPaused ? .orange : .green)
                        }
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                        .background(Color(nsColor: .controlBackgroundColor))
                        .clipShape(Capsule())
                    }

                    Button("Detail") {
                        onSelect(task)
                    }
                    .buttonStyle(.bordered)
                    .controlSize(.small)
                }
                .padding(.vertical, 4)
                .contentShape(Rectangle())
                .onTapGesture {
                    onSelect(task)
                }
    }

    private func priorityBadge(_ p: String) -> some View {
        Text(p.uppercased())
            .font(.system(size: 9, weight: .bold))
            .padding(.horizontal, 5).padding(.vertical, 2)
            .background(priorityColor(p).opacity(0.18))
            .foregroundStyle(priorityColor(p))
            .clipShape(Capsule())
    }

    private func statusBadge(_ s: String) -> some View {
        Text(s.uppercased())
            .font(.system(size: 9, weight: .bold))
            .padding(.horizontal, 5).padding(.vertical, 2)
            .background(statusColor(s).opacity(0.18))
            .foregroundStyle(statusColor(s))
            .clipShape(Capsule())
    }

    private func priorityColor(_ p: String) -> Color {
        switch p.lowercased() {
        case "high", "urgent": return .red
        case "medium": return .orange
        default: return .secondary
        }
    }

    private func statusColor(_ s: String) -> Color {
        switch s.lowercased() {
        case "done": return .green
        case "in-progress": return .blue
        case "in-review": return .purple
        case "blocked", "urgent": return .red
        default: return .secondary
        }
    }

    private func formatDuration(seconds: Int) -> String {
        let mins = (seconds % 3600) / 60
        let secs = seconds % 60
        return String(format: "%02d:%02d", mins, secs)
    }
}

// MARK: - Board View (Kanban)

struct TaskBoardView: View {
    let tasks: [TaskItem]
    let store: WorkStore
    let timerTick: Date
    let onManualOrder: () -> Void
    let onSelect: (TaskItem) -> Void

    let columns = [
        "todo": "To Do",
        "in-progress": "In Progress",
        "in-review": "In Review",
        "done": "Done"
    ]

    var body: some View {
        ScrollView(.horizontal, showsIndicators: true) {
            HStack(alignment: .top, spacing: 16) {
                ForEach(store.visibleColumns, id: \.self) { statusKey in
                    let colTasks = tasks.filter { $0.status == statusKey }
                    kanbanColumn(title: columns[statusKey] ?? statusKey, status: statusKey, tasks: colTasks)
                }
            }
            .padding(16)
        }
    }

    private func kanbanColumn(title: String, status: String, tasks: [TaskItem]) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text(title).font(.headline)
                Spacer()
                Text("\(tasks.count)")
                    .font(.caption.bold())
                    .padding(.horizontal, 6)
                    .padding(.vertical, 2)
                    .background(Color.secondary.opacity(0.2))
                    .clipShape(Capsule())
            }
            .padding(.horizontal, 4)

            ScrollView(.vertical, showsIndicators: false) {
                VStack(spacing: 10) {
                    ForEach(tasks) { task in
                        kanbanCard(task)
                    }
                }
            }
        }
        .frame(width: 260)
        .padding(12)
        .background(Color(nsColor: .controlBackgroundColor))
        .clipShape(RoundedRectangle(cornerRadius: 10))
        .dropDestination(for: String.self) { ids, _ in
            acceptDrop(ids, status: status, before: nil)
        }
    }

    private func kanbanCard(_ task: TaskItem) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text(task.title).font(.subheadline.weight(.semibold)).lineLimit(2)
                Spacer()
                Menu {
                    Button("Move Up") { moveRelative(task, offset: -1) }
                        .disabled(relativeAnchor(task, offset: -1) == nil || task.isArchived)
                    Button("Move Down") { moveRelative(task, offset: 1) }
                        .disabled(!canMoveDown(task) || task.isArchived)
                    Divider()
                    ForEach(store.statusChoices(), id: \.self) { status in
                        Button("Move to \(status)") { updateStatus(task, status) }
                            .disabled(task.status == status || task.isArchived)
                    }
                } label: {
                    Image(systemName: "ellipsis")
                }
                .buttonStyle(.plain)
            }

            if let desc = task.description, !desc.isEmpty {
                Text(desc).font(.caption).foregroundStyle(.secondary).lineLimit(2)
            }

            if !task.acceptanceCriteria.isEmpty {
                HStack(spacing: 8) {
                    ProgressView(value: task.acceptanceCriteriaProgress)
                    Text("\(task.completedAcceptanceCriteriaCount)/\(task.acceptanceCriteria.count)")
                        .font(.caption2).foregroundStyle(.secondary)
                }
            }

            HStack {
                Text(task.priority.uppercased())
                    .font(.system(size: 8, weight: .bold))
                    .padding(.horizontal, 4).padding(.vertical, 2)
                    .background(Color.secondary.opacity(0.15))
                    .clipShape(Capsule())

                Spacer()

                if let timer = store.activeTimers.first(where: { $0.taskId == task.id }) {
                    let elapsed = timer.elapsedSeconds(now: timerTick)
                    Text(formatDuration(seconds: elapsed))
                        .font(.system(.caption2, design: .monospaced).bold())
                        .foregroundStyle(timer.isPaused ? .orange : .green)
                }
            }
        }
        .padding(10)
        .background(Color(nsColor: .windowBackgroundColor))
        .clipShape(RoundedRectangle(cornerRadius: 8))
        .overlay(RoundedRectangle(cornerRadius: 8).stroke(Color.secondary.opacity(0.12), lineWidth: 1))
        .contentShape(Rectangle())
        .onTapGesture { onSelect(task) }
        .draggable(task.isArchived ? "" : task.scopedID)
        .dropDestination(for: String.self) { ids, _ in
            guard !task.isArchived else { return false }
            return acceptDrop(ids, status: task.status, before: task.scopedID)
        }
    }

    private func acceptDrop(_ ids: [String], status: String, before anchor: String?) -> Bool {
        guard ids.count == 1, let id = ids.first, !store.isReordering,
              TaskOrdering.orders(in: store.tasks, moving: id, to: status, before: anchor) != nil else { return false }
        move(id: id, status: status, before: anchor)
        return true
    }

    private func move(id: String, status: String, before anchor: String?) {
        onManualOrder()
        Task {
            do { try await store.moveBoardTask(id: id, status: status, before: anchor) }
            catch { store.model.report(error) }
        }
    }

    private func columnTasks(_ task: TaskItem) -> [TaskItem] {
        TaskQuery().apply(to: store.tasks).filter { $0.status == task.status }
    }

    private func relativeAnchor(_ task: TaskItem, offset: Int) -> String? {
        let column = columnTasks(task)
        guard let index = column.firstIndex(where: { $0.scopedID == task.scopedID }) else { return nil }
        let target = offset < 0 ? index - 1 : index + 2
        return column.indices.contains(target) ? column[target].scopedID : nil
    }

    private func canMoveDown(_ task: TaskItem) -> Bool {
        let column = columnTasks(task)
        guard let index = column.firstIndex(where: { $0.scopedID == task.scopedID }) else { return false }
        return index + 1 < column.count
    }

    private func moveRelative(_ task: TaskItem, offset: Int) {
        move(id: task.scopedID, status: task.status, before: relativeAnchor(task, offset: offset))
    }

    private func updateStatus(_ task: TaskItem, _ status: String) {
        move(id: task.scopedID, status: status, before: nil)
    }

    private func formatDuration(seconds: Int) -> String {
        let mins = (seconds % 3600) / 60
        let secs = seconds % 60
        return String(format: "%02d:%02d", mins, secs)
    }
}

// MARK: - Task Detail Modal / Inspector

struct TaskDetailModal: View {
    @State var task: TaskItem
    let store: WorkStore
    let model: AppModel
    let onUpdate: (TaskItem) -> Void
    var isInspector = false
    @State private var showingAgentRun = false

    @Environment(\.dismiss) private var dismiss

    // Editable fields
    @State private var title: String = ""
    @State private var description: String = ""
    @State private var status: String = "todo"
    @State private var priority: String = "medium"
    @State private var assignee: String = ""
    @State private var labelsText: String = ""
    @State private var spec: String = ""
    @State private var fulfillsText: String = ""
    @State private var parent: String = ""
    @State private var plan: String = ""
    @State private var notes: String = ""

    // Acceptance criteria
    @State private var criteria: [AcceptanceCriterionItem] = []
    @State private var newCriteriaInput: String = ""

    // Manual Time Entry
    @State private var showAddTime = false
    @State private var manualMinutes: Int = 30
    @State private var manualNote: String = ""

    // History
    @State private var history: [TaskVersionItem] = []
    @State private var isLoadingHistory = false

    // Lifecycle
    @State private var lifecycleModalAction: String?
    @State private var lifecycleResponse: LifecycleResponse?
    @State private var isExecutingLifecycle = false
    @State private var lifecycleError: String?

    // Hard Delete
    @State private var showHardDeleteConfirm = false
    @State private var hardDeleteReason = ""
    @State private var hardDeleteConfirmed = false

    // Feedback
    @State private var saveFeedback: String?

    private var metadataLayout: AnyLayout {
        isInspector ? AnyLayout(VStackLayout(alignment: .leading, spacing: 12)) : AnyLayout(HStackLayout(spacing: 16))
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    // Agent Task ID Handoff Banner
                    agentHandoffBanner

                    // Save feedback banner
                    if let fb = saveFeedback {
                        Text(fb).font(.caption).foregroundStyle(.green)
                    }

                    // Main Details
                    VStack(alignment: .leading, spacing: 12) {
                        TextField("Task Title", text: $title)
                            .font(.title2.bold())
                            .onChange(of: title) { autoSaveDraft() }

                        metadataLayout {
                            Picker("Status", selection: $status) {
                                ForEach(store.statusChoices(including: status), id: \.self) { Text($0).tag($0) }
                            }

                            Picker("Priority", selection: $priority) {
                                Text("High").tag("high")
                                Text("Medium").tag("medium")
                                Text("Low").tag("low")
                            }

                            if !isInspector { Spacer() }

                            Button("Save Changes") {
                                Task { await saveTask() }
                            }
                            .buttonStyle(.borderedProminent)
                            .tint(WorkspaceStyle.accent)
                        }
                    }
                    .padding(16)
                    .background(Color(nsColor: .controlBackgroundColor))
                    .clipShape(RoundedRectangle(cornerRadius: 8))

                    // Description
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Description").font(.headline)
                        TextEditor(text: $description)
                            .font(.body)
                            .frame(minHeight: 100)
                            .padding(8)
                            .background(Color(nsColor: .textBackgroundColor))
                            .clipShape(RoundedRectangle(cornerRadius: 6))
                            .onChange(of: description) { autoSaveDraft() }
                    }

                    // Acceptance Criteria Checklist
                    acceptanceCriteriaSection

                    // Spec Fulfillment & Hierarchy
                    specAndHierarchySection

                    // Implementation Plan & Notes
                    planAndNotesSection

                    // Time Tracking
                    timeTrackingSection

                    // Version History
                    versionHistorySection

                    // Lifecycle Actions & Hard Delete
                    lifecycleSection
                }
                .padding(24)
            }
            .navigationTitle("Task: \(task.id)")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    if !isInspector { Button("Close") { dismiss() } }
                }
            }
            .frame(minWidth: isInspector ? 0 : 640, minHeight: isInspector ? 0 : 680)
            .task {
                initFromTask()
                await loadHistory()
            }
            .sheet(isPresented: $showingAgentRun) {
                VStack(spacing: 0) {
                    HStack { Text("Task Agent").font(.headline); Spacer(); Button("Close") { showingAgentRun = false }.keyboardShortcut(.cancelAction) }.padding(16)
                    Divider()
                    AgentRunView(model: model, taskID: task.id)
                }.frame(width: 1000, height: 760)
            }
        }
    }

    private var agentHandoffBanner: some View {
        HStack {
            Image(systemName: "cpu").font(.headline).foregroundStyle(WorkspaceStyle.accent)
            VStack(alignment: .leading, spacing: 2) {
                Text("Task Agent").font(.subheadline.bold())
                Text("Review the plan, changes, and execution history for this task.")
                    .font(.caption).foregroundStyle(.secondary)
            }
            Spacer()
            Button("Open Agent Run") {
                showingAgentRun = true
            }
            .buttonStyle(.bordered)
            .controlSize(.small)
        }
        .padding(12)
        .background(WorkspaceStyle.accent.opacity(0.1))
        .clipShape(RoundedRectangle(cornerRadius: 8))
    }

    private func initFromTask() {
        title = task.title
        description = task.description ?? ""
        status = task.status
        priority = task.priority
        assignee = task.assignee ?? ""
        labelsText = task.labels.joined(separator: ", ")
        spec = task.spec ?? ""
        fulfillsText = task.fulfills.joined(separator: ", ")
        parent = task.parent ?? ""
        plan = task.implementationPlan ?? ""
        notes = task.implementationNotes ?? ""
        criteria = task.acceptanceCriteria

        // Restore description draft if present
        if let d = model.drafts.load(namespace: "task-desc", projectID: model.workspace.projectID, entityID: task.id), !d.isEmpty {
            description = d
        }
    }

    private func autoSaveDraft() {
        model.drafts.save(description, namespace: "task-desc", projectID: model.workspace.projectID, entityID: task.id)
    }

    private func saveTask() async {
        let labels = labelsText.split(separator: ",").map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }
        let fulfills = fulfillsText.split(separator: ",").map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }

        let patch: [String: JSONValue] = [
            "title": .string(title),
            "description": .string(description),
            "status": .string(status),
            "priority": .string(priority),
            "assignee": .string(assignee),
            "labels": .array(labels.map { .string($0) }),
            "spec": .string(spec),
            "fulfills": .array(fulfills.map { .string($0) }),
            "parent": .string(parent),
            "implementationPlan": .string(plan),
            "implementationNotes": .string(notes),
            "acceptanceCriteria": .array(criteria.map { ac in
                .object(["text": .string(ac.text), "completed": .bool(ac.completed)])
            })
        ]

        do {
            let updated = try await store.updateTask(id: task.id, patch: patch)
            self.task = updated
            onUpdate(updated)
            model.drafts.remove(namespace: "task-desc", projectID: model.workspace.projectID, entityID: task.id)
            saveFeedback = "Changes saved successfully!"
            await loadHistory()
        } catch {
            model.report(error)
        }
    }

    // MARK: - Sections

    private var acceptanceCriteriaSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Acceptance Criteria").font(.headline)

            HStack {
                TextField("Add criterion...", text: $newCriteriaInput)
                Button("Add") {
                    let text = newCriteriaInput.trimmingCharacters(in: .whitespacesAndNewlines)
                    guard !text.isEmpty else { return }
                    criteria.append(AcceptanceCriterionItem(text: text))
                    newCriteriaInput = ""
                }
                .disabled(newCriteriaInput.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            }

            ForEach(criteria.indices, id: \.self) { idx in
                HStack {
                    Button {
                        criteria[idx].completed.toggle()
                    } label: {
                        Image(systemName: criteria[idx].completed ? "checkmark.square.fill" : "square")
                            .foregroundStyle(criteria[idx].completed ? .green : .secondary)
                    }
                    .buttonStyle(.plain)

                    TextField("", text: $criteria[idx].text)
                        .strikethrough(criteria[idx].completed)

                    Spacer()

                    Button {
                        criteria.remove(at: idx)
                    } label: {
                        Image(systemName: "trash").foregroundStyle(.red)
                    }
                    .buttonStyle(.plain)
                }
            }
        }
        .padding(16)
        .background(Color(nsColor: .controlBackgroundColor))
        .clipShape(RoundedRectangle(cornerRadius: 8))
    }

    private var specAndHierarchySection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Spec Fulfillment & Hierarchy").font(.headline)

            HStack(spacing: 12) {
                TextField("Linked Spec Path", text: $spec)
                TextField("Fulfills AC IDs", text: $fulfillsText)
            }

            HStack {
                TextField("Parent Task ID", text: $parent)
                Button("Sync Spec ACs") {
                    Task {
                        do {
                            let res = try await store.syncSpecACs()
                            model.report(APIError(status: 200, message: "Synced \(res.synced) spec acceptance criteria."))
                        } catch {
                            model.report(error)
                        }
                    }
                }
                .buttonStyle(.bordered)
            }

            if !task.subtasks.isEmpty {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Child Subtasks:").font(.caption.bold())
                    ForEach(task.subtasks, id: \.self) { subId in
                        Text("• \(subId)").font(.system(.caption, design: .monospaced))
                    }
                }
            }
        }
        .padding(16)
        .background(Color(nsColor: .controlBackgroundColor))
        .clipShape(RoundedRectangle(cornerRadius: 8))
    }

    private var planAndNotesSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Implementation Plan & Notes").font(.headline)

            Text("Plan").font(.caption.bold())
            TextEditor(text: $plan)
                .frame(minHeight: 60)
                .padding(4)
                .background(Color(nsColor: .textBackgroundColor))
                .clipShape(RoundedRectangle(cornerRadius: 6))

            Text("Notes").font(.caption.bold())
            TextEditor(text: $notes)
                .frame(minHeight: 60)
                .padding(4)
                .background(Color(nsColor: .textBackgroundColor))
                .clipShape(RoundedRectangle(cornerRadius: 6))
        }
        .padding(16)
        .background(Color(nsColor: .controlBackgroundColor))
        .clipShape(RoundedRectangle(cornerRadius: 8))
    }

    private var timeTrackingSection: some View {
        let activeTimer = store.activeTimers.first(where: { $0.taskId == task.id })

        return VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text("Time Tracking").font(.headline)
                Spacer()
                Text("Total: \(formatDuration(seconds: task.timeSpent))")
                    .font(.subheadline.bold())
            }

            if let timer = activeTimer {
                HStack {
                    Circle().fill(timer.isPaused ? Color.orange : Color.green).frame(width: 10, height: 10)
                    Text(timer.isPaused ? "Timer Paused" : "Timer Running").font(.callout.bold())
                    Spacer()
                    if timer.isPaused {
                        Button("Resume") {
                            Task {
                                do { try await store.resumeTimer(taskID: task.id) }
                                catch { model.report(error) }
                            }
                        }
                    } else {
                        Button("Pause") {
                            Task {
                                do { try await store.pauseTimer(taskID: task.id) }
                                catch { model.report(error) }
                            }
                        }
                    }
                    Button("Stop") {
                        Task {
                                do { try await store.stopTimer(taskID: task.id) }
                                catch { model.report(error) }
                            }
                    }
                    .tint(.red)
                }
            } else {
                HStack(spacing: 12) {
                    Button("Start Timer", systemImage: "play.circle.fill") {
                        Task {
                                do { try await store.startTimer(taskID: task.id) }
                                catch { model.report(error) }
                            }
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(WorkspaceStyle.accent)

                    Button("Log Time Manually...", systemImage: "plus") {
                        showAddTime.toggle()
                    }
                }
            }

            if showAddTime {
                HStack {
                    Stepper("Duration: \(manualMinutes) min", value: $manualMinutes, in: 5...600, step: 5)
                    TextField("Note", text: $manualNote)
                    Button("Log") {
                        Task {
                            do {
                                try await store.addManualTime(taskID: task.id, durationSeconds: manualMinutes * 60, note: manualNote)
                                showAddTime = false
                                let refreshed = try await store.fetchSingleTask(id: task.id)
                                self.task = refreshed
                                onUpdate(refreshed)
                            } catch { model.report(error) }
                        }
                    }
                }
                .padding(8)
                .background(Color(nsColor: .controlBackgroundColor))
                .clipShape(RoundedRectangle(cornerRadius: 6))
            }

            if !task.timeEntries.isEmpty {
                VStack(alignment: .leading, spacing: 6) {
                    Text("Recorded Logs:").font(.caption.bold())
                    ForEach(task.timeEntries.prefix(5)) { entry in
                        HStack {
                            Text(formatDuration(seconds: entry.duration)).font(.system(.caption, design: .monospaced))
                            Text(entry.note ?? "Session log").font(.caption).foregroundStyle(.secondary)
                            Spacer()
                            Text(ISO8601Parser.relativeString(from: entry.startedDate)).font(.caption2).foregroundStyle(.tertiary)
                        }
                    }
                }
            }
        }
        .padding(16)
        .background(Color(nsColor: .controlBackgroundColor))
        .clipShape(RoundedRectangle(cornerRadius: 8))
    }

    private var versionHistorySection: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text("Version History").font(.headline)
                Spacer()
                if isLoadingHistory { ProgressView().controlSize(.small) }
            }

            if history.isEmpty && !isLoadingHistory {
                Text("No version changes recorded.").font(.caption).foregroundStyle(.secondary)
            } else {
                ForEach(history.prefix(5)) { v in
                    HStack(alignment: .top) {
                        Text("v\(v.version)").font(.system(.caption, design: .monospaced).bold())
                        VStack(alignment: .leading, spacing: 2) {
                            if let a = v.author, !a.isEmpty {
                                Text("Author: \(a)").font(.caption2).foregroundStyle(.secondary)
                            }
                            ForEach(v.changes) { ch in
                                Text("• \(ch.field) updated").font(.caption2).foregroundStyle(.secondary)
                            }
                        }
                        Spacer()
                        Text(ISO8601Parser.relativeString(from: v.date)).font(.caption2).foregroundStyle(.tertiary)
                    }
                    .padding(.vertical, 2)
                }
            }
        }
        .padding(16)
        .background(Color(nsColor: .controlBackgroundColor))
        .clipShape(RoundedRectangle(cornerRadius: 8))
    }

    private var lifecycleSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Lifecycle & Retention").font(.headline)

            HStack(spacing: 12) {
                if task.isArchived {
                    Button("Restore from Archive") {
                        Task {
                            do {
                                _ = try await store.unarchiveTask(id: task.id, execute: true, status: "todo")
                                if let refreshed = try? await store.fetchSingleTask(id: task.id) {
                                    self.task = refreshed
                                    onUpdate(refreshed)
                                }
                                model.report(APIError(status: 200, message: "Task restored successfully."))
                            } catch {
                                model.report(error)
                            }
                        }
                    }
                    .buttonStyle(.bordered)
                } else {
                    Button("Archive Task") {
                        Task {
                            do {
                                _ = try await store.archiveTask(id: task.id, execute: true)
                                if let refreshed = try? await store.fetchSingleTask(id: task.id) {
                                    self.task = refreshed
                                    onUpdate(refreshed)
                                }
                                model.report(APIError(status: 200, message: "Task archived successfully."))
                            } catch {
                                model.report(error)
                            }
                        }
                    }
                    .buttonStyle(.bordered)
                }

                Spacer()

                Button("Hard Delete...", role: .destructive) {
                    showHardDeleteConfirm = true
                }
                .buttonStyle(.bordered)
                .tint(.red)
                .disabled(!store.canHardDelete)
                .help(store.canHardDelete ? "Permanently delete this task" : "Permanent deletion is disabled by the server")
            }

            if showHardDeleteConfirm {
                VStack(alignment: .leading, spacing: 10) {
                    Text("Confirm Permanent Deletion").font(.subheadline.bold()).foregroundStyle(.red)
                    Text("Hard delete permanently destroys this task, all time entries, versions, and chats. A tombstone will be retained.").font(.caption).foregroundStyle(.secondary)

                    TextField("Enter reason for deletion (required)", text: $hardDeleteReason)
                    Toggle("I confirm irreversible deletion of '\(task.id)'", isOn: $hardDeleteConfirmed)

                    HStack {
                        Button("Cancel") {
                            showHardDeleteConfirm = false
                            hardDeleteReason = ""
                            hardDeleteConfirmed = false
                        }
                        Spacer()
                        Button("Permanently Delete", role: .destructive) {
                            Task {
                                do {
                                    _ = try await store.hardDeleteTask(id: task.id, reason: hardDeleteReason, confirmed: true)
                                    dismiss()
                                } catch {
                                    model.report(error)
                                }
                            }
                        }
                        .disabled(!hardDeleteConfirmed || hardDeleteReason.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                        .tint(.red)
                    }
                }
                .padding(12)
                .background(Color.red.opacity(0.08))
                .clipShape(RoundedRectangle(cornerRadius: 8))
            }
        }
        .padding(16)
        .background(Color(nsColor: .controlBackgroundColor))
        .clipShape(RoundedRectangle(cornerRadius: 8))
    }

    private func loadHistory() async {
        isLoadingHistory = true
        if let h = try? await store.fetchTaskHistory(id: task.id) {
            history = h.versions
        }
        isLoadingHistory = false
    }

    private func formatDuration(seconds: Int) -> String {
        let hrs = seconds / 3600
        let mins = (seconds % 3600) / 60
        let secs = seconds % 60
        if hrs > 0 { return String(format: "%02d:%02d:%02d", hrs, mins, secs) }
        return String(format: "%02d:%02d", mins, secs)
    }
}

// MARK: - Task Detail Inspector (Docked Side Panel)

struct TaskDetailInspector: View {
    let task: TaskItem
    let store: WorkStore
    let model: AppModel
    let onUpdate: (TaskItem) -> Void

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Label("Task Inspector", systemImage: "sidebar.right")
                    .font(.headline)
                Spacer()
                Button {
                    model.inspectorVisible = false
                } label: {
                    Image(systemName: "xmark.circle.fill").foregroundStyle(.secondary)
                }
                .buttonStyle(.plain)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
            .background(Color(nsColor: .controlBackgroundColor))

            Divider()

            TaskDetailModal(task: task, store: store, model: model, onUpdate: onUpdate, isInspector: true)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}
