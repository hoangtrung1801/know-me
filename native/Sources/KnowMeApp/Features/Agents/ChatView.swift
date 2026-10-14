import SwiftUI
import KnowMeCore

struct ChatView: View {
    @Bindable var model: AppModel
    @State private var store: AgentStore?
    @State private var sessionFilter: SessionFilter = .all
    @State private var searchText = ""
    @State private var showingNewChatSheet = false
    @State private var composerText = ""
    @State private var draftLoaded = false
    @State private var editingTitleSessionId: String?
    @State private var renameTitle = ""

    enum SessionFilter: String, CaseIterable, Identifiable {
        case all = "All"
        case standalone = "General"
        case taskBound = "Task Agent"
        var id: String { rawValue }
    }

    init(model: AppModel) {
        self.model = model
    }

    var body: some View {
        Group {
            if let store {
                NavigationSplitView {
                    sidebar(store: store)
                        .navigationSplitViewColumnWidth(min: 240, ideal: 280, max: 360)
                } detail: {
                    detail(store: store)
                }
                .task(id: model.workspaceKey) {
                    await store.syncWorkspace()
                }
                .task(id: model.eventSequence) {
                    store.checkServerEvents()
                }
                .onChange(of: model.showCreate) { _, show in
                    if show { model.showCreate = false; showingNewChatSheet = true }
                }
                .sheet(isPresented: $showingNewChatSheet) {
                    NewChatSheet(store: store, isPresented: $showingNewChatSheet)
                }
            } else {
                ProgressView("Initializing Agent Store…")
                    .task {
                        let newStore = AgentStore(model: model)
                        self.store = newStore
                        await newStore.loadSessions()
                        await newStore.refreshStatuses()
                    }
            }
        }
    }

    // MARK: - Sidebar

    private func sidebar(store: AgentStore) -> some View {
        VStack(spacing: 0) {
            // Header actions
            HStack {
                Text("Chat Sessions")
                    .font(.headline)
                Spacer()
                Button {
                    showingNewChatSheet = true
                } label: {
                    Label("New Chat", systemImage: "plus")
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.small)
                .tint(WorkspaceStyle.accent)
            }
            .padding(.horizontal, 16)
            .padding(.top, 14)
            .padding(.bottom, 8)

            // Filter picker & search
            VStack(spacing: 6) {
                Picker("Filter", selection: $sessionFilter) {
                    ForEach(SessionFilter.allCases) { filter in
                        Text(filter.rawValue).tag(filter)
                    }
                }
                .pickerStyle(.segmented)
                .labelsHidden()

                TextField("Search chats…", text: $searchText)
                    .textFieldStyle(.roundedBorder)
            }
            .padding(.horizontal, 16)
            .padding(.bottom, 8)

            Divider()

            // Session List
            if store.isLoadingSessions && store.sessions.isEmpty {
                Spacer()
                ProgressView("Loading chats…")
                Spacer()
            } else if filteredSessions(store.sessions).isEmpty {
                ContentUnavailableView {
                    Label("No Chats", systemImage: "bubble.left.and.bubble.right")
                } description: {
                    Text("Start a new conversation with an agent.")
                }
            } else {
                List(filteredSessions(store.sessions), selection: Binding(
                    get: { store.activeSessionId },
                    set: { id in
                        saveCurrentDraft(store: store)
                        Task {
                            await store.selectSession(id: id)
                            if store.activeSessionId == id { loadDraftForActive(store: store) }
                        }
                    }
                )) { session in
                    sessionRow(session: session, store: store)
                        .tag(session.id)
                }
                .listStyle(.sidebar)
            }
        }
    }

