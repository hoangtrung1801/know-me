import SwiftUI
import KnowMeCore

struct AgentRunView: View {
    @Bindable var model: AppModel
    private let initialTaskID: String?

    @State private var store: AgentStore?
    @State private var currentTaskID: String = ""
    @State private var manualTaskInput: String = ""
    @State private var activeTab: AgentRunTab = .overview
    @State private var reviewComment = ""
    @State private var commitMessage = ""
    @State private var isShowingCommentSheet = false
    @State private var pendingAction: AgentAction?

    enum AgentRunTab: String, CaseIterable, Identifiable {
        case overview = "Workflow"
        case diff = "Diff & Changes"
        case runs = "Run History & Logs"
        case chat = "Agent Chat"
        var id: String { rawValue }
    }

    init(model: AppModel) {
        self.model = model
        self.initialTaskID = nil
    }

    init(model: AppModel, taskID: String) {
        self.model = model
        self.initialTaskID = taskID
    }

    var body: some View {
        Group {
            if let store {
                VStack(spacing: 0) {
                    if currentTaskID.isEmpty {
                        taskSelectorView(store: store)
                    } else {
                        workflowHeader(store: store)
                        Divider()
                        tabBar
                        Divider()

                        switch activeTab {
                        case .overview:
                            workflowOverviewTab(store: store)
                        case .diff:
                            diffTab(store: store)
                        case .runs:
                            runsHistoryTab(store: store)
                        case .chat:
                            taskChatTab(store: store)
                        }
                    }
                }
                .task(id: currentTaskID) {
                    if !currentTaskID.isEmpty {
                        await store.loadTaskWorkflow(taskId: currentTaskID)
                        await store.loadTaskDiff(taskId: currentTaskID)
                    }
                }
                .task(id: model.eventSequence) {
                    store.checkServerEvents()
                }
                .sheet(isPresented: $isShowingCommentSheet) {
                    commentSheet(store: store)
                }
            } else {
                ProgressView("Loading Agent Workspace…")
                    .task {
                        let newStore = AgentStore(model: model)
                        self.store = newStore
                        if let id = initialTaskID, !id.isEmpty {
                            self.currentTaskID = id
                        }
                        await newStore.refreshStatuses()
                    }
            }
        }
    }

    // MARK: - Task Selector (when not opened with taskID)

