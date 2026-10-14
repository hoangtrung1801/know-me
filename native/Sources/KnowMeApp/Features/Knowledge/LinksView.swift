import SwiftUI
import AppKit
import KnowMeCore

struct LinksView: View {
    @Bindable var model: AppModel
    @State private var store = LinkStore()
    @State private var showAddSheet = false
    @State private var editingLink: SavedLink?
    @State private var showClassifierSheet = false
    @State private var deleteTarget: SavedLink?
    @State private var showDeleteConfirm = false

    init(model: AppModel) {
        self.model = model
    }

    var body: some View {
        VStack(spacing: 0) {
            topBar
            Divider()

            if store.searchFallback {
                fallbackBanner
            }

            if let err = store.errorMessage {
                errorBanner(err)
            }

            tagFilterBar
            Divider()

            contentView
        }
        .task(id: model.connected) {
            await store.loadLinks(model: model)
            await store.loadClassifierStatus(model: model)
        }
        .onChange(of: model.eventSequence) { _, _ in
            Task { await store.loadLinks(model: model) }
        }
        .onChange(of: model.showCreate) { _, show in
            if show { model.showCreate = false; showAddSheet = true }
        }
        .sheet(isPresented: $showAddSheet) {
            AddLinkSheet(store: store, model: model, isPresented: $showAddSheet)
        }
        .sheet(item: $editingLink) { link in
            EditLinkSheet(link: link, store: store, model: model, isPresented: Binding(
                get: { editingLink != nil },
                set: { if !$0 { editingLink = nil } }
            ))
        }
        .sheet(isPresented: $showClassifierSheet) {
            ClassifierSettingsSheet(store: store, model: model, isPresented: $showClassifierSheet)
        }
        .confirmationDialog(
            "Delete link '\(deleteTarget?.displayTitle ?? "")'?",
            isPresented: $showDeleteConfirm,
            titleVisibility: .visible
        ) {
            Button("Delete Link", role: .destructive) {
                if let target = deleteTarget {
                    Task { _ = await store.deleteLink(id: target.id, model: model) }
                }
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("This will permanently remove the saved link and its metadata.")
        }
    }

    // MARK: - Top Bar

    private var topBar: some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 6) {
                    Text("Saved Links")
                        .font(.title2.weight(.semibold))
                    Text("(\(store.displayLinks.count))")
                        .font(.title3)
                        .foregroundStyle(.secondary)
                }
                Text("Global web resources and references across your projects")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            Spacer()

            // Search Bar & Mode
            HStack(spacing: 6) {
                Image(systemName: "magnifyingglass")
                    .foregroundStyle(.secondary)
                TextField("Search links...", text: $store.searchQuery)
                    .textFieldStyle(.plain)
                    .frame(width: 180)
                    .onSubmit {
                        Task { await store.search(query: store.searchQuery, mode: store.searchMode, model: model) }
                    }

                if !store.searchQuery.isEmpty {
                    Button {
                        store.searchQuery = ""
                        Task { await store.loadLinks(model: model) }
                    } label: {
                        Image(systemName: "xmark.circle.fill")
                            .foregroundStyle(.secondary)
                    }
                    .buttonStyle(.plain)
                }

                Picker("Search Mode", selection: $store.searchMode) {
                    Text("Semantic").tag("semantic")
                    Text("Keyword").tag("keyword")
                }
                .pickerStyle(.segmented)
                .frame(width: 150)
                .onChange(of: store.searchMode) { _, newMode in
                    if !store.searchQuery.isEmpty {
                        Task { await store.search(query: store.searchQuery, mode: newMode, model: model) }
                    }
                }
            }
            .padding(6)
            .background(Color.secondary.opacity(0.08))
            .clipShape(RoundedRectangle(cornerRadius: 8))

            // Classifier Button
            Button {
                showClassifierSheet = true
            } label: {
                Label("Classifier", systemImage: "sparkles")
            }
            .help("Configure AI link classifier settings")

