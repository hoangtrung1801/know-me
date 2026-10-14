import SwiftUI
import KnowMeCore

struct OverviewView: View {
    @Bindable var model: AppModel
    @State private var store: WorkStore?
    @State private var selectedPeriodDays: Int = 30
    @State private var selectedAssignee: String = "all"
    @State private var selectedLabel: String = "all"
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
                ProgressView("Loading workspace...")
            }
        }
        .task(id: model.workspaceKey) {
            let s = WorkStore(model: model)
            self.store = s
            await loadData(s)
        }
        .onReceive(Timer.publish(every: 1, on: .main, in: .common).autoconnect()) { now in
            timerTick = now
        }
    }

    private func loadData(_ store: WorkStore) async {
        async let tasksLoad: () = store.fetchTasks(includeHistorical: true)
        async let timersLoad: () = store.fetchTimers()
        async let activitiesLoad: () = store.fetchActivities(limit: 25)
        _ = await (tasksLoad, timersLoad, activitiesLoad)
    }

    @ViewBuilder
    private func content(_ store: WorkStore) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                header(store)

                if let err = store.tasksError ?? store.activitiesError {
                    errorBanner(err, store: store)
                }

                if store.isLoadingTasks && store.tasks.isEmpty {
                    VStack(spacing: 12) {
                        ProgressView()
                        Text("Loading dashboard analytics...").foregroundStyle(.secondary)
                    }
                    .frame(maxWidth: .infinity, minHeight: 200)
                } else {
                    metricsGrid(store)
                    focusSection(store)
                    attentionSection(store)
                    agingAndThroughputSection(store)
                    activityFeedSection(store)
                }
            }
            .padding(24)
            .frame(maxWidth: 1000, alignment: .leading)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }

    // MARK: - Header

    private func header(_ store: WorkStore) -> some View {
        HStack(alignment: .center) {
            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 8) {
                    Text("Dashboard").font(.title.weight(.bold))
                    Text("•").foregroundStyle(.secondary)
                    Text(model.scopeTitle).font(.headline).foregroundStyle(.secondary)
                }
                Text("Analysis workbench, active focus, and real-time project throughput.").font(.subheadline).foregroundStyle(.secondary)
            }
            Spacer()
            HStack(spacing: 12) {
                Picker("Period", selection: $selectedPeriodDays) {
                    Text("7 days").tag(7)
                    Text("30 days").tag(30)
                    Text("90 days").tag(90)
                }
                .pickerStyle(.segmented)
                .frame(width: 200)

                Button {
                    Task { await loadData(store) }
                } label: {
                    Label("Refresh", systemImage: "arrow.clockwise")
                }
                .disabled(store.isLoadingTasks || store.isLoadingActivities)
            }
        }
    }

    // MARK: - Error Banner

    private func errorBanner(_ message: String, store: WorkStore) -> some View {
        HStack {
            Image(systemName: "exclamationmark.triangle.fill").foregroundStyle(.yellow)
            Text(message).font(.callout)
            Spacer()
            Button("Retry") {
                Task { await loadData(store) }
            }
        }
        .padding(12)
        .background(Color.yellow.opacity(0.12))
        .clipShape(RoundedRectangle(cornerRadius: 8))
    }

    // MARK: - Metrics Grid

    private func metricsGrid(_ store: WorkStore) -> some View {
        let tasks = store.tasks
        let historical = store.historicalTasks
        let allTasks = historical.isEmpty ? tasks : historical
        let periodStart = Calendar.current.date(byAdding: .day, value: -selectedPeriodDays, to: Date()) ?? Date()

        let createdInPeriod = allTasks.filter {
            guard let d = $0.createdDate else { return false }
            return d >= periodStart
        }.count

        let completedInPeriod = allTasks.filter {
            guard let d = $0.completedDate else { return false }
            return d >= periodStart
        }.count

        let activeCount = tasks.filter { !$0.isArchived && !$0.isDone }.count
        let netGap = createdInPeriod - completedInPeriod

        return HStack(spacing: 16) {
            metricCard(title: "Created (\(selectedPeriodDays)d)", value: "\(createdInPeriod)", icon: "plus.circle", color: .blue)
            metricCard(title: "Completed (\(selectedPeriodDays)d)", value: "\(completedInPeriod)", icon: "checkmark.circle", color: .green)
            metricCard(title: "Backlog Net Gap", value: "\(netGap >= 0 ? "+\(netGap)" : "\(netGap)")", icon: "arrow.left.arrow.right", color: netGap > 0 ? .orange : .secondary)
            metricCard(title: "Active In Flight", value: "\(activeCount)", icon: "flame", color: .purple)
        }
    }

    private func metricCard(title: String, value: String, icon: String, color: Color) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text(title).font(.caption.weight(.medium)).foregroundStyle(.secondary)
                Spacer()
                Image(systemName: icon).foregroundStyle(color)
            }
            Text(value).font(.system(size: 24, weight: .bold, design: .rounded))
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color(nsColor: .controlBackgroundColor))
        .clipShape(RoundedRectangle(cornerRadius: 10))
        .overlay(RoundedRectangle(cornerRadius: 10).stroke(Color.secondary.opacity(0.15), lineWidth: 1))
    }

    // MARK: - Focus & Timer Section

    private func focusSection(_ store: WorkStore) -> some View {
        let activeTimer = store.activeTimers.first
        let timedTask = activeTimer.flatMap { timer in store.tasks.first { $0.id == timer.taskId } }
        let suggestedTask = store.tasks.first { !$0.isArchived && !$0.isDone && $0.priority.lowercased() == "high" }
            ?? store.tasks.first { !$0.isArchived && !$0.isDone && $0.status.lowercased().contains("progress") }
            ?? store.tasks.first { !$0.isArchived && !$0.isDone }

        let focusTask = timedTask ?? suggestedTask

        return VStack(alignment: .leading, spacing: 12) {
            HStack {
                Label(activeTimer != nil ? "Active Focus (Timer Running)" : "Suggested Focus", systemImage: activeTimer != nil ? "timer" : "target")
                    .font(.headline)
                Spacer()
                if activeTimer != nil {
                    Text("Live Timer Active").font(.caption.weight(.semibold)).foregroundStyle(.green)
                }
            }

            if let task = focusTask {
                HStack(spacing: 16) {
                    VStack(alignment: .leading, spacing: 8) {
                        HStack(spacing: 8) {
                            Text(task.title).font(.title3.weight(.semibold))
                            statusBadge(task.status)
                            priorityBadge(task.priority)
                        }
                        if let desc = task.description, !desc.isEmpty {
                            Text(desc).font(.callout).foregroundStyle(.secondary).lineLimit(2)
                        }

                        if !task.acceptanceCriteria.isEmpty {
                            HStack(spacing: 12) {
                                ProgressView(value: task.acceptanceCriteriaProgress)
                                    .frame(width: 140)
                                Text("\(task.completedAcceptanceCriteriaCount)/\(task.acceptanceCriteria.count) ACs")
                                    .font(.caption).foregroundStyle(.secondary)
                            }
                        }
                    }

                    Spacer()

                    VStack(alignment: .trailing, spacing: 10) {
                        if let timer = activeTimer, timer.taskId == task.id {
                            let elapsed = timer.elapsedSeconds(now: timerTick)
                            Text(formatDuration(seconds: elapsed))
                                .font(.system(size: 26, weight: .bold, design: .monospaced))
                                .foregroundStyle(timer.isPaused ? .orange : .green)

                            HStack(spacing: 8) {
                                if timer.isPaused {
                                    Button("Resume", systemImage: "play.fill") {
                                        Task { try? await store.resumeTimer(taskID: task.id) }
                                    }
                                } else {
                                    Button("Pause", systemImage: "pause.fill") {
                                        Task { try? await store.pauseTimer(taskID: task.id) }
                                    }
                                }
                                Button("Stop", systemImage: "stop.fill") {
                                    Task { try? await store.stopTimer(taskID: task.id) }
                                }
                                .tint(.red)
                            }
                            .buttonStyle(.borderedProminent)
                            .controlSize(.small)
                        } else {
                            Button("Start Timer", systemImage: "play.circle.fill") {
                                Task { try? await store.startTimer(taskID: task.id) }
                            }
                            .buttonStyle(.borderedProminent)
                            .tint(WorkspaceStyle.accent)

                            Button("Open in Tasks") {
                                Task { await model.openTask(task.id, projectID: task.projectId) }
                            }
                            .buttonStyle(.link)
                            .font(.caption)
                        }
                    }
                }
                .padding(18)
                .background(Color(nsColor: .controlBackgroundColor))
                .clipShape(RoundedRectangle(cornerRadius: 10))
                .overlay(RoundedRectangle(cornerRadius: 10).stroke(activeTimer != nil ? Color.green.opacity(0.4) : Color.secondary.opacity(0.15), lineWidth: activeTimer != nil ? 2 : 1))
            } else {
                Text("No active tasks found. Create a task or pick a different project scope.")
                    .foregroundStyle(.secondary)
                    .padding(20)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(Color(nsColor: .controlBackgroundColor))
                    .clipShape(RoundedRectangle(cornerRadius: 10))
            }
        }
    }

    // MARK: - Attention Items

    private func attentionSection(_ store: WorkStore) -> some View {
        let urgent = store.tasks.filter { !$0.isArchived && !$0.isDone && $0.priority.lowercased() == "high" }
        let inReview = store.tasks.filter { !$0.isArchived && !$0.isDone && $0.status.lowercased().contains("review") }
        let blocked = store.tasks.filter { !$0.isArchived && !$0.isDone && ($0.status.lowercased().contains("block") || $0.status.lowercased().contains("hold")) }
        let attentionItems = urgent + inReview.filter { !urgent.contains($0) } + blocked.filter { !urgent.contains($0) && !inReview.contains($0) }

        return VStack(alignment: .leading, spacing: 12) {
            Label("Attention Items (\(attentionItems.count))", systemImage: "exclamationmark.bubble")
                .font(.headline)

            if attentionItems.isEmpty {
                Text("No urgent, in-review, or blocked tasks requiring immediate attention.")
                    .font(.callout).foregroundStyle(.secondary)
                    .padding(14)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(Color(nsColor: .controlBackgroundColor))
                    .clipShape(RoundedRectangle(cornerRadius: 8))
            } else {
                VStack(spacing: 8) {
                    ForEach(attentionItems.prefix(5)) { task in
                        HStack(spacing: 12) {
                            priorityBadge(task.priority)
                            statusBadge(task.status)
                            Text(task.title).font(.callout.weight(.medium)).lineLimit(1)
                            Spacer()
                            if let assignee = task.assignee, !assignee.isEmpty {
                                Label(assignee, systemImage: "person.circle").font(.caption).foregroundStyle(.secondary)
                            }
                            Button("View") {
                                Task { await model.openTask(task.id, projectID: task.projectId) }
                            }
                            .buttonStyle(.bordered)
                            .controlSize(.small)
                        }
                        .padding(10)
                        .background(Color(nsColor: .controlBackgroundColor))
                        .clipShape(RoundedRectangle(cornerRadius: 8))
                    }
                }
            }
        }
    }

    // MARK: - Aging & Status Breakdown

    private func agingAndThroughputSection(_ store: WorkStore) -> some View {
        let activeTasks = store.tasks.filter { !$0.isArchived && !$0.isDone }
        let groupedByStatus = Dictionary(grouping: activeTasks, by: \.status)

        return VStack(alignment: .leading, spacing: 12) {
            Label("Status Distribution & Work Aging", systemImage: "chart.bar.xaxis")
                .font(.headline)

            if activeTasks.isEmpty {
                Text("No active tasks to analyze.").foregroundStyle(.secondary)
            } else {
                VStack(spacing: 8) {
                    ForEach(groupedByStatus.keys.sorted(), id: \.self) { status in
                        let list = groupedByStatus[status] ?? []
                        let avgAgeDays = averageAgeDays(for: list)

                        HStack {
                            statusBadge(status)
                            Text("\(list.count) task\(list.count == 1 ? "" : "s")").font(.callout.weight(.medium))
                            Spacer()
                            Text("Avg age: \(avgAgeDays)d").font(.caption).foregroundStyle(.secondary)
                        }
                        .padding(10)
                        .background(Color(nsColor: .controlBackgroundColor))
                        .clipShape(RoundedRectangle(cornerRadius: 8))
                    }
                }
            }
        }
    }

    private func averageAgeDays(for tasks: [TaskItem]) -> Int {
        let now = Date()
        let ages = tasks.compactMap { task -> Double? in
            guard let created = task.createdDate else { return nil }
            return now.timeIntervalSince(created) / (86400.0)
        }
        guard !ages.isEmpty else { return 0 }
        let total = ages.reduce(0, +)
        return Int(total / Double(ages.count))
    }

    // MARK: - Recent Activity Feed

    private func activityFeedSection(_ store: WorkStore) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Label("Recent Task Activity", systemImage: "clock.arrow.circlepath").font(.headline)
                Spacer()
                if store.isLoadingActivities {
                    ProgressView().controlSize(.small)
                }
            }

            if store.activities.isEmpty && !store.isLoadingActivities {
                Text("No recent activity recorded across task version histories.")
                    .font(.callout).foregroundStyle(.secondary)
                    .padding(14)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(Color(nsColor: .controlBackgroundColor))
                    .clipShape(RoundedRectangle(cornerRadius: 8))
            } else {
                VStack(spacing: 8) {
                    ForEach(store.activities) { entry in
                        HStack(alignment: .top, spacing: 12) {
                            Image(systemName: "pencil.circle.fill")
                                .foregroundStyle(WorkspaceStyle.accent)
                                .padding(.top, 2)

                            VStack(alignment: .leading, spacing: 4) {
                                HStack {
                                    Text(entry.taskTitle).font(.callout.weight(.semibold))
                                    Text("v\(entry.version)").font(.caption).foregroundStyle(.secondary)
                                    Spacer()
                                    Text(ISO8601Parser.relativeString(from: entry.date))
                                        .font(.caption2).foregroundStyle(.secondary)
                                }

                                if let author = entry.author, !author.isEmpty {
                                    Text("By \(author)").font(.caption2).foregroundStyle(.secondary)
                                }

                                ForEach(entry.changes) { change in
                                    Text("• \(change.field): \(describeChange(change))")
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                }
                            }
                        }
                        .padding(10)
                        .background(Color(nsColor: .controlBackgroundColor))
                        .clipShape(RoundedRectangle(cornerRadius: 8))
                    }
                }
            }
        }
    }

    private func describeChange(_ change: TaskChangeItem) -> String {
        let oldStr = change.oldValue?.stringValue ?? "none"
        let newStr = change.newValue?.stringValue ?? "none"
        if oldStr.isEmpty && newStr.isEmpty { return "updated" }
        return "\(oldStr) → \(newStr)"
    }

    // MARK: - Badges & Helpers

    private func statusBadge(_ status: String) -> some View {
        Text(status.uppercased())
            .font(.system(size: 9, weight: .bold))
            .padding(.horizontal, 6)
            .padding(.vertical, 2)
            .background(statusColor(status).opacity(0.18))
            .foregroundStyle(statusColor(status))
            .clipShape(Capsule())
    }

    private func priorityBadge(_ priority: String) -> some View {
        Text(priority.uppercased())
            .font(.system(size: 9, weight: .bold))
            .padding(.horizontal, 6)
            .padding(.vertical, 2)
            .background(priorityColor(priority).opacity(0.18))
            .foregroundStyle(priorityColor(priority))
            .clipShape(Capsule())
    }

    private func statusColor(_ status: String) -> Color {
        switch status.lowercased() {
        case "done": return .green
        case "in-progress": return .blue
        case "in-review": return .purple
        case "blocked", "urgent": return .red
        case "on-hold": return .orange
        default: return .secondary
        }
    }

    private func priorityColor(_ priority: String) -> Color {
        switch priority.lowercased() {
        case "high", "urgent": return .red
        case "medium": return .orange
        case "low": return .secondary
        default: return .secondary
        }
    }

    private func formatDuration(seconds: Int) -> String {
        let hrs = seconds / 3600
        let mins = (seconds % 3600) / 60
        let secs = seconds % 60
        if hrs > 0 {
            return String(format: "%02d:%02d:%02d", hrs, mins, secs)
        }
        return String(format: "%02d:%02d", mins, secs)
    }
}