    private func taskSelectorView(store: AgentStore) -> some View {
        VStack(spacing: 24) {
            Image(systemName: "cpu")
                .font(.system(size: 48))
                .foregroundStyle(WorkspaceStyle.accent)

            VStack(spacing: 6) {
                Text("Select Task for OMP Agent")
                    .font(.title2.weight(.semibold))
                Text("Enter a task identifier to inspect its agent workflow, approve plans, or review code changes.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
            }

            HStack(spacing: 8) {
                TextField("Task ID (e.g. c9axmk)", text: $manualTaskInput)
                    .textFieldStyle(.roundedBorder)
                    .frame(width: 240)

                Button("Open Task") {
                    let trimmed = manualTaskInput.trimmingCharacters(in: .whitespacesAndNewlines)
                    if !trimmed.isEmpty {
                        currentTaskID = trimmed
                    }
                }
                .buttonStyle(.borderedProminent)
                .tint(WorkspaceStyle.accent)
                .disabled(manualTaskInput.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            }
        }
        .padding(40)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    // MARK: - Workflow Header

    private func workflowHeader(store: AgentStore) -> some View {
        VStack(spacing: 10) {
            HStack(alignment: .center, spacing: 14) {
                VStack(alignment: .leading, spacing: 3) {
                    HStack(spacing: 8) {
                        Text("Task Agent:")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                        Text(currentTaskID)
                            .font(.headline.monospaced())
                            .textSelection(.enabled)

                        if let branch = store.taskSnapshot?.workflow.worktreeBranch {
                            Label(branch, systemImage: "arrow.triangle.branch")
                                .font(.caption.monospaced())
                                .padding(.horizontal, 6)
                                .padding(.vertical, 2)
                                .background(Color.blue.opacity(0.12))
                                .foregroundStyle(.blue)
                                .clipShape(RoundedRectangle(cornerRadius: 4))
                        }
                    }

                    if let commit = store.taskSnapshot?.workflow.worktreeCommit {
                        Text("Commit: \(commit)")
                            .font(.caption.monospaced())
                            .foregroundStyle(.secondary)
                    }
                }

                Spacer()

                // Phase Badge
                if let phase = store.taskSnapshot?.workflow.phase {
                    HStack(spacing: 6) {
                        Image(systemName: phase.symbol)
                        Text(phase.title)
                    }
                    .font(.subheadline.weight(.semibold))
                    .padding(.horizontal, 10)
                    .padding(.vertical, 5)
                    .background(phaseBadgeColor(phase).opacity(0.15))
                    .foregroundStyle(phaseBadgeColor(phase))
                    .clipShape(Capsule())
                }

                Button {
                    Task {
                        await store.loadTaskWorkflow(taskId: currentTaskID)
                        await store.loadTaskDiff(taskId: currentTaskID)
                    }
                } label: {
                    Image(systemName: "arrow.clockwise")
                }
                .buttonStyle(.borderless)
                .disabled(store.isTaskActionBusy)
            }

            // OMP status warning if not ready
            if let omp = store.ompStatus, !omp.isReady {
                HStack(spacing: 8) {
                    Image(systemName: "exclamationmark.triangle.fill")
                        .foregroundStyle(.orange)
                    Text(omp.installed ? "OMP installed but not logged in. Run '\(omp.loginCommand)' in terminal." : "OMP not installed. Run '\(omp.installCommand ?? "brew install can1357/tap/omp")'.")
                        .font(.caption)
                    Spacer()
                }
                .padding(8)
                .background(Color.yellow.opacity(0.12))
                .clipShape(RoundedRectangle(cornerRadius: 6))
            }

            // Progress banner
            if let progress = store.taskProgressMessage {
                HStack(spacing: 8) {
                    ProgressView().controlSize(.mini)
                    Text(progress)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    Spacer()
                }
            }

            // Error notice
            if let error = store.taskActionError {
                HStack(spacing: 8) {
                    Image(systemName: "xmark.circle.fill")
                        .foregroundStyle(.red)
                    Text(error)
                        .font(.caption)
                        .foregroundStyle(.red)
                    Spacer()
                }
                .padding(8)
                .background(Color.red.opacity(0.08))
                .clipShape(RoundedRectangle(cornerRadius: 6))
            }
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 12)
        .background(Color.secondary.opacity(0.04))
    }

    private var tabBar: some View {
        HStack(spacing: 16) {
            ForEach(AgentRunTab.allCases) { tab in
                Button {
                    activeTab = tab
                } label: {
                    VStack(spacing: 6) {
                        Text(tab.rawValue)
                            .font(.subheadline.weight(activeTab == tab ? .semibold : .regular))
                            .foregroundStyle(activeTab == tab ? WorkspaceStyle.accent : .secondary)

                        Rectangle()
                            .fill(activeTab == tab ? WorkspaceStyle.accent : Color.clear)
                            .frame(height: 2)
                    }
                }
                .buttonStyle(.plain)
            }
            Spacer()
        }
        .padding(.horizontal, 20)
        .padding(.top, 8)
    }

    // MARK: - Workflow Overview Tab

    private func workflowOverviewTab(store: AgentStore) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                // Action Controls Section
                GroupBox("Actions & Human Approvals") {
                    VStack(alignment: .leading, spacing: 14) {
                        actionButtons(store: store)
                    }
                    .padding(8)
                    .frame(maxWidth: .infinity, alignment: .leading)
                }

                // Review Comments
                if let comments = store.taskSnapshot?.reviewComments, !comments.isEmpty {
                    GroupBox("Review Feedback History") {
                        VStack(alignment: .leading, spacing: 10) {
                            ForEach(comments) { comment in
                                VStack(alignment: .leading, spacing: 4) {
                                    HStack {
                                        Text(comment.stage.capitalized + " Review")
                                            .font(.caption.weight(.bold))
                                            .foregroundStyle(WorkspaceStyle.accent)
                                        Spacer()
                                        Text(comment.createdAt)
                                            .font(.caption2)
                                            .foregroundStyle(.secondary)
                                    }
                                    Text(comment.body)
                                        .font(.body)
                                }
                                .padding(8)
                                .background(Color.secondary.opacity(0.05))
                                .clipShape(RoundedRectangle(cornerRadius: 6))
                            }
                        }
                        .padding(6)
                    }
                }

                // Dirty files preview
                if let files = store.taskSnapshot?.dirtyFiles, !files.isEmpty {
                    GroupBox("Workspace Changes (\(files.count) files)") {
                        VStack(alignment: .leading, spacing: 6) {
                            ForEach(files, id: \.self) { file in
                                HStack(spacing: 6) {
                                    Image(systemName: "doc")
                                        .foregroundStyle(.secondary)
                                    Text(file)
                                        .font(.system(.caption, design: .monospaced))
                                }
                            }
                        }
                        .padding(6)
                    }
                }
            }
            .padding(20)
        }
    }