            // Add Link Button
            Button {
                showAddSheet = true
            } label: {
                Label("Add Link", systemImage: "plus")
            }
            .buttonStyle(.borderedProminent)
            .tint(WorkspaceStyle.accent)
            .keyboardShortcut("n", modifiers: .command)
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 12)
        .background(Color.secondary.opacity(0.03))
    }

    private var fallbackBanner: some View {
        HStack {
            Image(systemName: "exclamationmark.circle.fill")
                .foregroundStyle(.orange)
            Text("Semantic search was unavailable on the server; fell back to keyword matching.")
                .font(.callout)
            Spacer()
        }
        .padding(10)
        .background(Color.orange.opacity(0.12))
    }

    private func errorBanner(_ message: String) -> some View {
        HStack {
            Image(systemName: "xmark.octagon.fill")
                .foregroundStyle(.red)
            Text(message)
                .font(.callout)
            Spacer()
            Button("Dismiss") {
                store.errorMessage = nil
            }
            .controlSize(.small)
        }
        .padding(10)
        .background(Color.red.opacity(0.1))
    }

    // MARK: - Tag Filter Bar

    private var tagFilterBar: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                Button {
                    store.selectedTag = nil
                } label: {
                    Text("All Links")
                        .font(.caption.weight(store.selectedTag == nil ? .bold : .regular))
                        .padding(.horizontal, 10)
                        .padding(.vertical, 4)
                        .background(store.selectedTag == nil ? WorkspaceStyle.accent.opacity(0.2) : Color.secondary.opacity(0.08))
                        .foregroundStyle(store.selectedTag == nil ? WorkspaceStyle.accent : .primary)
                        .clipShape(Capsule())
                }
                .buttonStyle(.plain)

                ForEach(store.availableTags, id: \.self) { tag in
                    Button {
                        if store.selectedTag == tag {
                            store.selectedTag = nil
                        } else {
                            store.selectedTag = tag
                        }
                    } label: {
                        Text("#\(tag)")
                            .font(.caption.weight(store.selectedTag == tag ? .bold : .regular))
                            .padding(.horizontal, 10)
                            .padding(.vertical, 4)
                            .background(store.selectedTag == tag ? WorkspaceStyle.accent.opacity(0.2) : Color.secondary.opacity(0.08))
                            .foregroundStyle(store.selectedTag == tag ? WorkspaceStyle.accent : .primary)
                            .clipShape(Capsule())
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, 20)
            .padding(.vertical, 8)
        }
    }

    // MARK: - Content View

    private var contentView: some View {
        Group {
            if store.isLoading && store.links.isEmpty {
                VStack(spacing: 12) {
                    ProgressView()
                    Text("Loading saved links...").font(.caption).foregroundStyle(.secondary)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if store.displayLinks.isEmpty {
                ContentUnavailableView(
                    store.searchQuery.isEmpty ? "No Saved Links" : "No Matching Links",
                    systemImage: "link",
                    description: Text(store.searchQuery.isEmpty ? "Click 'Add Link' above to capture your first URL." : "No saved links match your search query or selected tag.")
                )
            } else {
                ScrollView {
                    LazyVGrid(columns: [GridItem(.adaptive(minimum: 360, maximum: 540), spacing: 16)], spacing: 16) {
                        ForEach(store.displayLinks) { link in
                            linkCard(link)
                        }
                    }
                    .padding(20)
                }
            }
        }
    }

    private func linkCard(_ link: SavedLink) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .top, spacing: 12) {
                // Link image thumbnail if available
                if let img = link.image, !img.isEmpty {
                    AuthenticatedImageView(pathOrURL: "/api/links/\(link.id)/image", client: model.client, contentMode: .fill)
                        .frame(width: 80, height: 64)
                        .clipShape(RoundedRectangle(cornerRadius: 6))
                        .overlay(RoundedRectangle(cornerRadius: 6).stroke(Color.secondary.opacity(0.15), lineWidth: 1))
                }

                VStack(alignment: .leading, spacing: 4) {
                    Text(link.displayTitle)
                        .font(.headline)
                        .lineLimit(2)

                    if let host = URL(string: link.url)?.host {
                        Label(host, systemImage: "globe")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    } else {
                        Text(link.url)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .lineLimit(1)
                    }
                }
                Spacer()
            }

            if let desc = link.description, !desc.trimmingCharacters(in: .whitespaces).isEmpty {
                Text(desc)
                    .font(.callout)
                    .foregroundStyle(.secondary)
                    .lineLimit(3)
            }

            if let note = link.note, !note.trimmingCharacters(in: .whitespaces).isEmpty {
                HStack(alignment: .top, spacing: 8) {
                    Image(systemName: "note.text")
                        .foregroundStyle(WorkspaceStyle.accent)
                        .font(.caption)
                    Text(note)
                        .font(.caption)
                        .foregroundStyle(.primary)
                }
                .padding(8)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(WorkspaceStyle.accent.opacity(0.08))
                .clipShape(RoundedRectangle(cornerRadius: 6))
            }

            if let tags = link.tags, !tags.isEmpty {
                HStack(spacing: 6) {
                    ForEach(tags, id: \.self) { tag in
                        Text("#\(tag)")
                            .font(.caption2)
                            .padding(.horizontal, 6)
                            .padding(.vertical, 2)
                            .background(Color.secondary.opacity(0.1))
                            .clipShape(Capsule())
                    }
                }
            }

            Divider()

            HStack {
                Text(link.updatedAt.prefix(10))
                    .font(.caption2)
                    .foregroundStyle(.tertiary)

                Spacer()

                Button {
                    if let url = URL(string: link.url) {
                        NSWorkspace.shared.open(url)
                    }
                } label: {
                    Label("Open", systemImage: "arrow.up.right")
                        .font(.caption)
                }
                .buttonStyle(.borderless)
                .help("Open in default web browser")

                Button {
                    NSPasteboard.general.clearContents()
                    NSPasteboard.general.setString(link.url, forType: .string)
                } label: {
                    Image(systemName: "doc.on.doc")
                        .font(.caption)
                }
                .buttonStyle(.borderless)
                .help("Copy URL")

                Button {
                    editingLink = link
                } label: {
                    Image(systemName: "pencil")
                        .font(.caption)
                }
                .buttonStyle(.borderless)
                .help("Edit link")

                Button {
                    deleteTarget = link
                    showDeleteConfirm = true
                } label: {
                    Image(systemName: "trash")
                        .font(.caption)
                        .foregroundStyle(.red)
                }
                .buttonStyle(.borderless)
                .help("Delete link")
            }
        }
        .padding(14)
        .background(Color.secondary.opacity(0.04))
        .clipShape(RoundedRectangle(cornerRadius: 10))
        .overlay(
            RoundedRectangle(cornerRadius: 10)
                .stroke(Color.secondary.opacity(0.12), lineWidth: 1)
        )
    }
}