    private func sessionRow(session: ChatSessionDTO, store: AgentStore) -> some View {
        HStack(spacing: 10) {
            agentTypeIcon(session.agentType)

            VStack(alignment: .leading, spacing: 3) {
                if editingTitleSessionId == session.id {
                    TextField("Chat title", text: $renameTitle, onCommit: {
                        Task {
                            await store.updateTitle(id: session.id, title: renameTitle)
                            editingTitleSessionId = nil
                        }
                    })
                    .textFieldStyle(.roundedBorder)
                } else {
                    Text(session.title.isEmpty ? "New Chat" : session.title)
                        .font(.body.weight(store.activeSessionId == session.id ? .semibold : .regular))
                        .lineLimit(1)
                }

                HStack(spacing: 6) {
                    Text(session.agentType.uppercased())
                        .font(.system(size: 9, weight: .bold))
                        .padding(.horizontal, 4)
                        .padding(.vertical, 1)
                        .background(Color.secondary.opacity(0.15))
                        .clipShape(RoundedRectangle(cornerRadius: 3))

                    if let model = session.model, !model.isEmpty {
                        Text(model)
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                            .lineLimit(1)
                    }

                    if session.isTaskBound {
                        Image(systemName: "checklist")
                            .font(.caption2)
                            .foregroundStyle(WorkspaceStyle.accent)
                    }

                    if session.isStreaming {
                        ProgressView()
                            .controlSize(.mini)
                    }
                }
            }

            Spacer()
        }
        .padding(.vertical, 4)
        .contextMenu {
            Button("Rename") {
                renameTitle = session.title
                editingTitleSessionId = session.id
            }

            if !session.isTaskBound {
                Button("Delete", role: .destructive) {
                    Task { await store.deleteSession(id: session.id) }
                }
            }
        }
    }

    // MARK: - Detail / Transcript

    private func detail(store: AgentStore) -> some View {
        VStack(spacing: 0) {
            if let session = store.activeSession {
                // Header
                detailHeader(session: session, store: store)
                Divider()

                // OpenCode Status Banner if applicable
                if session.agentType == "opencode", store.openCodeStatus?.ready == false {
                    openCodeUnavailableBanner(store: store)
                }

                // Transcript
                ScrollViewReader { proxy in
                    ScrollView {
                        LazyVStack(alignment: .leading, spacing: 14) {
                            if session.messages.isEmpty {
                                ContentUnavailableView {
                                    Label("Empty Chat", systemImage: "text.bubble")
                                } description: {
                                    Text("Send a message to start conversing with \(session.agentType.uppercased()).")
                                }
                                .padding(.top, 40)
                            } else {
                                ForEach(session.messages) { message in
                                    messageBubble(message: message, store: store)
                                        .id(message.id)
                                }
                            }

                            if session.isStreaming {
                                HStack(spacing: 8) {
                                    ProgressView().controlSize(.small)
                                    Text("Agent is thinking…")
                                        .font(.subheadline)
                                        .foregroundStyle(.secondary)
                                }
                                .padding(.horizontal, 16)
                                .id("streaming_indicator")
                            }
                        }
                        .padding(16)
                    }
                    .onChange(of: session.messages.count) { _, _ in
                        if let lastId = session.messages.last?.id {
                            withAnimation {
                                proxy.scrollTo(lastId, anchor: .bottom)
                            }
                        }
                    }
                }

                Divider()

                // Queue indicator if pending
                if let queue = store.queueStatus, queue.queueSize > 0 {
                    HStack(spacing: 8) {
                        Label("\(queue.queueSize) message(s) queued", systemImage: "clock")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                        Spacer()
                        Button("Process Next") {
                            Task { await store.processQueue(for: session.id) }
                        }
                        .buttonStyle(.bordered)
                        .controlSize(.mini)
                    }
                    .padding(.horizontal, 16)
                    .padding(.vertical, 6)
                    .background(Color.secondary.opacity(0.06))
                    Divider()
                }

                // Composer
                composer(session: session, store: store)
            } else {
                ContentUnavailableView {
                    Label("No Chat Selected", systemImage: "bubble.left")
                } description: {
                    Text("Select a conversation from the sidebar or create a new one.")
                }
            }
        }
    }