    @ViewBuilder
    private func actionButtons(store: AgentStore) -> some View {
        let phase = store.taskSnapshot?.workflow.phase ?? .idle
        let busy = store.isTaskActionBusy

        VStack(alignment: .leading, spacing: 10) {
            switch phase {
            case .idle:
                HStack(spacing: 12) {
                    Button {
                        Task { await store.runTaskAction(taskId: currentTaskID, action: .startAgent) }
                    } label: {
                        Label("Start OMP Agent", systemImage: "play.fill")
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(WorkspaceStyle.accent)
                    .disabled(busy)

                    Button {
                        Task { await store.runTaskAction(taskId: currentTaskID, action: .startInvestigation) }
                    } label: {
                        Label("Start Investigation", systemImage: "magnifyingglass")
                    }
                    .buttonStyle(.bordered)
                    .disabled(busy)
                }

            case .investigating, .implementing:
                Button(role: .destructive) {
                    Task { await store.runTaskAction(taskId: currentTaskID, action: .cancel) }
                } label: {
                    Label("Cancel Run", systemImage: "stop.circle")
                }
                .buttonStyle(.bordered)
                .disabled(busy)

            case .planReview:
                HStack(spacing: 12) {
                    Button {
                        Task { await store.runTaskAction(taskId: currentTaskID, action: .approvePlan) }
                    } label: {
                        Label("Approve Plan & Implement", systemImage: "checkmark.circle.fill")
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(WorkspaceStyle.accent)
                    .disabled(busy)

                    Button {
                        promptComment(action: .requestPlanChanges)
                    } label: {
                        Label("Request Plan Changes…", systemImage: "arrow.counterclockwise")
                    }
                    .buttonStyle(.bordered)
                    .disabled(busy)

                    if (store.taskSnapshot?.dirtyFiles.count ?? 0) > 0 {
                        Button {
                            Task { await store.runTaskAction(taskId: currentTaskID, action: .createWorktree) }
                        } label: {
                            Label("Create Worktree", systemImage: "arrow.triangle.branch")
                        }
                        .buttonStyle(.bordered)
                        .disabled(busy)
                    }
                }

            case .codeReview:
                VStack(alignment: .leading, spacing: 10) {
                    HStack(spacing: 12) {
                        Button {
                            Task { await store.runTaskAction(taskId: currentTaskID, action: .approveImplementation) }
                        } label: {
                            Label("Approve Implementation", systemImage: "checkmark.circle.fill")
                        }
                        .buttonStyle(.borderedProminent)
                        .tint(WorkspaceStyle.accent)
                        .disabled(busy)

                        Button {
                            promptComment(action: .requestImplementationChanges)
                        } label: {
                            Label("Request Changes…", systemImage: "arrow.counterclockwise")
                        }
                        .buttonStyle(.bordered)
                        .disabled(busy)
                    }

                    HStack(spacing: 8) {
                        TextField("Commit message", text: $commitMessage)
                            .textFieldStyle(.roundedBorder)

                        Button("Commit Worktree") {
                            let msg = commitMessage.isEmpty ? "feat(\(currentTaskID)): implementation" : commitMessage
                            Task { await store.runTaskAction(taskId: currentTaskID, action: .commitWorktree, comment: msg) }
                        }
                        .buttonStyle(.bordered)
                        .disabled(busy)
                    }
                }

            case .fixReady:
                Button {
                    Task { await store.runTaskAction(taskId: currentTaskID, action: .startFix) }
                } label: {
                    Label("Start Fix", systemImage: "wrench.and.screwdriver")
                }
                .buttonStyle(.borderedProminent)
                .tint(WorkspaceStyle.accent)
                .disabled(busy)

            case .readyToMerge:
                HStack(spacing: 12) {
                    Button {
                        Task { await store.runTaskAction(taskId: currentTaskID, action: .mergeWorktree) }
                    } label: {
                        Label("Merge to Main", systemImage: "arrow.triangle.merge")
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(.green)
                    .disabled(busy)

                    Button {
                        Task { await store.runTaskAction(taskId: currentTaskID, action: .completeWithoutMerge) }
                    } label: {
                        Label("Complete Without Merge", systemImage: "checkmark")
                    }
                    .buttonStyle(.bordered)
                    .disabled(busy)
                }

            case .interrupted:
                Button {
                    Task { await store.runTaskAction(taskId: currentTaskID, action: .resume) }
                } label: {
                    Label("Resume Run", systemImage: "play.circle")
                }
                .buttonStyle(.borderedProminent)
                .tint(WorkspaceStyle.accent)
                .disabled(busy)

            case .completed:
                Label("Workflow Completed", systemImage: "checkmark.seal.fill")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(.green)
            }
        }
    }

    // MARK: - Diff Tab

    private func diffTab(store: AgentStore) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                HStack {
                    Text("Code Changes & Worktree Diff")
                        .font(.headline)
                    Spacer()
                    Button("Refresh Diff") {
                        Task { await store.loadTaskDiff(taskId: currentTaskID) }
                    }
                    .buttonStyle(.bordered)
                    .controlSize(.small)
                }

                DiffViewer(diff: store.taskDiff, dirtyFiles: store.taskSnapshot?.dirtyFiles ?? [])
            }
            .padding(20)
        }
    }