// MARK: - Add Link Sheet

struct AddLinkSheet: View {
    let store: LinkStore
    let model: AppModel
    @Binding var isPresented: Bool

    @State private var url = ""
    @State private var note = ""
    @State private var tags = ""
    @State private var selectedImageData: Data?
    @State private var selectedImageName: String?
    @State private var isBusy = false
    @State private var errorMessage: String?

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Text("Add Saved Link").font(.headline)
                Spacer()
                Button("Cancel") { isPresented = false }.keyboardShortcut(.cancelAction)
            }
            .padding(16)
            Divider()

            Form {
                Section("URL & Metadata") {
                    TextField("https://example.com (required)", text: $url)
                    TextField("Personal Note (optional)", text: $note)
                    TextField("Tags (comma separated)", text: $tags)
                }

                Section("Thumbnail Image (optional)") {
                    HStack {
                        if let name = selectedImageName {
                            Label(name, systemImage: "photo")
                                .font(.caption)
                            Spacer()
                            Button("Remove") {
                                selectedImageData = nil
                                selectedImageName = nil
                            }
                            .controlSize(.small)
                        } else {
                            Button("Choose Image...") {
                                pickImage()
                            }
                        }
                    }
                }

                if let errorMessage {
                    Text(errorMessage).font(.caption).foregroundStyle(.red)
                }
            }
            .formStyle(.grouped)
            .padding(16)

            Divider()
            HStack {
                Spacer()
                Button("Save Link") {
                    let tagsArray = tags.split(separator: ",").map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }
                    isBusy = true
                    Task {
                        let success = await store.addLink(
                            url: url.trimmingCharacters(in: .whitespaces),
                            note: note.isEmpty ? nil : note,
                            tags: tagsArray,
                            imageData: selectedImageData,
                            imageFilename: selectedImageName,
                            model: model
                        )
                        isBusy = false
                        if success {
                            isPresented = false
                        } else {
                            errorMessage = store.errorMessage
                        }
                    }
                }
                .buttonStyle(.borderedProminent)
                .tint(WorkspaceStyle.accent)
                .disabled(url.trimmingCharacters(in: .whitespaces).isEmpty || isBusy)
            }
            .padding(16)
        }
        .frame(width: 520, height: 380)
    }

    private func pickImage() {
        let panel = NSOpenPanel()
        panel.canChooseFiles = true
        panel.canChooseDirectories = false
        panel.allowedContentTypes = [.png, .jpeg, .webP]
        if panel.runModal() == .OK, let fileURL = panel.url {
            selectedImageData = try? Data(contentsOf: fileURL)
            selectedImageName = fileURL.lastPathComponent
        }
    }
}