    private func detailHeader(session: ChatSessionDTO, store: AgentStore) -> some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 2) {
                Text(session.title.isEmpty ? "New Chat" : session.title)
                    .font(.headline)

                HStack(spacing: 8) {
                    Text(session.agentType.uppercased())
                        .font(.caption.weight(.bold))
                        .foregroundStyle(WorkspaceStyle.accent)

                    if let model = session.model, !model.isEmpty {
                        Text("• \(model)")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }

                    if session.isTaskBound, let taskId = session.taskId {
                        Text("• Task: \(taskId)")
                            .font(.caption)
                            .foregroundStyle(WorkspaceStyle.accent)
                    }
                }
            }

            Spacer()

            if session.isStreaming {
                Button(role: .destructive) {
                    Task { await store.stopChat() }
                } label: {
                    Label("Stop", systemImage: "stop.circle.fill")
                }
                .buttonStyle(.bordered)
                .controlSize(.small)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
    }

    private func openCodeUnavailableBanner(store: AgentStore) -> some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: "exclamationmark.triangle.fill")
                .foregroundStyle(.orange)
                .font(.title3)

            VStack(alignment: .leading, spacing: 4) {
                Text("OpenCode Runtime Not Ready")
                    .font(.subheadline.weight(.semibold))

                Text(store.openCodeStatus?.lastError ?? "The OpenCode server is currently disabled or unreachable. Check your runtime configuration or server settings.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Spacer()
        }
        .padding(12)
        .background(Color.yellow.opacity(0.12))
        .clipShape(RoundedRectangle(cornerRadius: 8))
        .padding(.horizontal, 16)
        .padding(.vertical, 8)
    }

    // MARK: - Message Bubble

    private func messageBubble(message: ChatMessageDTO, store: AgentStore) -> some View {
        VStack(alignment: message.role == "user" ? .trailing : .leading, spacing: 6) {
            HStack(spacing: 6) {
                if message.role == "user" {
                    Spacer()
                    Text("You").font(.caption.weight(.semibold)).foregroundStyle(.secondary)
                } else {
                    agentTypeIcon(message.model ?? "omp")
                    Text(message.model ?? "Agent").font(.caption.weight(.semibold)).foregroundStyle(.secondary)
                    if let phase = message.phase {
                        Text(phase.capitalized)
                            .font(.system(size: 9, weight: .bold))
                            .padding(.horizontal, 4)
                            .padding(.vertical, 1)
                            .background(Color.secondary.opacity(0.1))
                            .clipShape(RoundedRectangle(cornerRadius: 3))
                    }
                    Spacer()
                }
            }

            if !message.content.isEmpty {
                Text(message.content)
                    .font(.body)
                    .padding(12)
                    .background(message.role == "user" ? WorkspaceStyle.accent.opacity(0.12) : Color.secondary.opacity(0.08))
                    .foregroundStyle(Color.primary)
                    .clipShape(RoundedRectangle(cornerRadius: 10))
                    .textSelection(.enabled)
            }

            // Tool calls
            if let tools = message.toolCalls, !tools.isEmpty {
                VStack(alignment: .leading, spacing: 6) {
                    ForEach(tools) { tool in
                        ChatToolCallView(toolCall: tool)
                    }
                }
            }

            // Question blocks
            if let questions = message.questionBlocks, !questions.isEmpty {
                VStack(alignment: .leading, spacing: 8) {
                    ForEach(questions) { question in
                        ChatQuestionView(questionBlock: question) { answers in
                            Task {
                                do { try await store.service.replyOpenCodeQuestion(questionId: question.id, answers: answers) }
                                catch { model.report(error) }
                            }
                        } onReject: {
                            Task {
                                do { try await store.service.rejectOpenCodeQuestion(questionId: question.id) }
                                catch { model.report(error) }
                            }
                        }
                    }
                }
            }

            // Attachments
            if let attachments = message.attachments, !attachments.isEmpty {
                HStack(spacing: 8) {
                    ForEach(attachments) { att in
                        Label(att.filename, systemImage: "doc")
                            .font(.caption)
                            .padding(.horizontal, 8)
                            .padding(.vertical, 4)
                            .background(Color.secondary.opacity(0.1))
                            .clipShape(RoundedRectangle(cornerRadius: 6))
                    }
                }
            }

            // Error display
            if let error = message.error, !error.isEmpty {
                HStack(spacing: 6) {
                    Image(systemName: "exclamationmark.circle.fill")
                        .foregroundStyle(.red)
                    Text(error)
                        .font(.caption)
                        .foregroundStyle(.red)
                }
                .padding(8)
                .background(Color.red.opacity(0.08))
                .clipShape(RoundedRectangle(cornerRadius: 6))
            }
        }
    }

    // MARK: - Composer

    private func composer(session: ChatSessionDTO, store: AgentStore) -> some View {
        VStack(spacing: 8) {
            TextEditor(text: Binding(
                get: { composerText },
                set: { val in
                    composerText = val
                    store.saveDraft(sessionId: session.id, text: val)
                }
            ))
            .font(.body)
            .frame(minHeight: 60, maxHeight: 120)
            .padding(6)
            .background(Color(NSColor.textBackgroundColor))
            .clipShape(RoundedRectangle(cornerRadius: 8))
            .overlay(
                RoundedRectangle(cornerRadius: 8)
                    .stroke(Color.secondary.opacity(0.25), lineWidth: 1)
            )

            HStack {
                Text("⌘Return to send")
                    .font(.caption2)
                    .foregroundStyle(.secondary)

                Spacer()

                Button {
                    let content = composerText
                    composerText = ""
                    Task {
                        let sent = await store.sendMessage(content: content, sessionID: session.id)
                        if !sent, store.activeSessionId == session.id, composerText.isEmpty {
                            composerText = content
                        }
                    }
                } label: {
                    Label("Send", systemImage: "paperplane.fill")
                }
                .buttonStyle(.borderedProminent)
                .keyboardShortcut(.return, modifiers: .command)
                .tint(WorkspaceStyle.accent)
                .disabled(composerText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || store.isSending)
            }
        }
        .padding(14)
        .background(Color.secondary.opacity(0.03))
        .onAppear { loadDraftForActive(store: store) }
        .onChange(of: session.id) { _, _ in loadDraftForActive(store: store) }
    }

    // MARK: - Helpers

    private func loadDraftForActive(store: AgentStore) {
        composerText = store.activeSessionId.map { store.loadDraft(sessionId: $0) } ?? ""
    }

    private func saveCurrentDraft(store: AgentStore) {
        if let activeId = store.activeSessionId {
            store.saveDraft(sessionId: activeId, text: composerText)
        }
    }

    private func filteredSessions(_ sessions: [ChatSessionDTO]) -> [ChatSessionDTO] {
        sessions.filter { session in
            let matchesFilter: Bool = {
                switch sessionFilter {
                case .all: return true
                case .standalone: return !session.isTaskBound
                case .taskBound: return session.isTaskBound
                }
            }()
            let matchesSearch = searchText.isEmpty ||
                session.title.localizedCaseInsensitiveContains(searchText) ||
                (session.model?.localizedCaseInsensitiveContains(searchText) ?? false)
            return matchesFilter && matchesSearch
        }
    }

    @ViewBuilder
    private func agentTypeIcon(_ type: String) -> some View {
        switch type {
        case "claude":
            Image(systemName: "sparkles")
                .foregroundStyle(.orange)
        case "opencode":
            Image(systemName: "chevron.left.forwardslash.chevron.right")
                .foregroundStyle(.purple)
        default:
            Image(systemName: "terminal")
                .foregroundStyle(WorkspaceStyle.accent)
        }
    }
}

