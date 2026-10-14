import SwiftUI
import KnowMeCore

struct SearchView: View {
    @Bindable var model: AppModel
    @State private var store: WorkStore?

    @State private var query: String = ""
    @State private var selectedType: String = "all"
    @State private var selectedMode: String = "hybrid"
    @State private var projectScoped: Bool = false

    @State private var results: SearchResponsePayload?
    @State private var isSearching = false
    @State private var searchError: String?
    @State private var searchGeneration = UUID()

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
                ProgressView("Initializing search...")
            }
        }
        .task(id: model.workspaceKey) {
            searchGeneration = UUID()
            results = nil
            isSearching = false
            let s = WorkStore(model: model)
            self.store = s
            projectScoped = model.workspace.projectID != nil
        }
    }

    @ViewBuilder
    private func content(_ store: WorkStore) -> some View {
        VStack(spacing: 0) {
            // Search Input Bar
            searchHeader(store)
            Divider()

            // Filters
            filterBar(store)
            Divider()

            // Content Area
            if isSearching {
                VStack(spacing: 12) {
                    ProgressView()
                    Text("Searching workspace across entities...").foregroundStyle(.secondary)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if let error = searchError {
                VStack(spacing: 12) {
                    Image(systemName: "exclamationmark.triangle.fill").font(.largeTitle).foregroundStyle(.yellow)
                    Text("Search Failed").font(.headline)
                    Text(error).font(.callout).foregroundStyle(.secondary)
                    Button("Retry") { executeSearch(store) }
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if let payload = results {
                let all = payload.allHits
                if all.isEmpty {
                    ContentUnavailableView(
                        "No Results Found",
                        systemImage: "magnifyingglass",
                        description: Text("No entities matched '\(query)'. Try broadening your search or switching scopes.")
                    )
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else {
                    resultsList(payload, store: store)
                }
            } else {
                ContentUnavailableView(
                    "Search Workspace",
                    systemImage: "magnifyingglass",
                    description: Text("Search across tasks, documentation, memories, decisions, and code symbols.")
                )
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
        .frame(minWidth: 580, minHeight: 460)
    }

    // MARK: - Search Header

    private func searchHeader(_ store: WorkStore) -> some View {
        HStack(spacing: 12) {
            Image(systemName: "magnifyingglass").font(.title3).foregroundStyle(.secondary)
            TextField("Search tasks, docs, memories, decisions, code...", text: $query)
                .textFieldStyle(.plain)
                .font(.title3)
                .onSubmit { executeSearch(store) }

            if !query.isEmpty {
                Button {
                    query = ""
                    results = nil
                    searchGeneration = UUID()
                    isSearching = false
                } label: {
                    Image(systemName: "xmark.circle.fill").foregroundStyle(.secondary)
                }
                .buttonStyle(.plain)
            }

            Button("Search") {
                executeSearch(store)
            }
            .buttonStyle(.borderedProminent)
            .tint(WorkspaceStyle.accent)
            .disabled(query.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || isSearching)
        }
        .padding(18)
    }

    // MARK: - Filter Bar

    private func filterBar(_ store: WorkStore) -> some View {
        HStack(spacing: 16) {
            Picker("Scope", selection: $projectScoped) {
                Text("All Projects").tag(false)
                Text("Current (\(model.scopeTitle))").tag(true)
            }
            .pickerStyle(.segmented)
            .frame(width: 240)
            .onChange(of: projectScoped) { executeSearch(store) }

            Picker("Entity Type", selection: $selectedType) {
                Text("All").tag("all")
                Text("Tasks").tag("task")
                Text("Docs").tag("doc")
                Text("Memories").tag("memory")
                Text("Decisions").tag("decision")
                Text("Code").tag("code")
            }
            .frame(width: 130)
            .onChange(of: selectedType) { executeSearch(store) }

            Picker("Mode", selection: $selectedMode) {
                Text("Hybrid").tag("hybrid")
                Text("Keyword").tag("keyword")
                Text("Semantic").tag("semantic")
            }
            .frame(width: 120)
            .onChange(of: selectedMode) { executeSearch(store) }

            Spacer()
        }
        .padding(.horizontal, 18)
        .padding(.vertical, 10)
        .background(Color(nsColor: .controlBackgroundColor))
    }

    // MARK: - Results List

    private func resultsList(_ payload: SearchResponsePayload, store: WorkStore) -> some View {
        List {
            if let tasks = payload.tasks, !tasks.isEmpty {
                Section("Tasks (\(tasks.count))") {
                    ForEach(tasks) { hit in
                        taskHitRow(hit, store: store)
                    }
                }
            }

            if let docs = payload.docs, !docs.isEmpty {
                Section("Documentation (\(docs.count))") {
                    ForEach(docs) { hit in
                        docHitRow(hit)
                    }
                }
            }

            if let memories = payload.memories, !memories.isEmpty {
                Section("Memories (\(memories.count))") {
                    ForEach(memories) { hit in
                        genericHitRow(hit, icon: "brain", color: .purple)
                    }
                }
            }

            if let decisions = payload.decisions, !decisions.isEmpty {
                Section("Decisions (\(decisions.count))") {
                    ForEach(decisions) { hit in
                        genericHitRow(hit, icon: "signpost.right", color: .orange)
                    }
                }
            }

            if let code = payload.code, !code.isEmpty {
                Section("Code Symbols (\(code.count))") {
                    ForEach(code) { hit in
                        codeHitRow(hit)
                    }
                }
            }
        }
        .listStyle(.inset)
    }

    private func taskHitRow(_ hit: SearchHitItem, store: WorkStore) -> some View {
        Button {
            // Navigate to tasks and select task
            Task { await model.openTask(hit.id, projectID: hit.projectId) }
        } label: {
            HStack(alignment: .top, spacing: 12) {
                Image(systemName: "checklist").foregroundStyle(.blue).padding(.top, 2)
                VStack(alignment: .leading, spacing: 4) {
                    HStack {
                        Text(hit.title).font(.headline)
                        if let s = hit.status {
                            Text(s.uppercased()).font(.system(size: 8, weight: .bold))
                                .padding(.horizontal, 4).padding(.vertical, 1)
                                .background(Color.blue.opacity(0.15))
                                .foregroundStyle(.blue)
                                .clipShape(Capsule())
                        }
                        Spacer()
                        if let score = hit.score {
                            Text(String(format: "Score: %.2f", score)).font(.caption2).foregroundStyle(.secondary)
                        }
                    }

                    if let snippet = hit.snippet, !snippet.isEmpty {
                        Text(snippet).font(.caption).foregroundStyle(.secondary).lineLimit(2)
                    }
                }
            }
            .padding(.vertical, 4)
        }
        .buttonStyle(.plain)
    }

    private func docHitRow(_ hit: SearchHitItem) -> some View {
        Button {
            // Navigate to documents
            Task { await model.openDocument(hit.path ?? hit.id, projectID: hit.projectId) }
        } label: {
            HStack(alignment: .top, spacing: 12) {
                Image(systemName: "doc.text").foregroundStyle(.green).padding(.top, 2)
                VStack(alignment: .leading, spacing: 4) {
                    HStack {
                        Text(hit.title).font(.headline)
                        Spacer()
                        if let score = hit.score {
                            Text(String(format: "Score: %.2f", score)).font(.caption2).foregroundStyle(.secondary)
                        }
                    }

                    if let path = hit.path, !path.isEmpty {
                        Text(path).font(.caption).foregroundStyle(.secondary)
                    }

                    if let snippet = hit.snippet, !snippet.isEmpty {
                        Text(snippet).font(.caption).foregroundStyle(.secondary).lineLimit(2)
                    }
                }
            }
            .padding(.vertical, 4)
        }
        .buttonStyle(.plain)
    }

    private func codeHitRow(_ hit: SearchHitItem) -> some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: "chevron.left.forwardslash.chevron.right").foregroundStyle(.indigo).padding(.top, 2)
            VStack(alignment: .leading, spacing: 4) {
                HStack {
                    Text(hit.name ?? hit.title).font(.system(.headline, design: .monospaced))
                    Spacer()
                    if let score = hit.score {
                        Text(String(format: "Score: %.2f", score)).font(.caption2).foregroundStyle(.secondary)
                    }
                }
                if let sig = hit.signature {
                    Text(sig).font(.system(.caption, design: .monospaced)).foregroundStyle(.secondary)
                }
                if let snippet = hit.snippet, !snippet.isEmpty {
                    Text(snippet).font(.caption).foregroundStyle(.secondary).lineLimit(2)
                }
            }
        }
        .padding(.vertical, 4)
    }

    private func genericHitRow(_ hit: SearchHitItem, icon: String, color: Color) -> some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: icon).foregroundStyle(color).padding(.top, 2)
            VStack(alignment: .leading, spacing: 4) {
                HStack {
                    Text(hit.title).font(.headline)
                    Spacer()
                    if let score = hit.score {
                        Text(String(format: "Score: %.2f", score)).font(.caption2).foregroundStyle(.secondary)
                    }
                }
                if let snippet = hit.snippet, !snippet.isEmpty {
                    Text(snippet).font(.caption).foregroundStyle(.secondary).lineLimit(2)
                }
            }
        }
        .padding(.vertical, 4)
    }

    private func executeSearch(_ store: WorkStore) {
        let q = query.trimmingCharacters(in: .whitespacesAndNewlines)
        searchGeneration = UUID()
        let generation = searchGeneration
        let workspace = model.workspace
        guard !q.isEmpty else { results = nil; isSearching = false; return }
        let type = selectedType, mode = selectedMode, scoped = projectScoped

        isSearching = true
        searchError = nil

        Task {
            do {
                let payload = try await store.search(
                    query: q,
                    type: type,
                    mode: mode,
                    limit: 30,
                    projectScoped: scoped
                )
                guard generation == searchGeneration, workspace == model.workspace else { return }
                self.results = payload
                self.isSearching = false
            } catch is CancellationError {
                guard generation == searchGeneration else { return }
                self.isSearching = false
            } catch {
                guard generation == searchGeneration, workspace == model.workspace else { return }
                self.searchError = error.localizedDescription
                self.isSearching = false
            }
        }
    }
}