// MARK: - Edit Link Sheet

struct EditLinkSheet: View {
    let link: SavedLink
    let store: LinkStore
    let model: AppModel
    @Binding var isPresented: Bool

    @State private var title: String
    @State private var description: String
    @State private var note: String
    @State private var tags: String
    @State private var selectedImageData: Data?
    @State private var selectedImageName: String?
    @State private var isBusy = false
    @State private var errorMessage: String?

    init(link: SavedLink, store: LinkStore, model: AppModel, isPresented: Binding<Bool>) {
        self.link = link
        self.store = store
        self.model = model
        self._isPresented = isPresented
        self._title = State(initialValue: link.title ?? "")
        self._description = State(initialValue: link.description ?? "")
        self._note = State(initialValue: link.note ?? "")
        self._tags = State(initialValue: link.tags?.joined(separator: ", ") ?? "")
    }

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Text("Edit Saved Link").font(.headline)
                Spacer()
                Button("Cancel") { isPresented = false }.keyboardShortcut(.cancelAction)
            }
            .padding(16)
            Divider()

            Form {
                Section("Link Details") {
                    LabeledContent("URL", value: link.url)
                    TextField("Title", text: $title)
                    TextField("Description", text: $description)
                    TextField("Personal Note", text: $note)
                    TextField("Tags (comma separated)", text: $tags)
                }

                Section("Thumbnail Image") {
                    HStack {
                        if let name = selectedImageName {
                            Label(name, systemImage: "photo")
                                .font(.caption)
                            Spacer()
                            Button("Remove") {
                                selectedImageData = nil
                                selectedImageName = nil
                            }
                            .controlSize(.small)
                        } else {
                            Button("Replace Image...") {
                                pickImage()
                            }
                        }
                    }
                }

                if let errorMessage {
                    Text(errorMessage).font(.caption).foregroundStyle(.red)
                }
            }
            .formStyle(.grouped)
            .padding(16)

            Divider()
            HStack {
                Spacer()
                Button("Update Link") {
                    let tagsArray = tags.split(separator: ",").map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }
                    isBusy = true
                    Task {
                        let success = await store.updateLink(
                            id: link.id,
                            title: title.isEmpty ? nil : title,
                            description: description.isEmpty ? nil : description,
                            note: note.isEmpty ? nil : note,
                            tags: tagsArray,
                            imageData: selectedImageData,
                            imageFilename: selectedImageName,
                            model: model
                        )
                        isBusy = false
                        if success {
                            isPresented = false
                        } else {
                            errorMessage = store.errorMessage
                        }
                    }
                }
                .buttonStyle(.borderedProminent)
                .tint(WorkspaceStyle.accent)
                .disabled(isBusy)
            }
            .padding(16)
        }
        .frame(width: 520, height: 420)
    }

    private func pickImage() {
        let panel = NSOpenPanel()
        panel.canChooseFiles = true
        panel.canChooseDirectories = false
        panel.allowedContentTypes = [.png, .jpeg, .webP]
        if panel.runModal() == .OK, let fileURL = panel.url {
            selectedImageData = try? Data(contentsOf: fileURL)
            selectedImageName = fileURL.lastPathComponent
        }
    }
}