// MARK: - New Chat Sheet

struct NewChatSheet: View {
    let store: AgentStore
    @Binding var isPresented: Bool

    @State private var title = "New Chat"
    @State private var agentType = "omp"
    @State private var modelName = ""
    @State private var taskId = ""

    var body: some View {
        VStack(spacing: 18) {
            Text("Create New Chat")
                .font(.headline)

            Form {
                TextField("Title", text: $title)
                Picker("Agent", selection: $agentType) {
                    Text("Oh My Pi (OMP / Codex)").tag("omp")
                    Text("Claude").tag("claude")
                    Text("OpenCode").tag("opencode")
                }
                TextField("Model (optional)", text: $modelName)
                if agentType == "omp" || agentType == "codex" {
                    TextField("Linked Task ID (required for task agent)", text: $taskId)
                }
            }
            .formStyle(.grouped)

            HStack {
                Button("Cancel") { isPresented = false }
                    .keyboardShortcut(.cancelAction)
                Spacer()
                Button("Create") {
                    Task {
                        _ = await store.createSession(
                            title: title,
                            agentType: agentType,
                            model: modelName.isEmpty ? nil : modelName,
                            taskId: taskId.isEmpty ? nil : taskId
                        )
                        isPresented = false
                    }
                }
                .buttonStyle(.borderedProminent)
                .tint(WorkspaceStyle.accent)
                .keyboardShortcut(.defaultAction)
            }
        }
        .padding(20)
        .frame(width: 440, height: 320)
    }
}