    // MARK: - Run History & Logs Tab

    private func runsHistoryTab(store: AgentStore) -> some View {
        HSplitView {
            // Runs list
            List(store.taskSnapshot?.runs ?? [], selection: Binding(
                get: { store.selectedRunId },
                set: { runId in
                    if let runId {
                        Task { await store.loadRunLog(taskId: currentTaskID, runId: runId) }
                    }
                }
            )) { run in
                VStack(alignment: .leading, spacing: 3) {
                    HStack {
                        Text(run.phase.capitalized)
                            .font(.headline)
                        Spacer()
                        Text(run.status.uppercased())
                            .font(.system(size: 9, weight: .bold))
                            .padding(.horizontal, 4)
                            .padding(.vertical, 1)
                            .background(Color.secondary.opacity(0.15))
                            .clipShape(RoundedRectangle(cornerRadius: 3))
                    }
                    if let summary = run.summary, !summary.isEmpty {
                        Text(summary)
                            .font(.caption)
                            .lineLimit(2)
                    }
                    if let started = run.startedAt {
                        Text("Started: \(started)")
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                    }
                }
                .padding(.vertical, 4)
                .tag(run.id)
            }
            .frame(minWidth: 220, idealWidth: 260)

            // Log output
            VStack(alignment: .leading, spacing: 8) {
                Text("Execution Log")
                    .font(.headline)
                    .padding(.horizontal, 14)
                    .padding(.top, 12)

                if let log = store.activeRunLog {
                    ScrollView([.horizontal, .vertical]) {
                        Text(log.isEmpty ? "No log output recorded." : log)
                            .font(.system(.caption, design: .monospaced))
                            .padding(12)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .textSelection(.enabled)
                    }
                    .background(Color(NSColor.textBackgroundColor))
                } else {
                    ContentUnavailableView("Select Run", systemImage: "terminal", description: Text("Choose an agent run to inspect its stdout and execution output."))
                }
            }
            .frame(minWidth: 320)
        }
    }

    // MARK: - Task Chat Tab

    private func taskChatTab(store: AgentStore) -> some View {
        VStack {
            if let chatId = store.taskSnapshot?.chatSessionId ?? store.taskSnapshot?.workflow.chatSessionId {
                Text("Linked Task Chat: \(chatId)")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .padding(.top, 8)
                ChatView(model: model)
            } else {
                ContentUnavailableView {
                    Label("No Chat Linked", systemImage: "bubble.left")
                } description: {
                    Text("A chat session will be automatically linked when the agent begins investigation.")
                }
            }
        }
    }

    // MARK: - Feedback Comment Sheet

    private func commentSheet(store: AgentStore) -> some View {
        VStack(spacing: 16) {
            Text(pendingAction?.title ?? "Review Comment")
                .font(.headline)

            TextEditor(text: $reviewComment)
                .font(.body)
                .frame(height: 120)
                .padding(6)
                .background(Color(NSColor.textBackgroundColor))
                .clipShape(RoundedRectangle(cornerRadius: 6))
                .overlay(RoundedRectangle(cornerRadius: 6).stroke(Color.secondary.opacity(0.3)))

            HStack {
                Button("Cancel") { isShowingCommentSheet = false }
                    .keyboardShortcut(.cancelAction)
                Spacer()
                Button("Submit Feedback") {
                    if let act = pendingAction {
                        Task {
                            await store.runTaskAction(taskId: currentTaskID, action: act, comment: reviewComment)
                            reviewComment = ""
                            isShowingCommentSheet = false
                        }
                    }
                }
                .buttonStyle(.borderedProminent)
                .tint(WorkspaceStyle.accent)
                .keyboardShortcut(.defaultAction)
                .disabled(reviewComment.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            }
        }
        .padding(20)
        .frame(width: 440, height: 260)
    }

    private func promptComment(action: AgentAction) {
        pendingAction = action
        isShowingCommentSheet = true
    }

    private func phaseBadgeColor(_ phase: AgentPhase) -> Color {
        switch phase {
        case .idle: return .secondary
        case .investigating, .implementing: return .blue
        case .planReview, .codeReview: return .orange
        case .fixReady: return .purple
        case .readyToMerge, .completed: return .green
        case .interrupted: return .red
        }
    }
}