// MARK: - Classifier Settings Sheet

struct ClassifierSettingsSheet: View {
    let store: LinkStore
    let model: AppModel
    @Binding var isPresented: Bool

    @State private var apiBase = ""
    @State private var apiKey = ""
    @State private var classifierModel = "gpt-4o-mini"
    @State private var isBusy = false
    @State private var statusMessage: String?

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Text("Link Classifier Configuration").font(.headline)
                Spacer()
                Button("Done") { isPresented = false }.keyboardShortcut(.defaultAction)
            }
            .padding(16)
            Divider()

            Form {
                Section("OpenAI-Compatible Classifier Endpoint") {
                    TextField("API Base URL (e.g. https://api.openai.com/v1)", text: $apiBase)
                    SecureField("API Key (optional if server sets default)", text: $apiKey)
                    TextField("Model identifier", text: $classifierModel)
                }

                Section("Status") {
                    if let status = store.classifierStatus {
                        LabeledContent("Configured", value: status.configured ? "Yes" : "No")
                        LabeledContent("Current Model", value: status.model.isEmpty ? "None" : status.model)
                        LabeledContent("API Base", value: status.apiBase.isEmpty ? "Default" : status.apiBase)
                    } else {
                        Text("Classifier status not loaded.").font(.caption).foregroundStyle(.secondary)
                    }

                    if let result = store.testResult {
                        Text(result)
                            .font(.caption)
                            .foregroundStyle(result.contains("succeeded") ? .green : .red)
                    }
                }
            }
            .formStyle(.grouped)
            .padding(16)

            Divider()
            HStack {
                Button("Test Classifier") {
                    let settings = LinkClassifierSettings(apiBase: apiBase, apiKey: apiKey, model: classifierModel)
                    Task { await store.testClassifier(settings: settings, model: model) }
                }
                .disabled(store.isTestingClassifier || apiBase.isEmpty)

                if store.isTestingClassifier {
                    ProgressView().controlSize(.small)
                }

                Spacer()

                Button("Save Settings") {
                    let settings = LinkClassifierSettings(apiBase: apiBase, apiKey: apiKey, model: classifierModel)
                    Task {
                        _ = await store.saveClassifierSettings(settings: settings, model: model)
                    }
                }
                .buttonStyle(.borderedProminent)
                .tint(WorkspaceStyle.accent)
                .disabled(apiBase.isEmpty || classifierModel.isEmpty)
            }
            .padding(16)
        }
        .frame(width: 540, height: 420)
        .onAppear {
            if let current = store.classifierStatus {
                apiBase = current.apiBase
                classifierModel = current.model.isEmpty ? "gpt-4o-mini" : current.model
            }
        }
    }
}
