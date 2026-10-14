import SwiftUI
import AppKit
import KnowMeCore

struct DocumentsView: View {
    @Bindable var model: AppModel
    @State private var store = DocumentStore()
    @State private var viewMode: DocViewMode = .preview
    @State private var showNewDocSheet = false
    @State private var showHistorySheet = false
    @State private var showAnnotationsSheet = false
    @State private var showReferencesSheet = false
    @State private var headingTarget: String?
    @State private var headingRequest = 0
    @State private var showRestoreConfirm = false
    @State private var selectedRestoreVersion: DocVersion?

    init(model: AppModel) {
        self.model = model
    }

    private enum DocViewMode: String, CaseIterable, Identifiable {
        case preview = "Preview"
        case edit = "Edit"
        case split = "Split"
        var id: String { rawValue }
        var symbol: String {
            switch self {
            case .preview: return "eye"
            case .edit: return "pencil"
            case .split: return "rectangle.split.2x1"
            }
        }
    }

    public var body: some View {
        NavigationSplitView {
            sidebarContent
                .navigationSplitViewColumnWidth(min: 240, ideal: 280, max: 360)
        } detail: {
            detailContent
        }
        .task(id: model.workspaceKey) {
            await store.loadDocs(model: model)
            await openPendingDocument()
        }
        .onChange(of: model.pendingDocument) { _, _ in Task { await openPendingDocument() } }
        .onChange(of: model.showCreate) { _, show in
            if show { model.showCreate = false; showNewDocSheet = true }
        }
        .onChange(of: model.eventSequence) { _, _ in
            Task { await store.loadDocs(model: model) }
        }
        .sheet(isPresented: $showNewDocSheet) {
            NewDocumentSheet(store: store, model: model, isPresented: $showNewDocSheet)
        }
        .sheet(isPresented: $showHistorySheet) {
            DocHistorySheet(
                store: store,
                model: model,
                isPresented: $showHistorySheet,
                onRestore: { version in
                    selectedRestoreVersion = version
                    showRestoreConfirm = true
                }
            )
        }
        .sheet(isPresented: $showAnnotationsSheet) {
            DocAnnotationsSheet(store: store, isPresented: $showAnnotationsSheet)
        }
        .sheet(isPresented: $showReferencesSheet) {
            DocReferencesSheet(doc: store.selectedDoc, content: store.editedContent, model: model, isPresented: $showReferencesSheet, onSelectHeading: { heading in
                if viewMode == .edit { viewMode = .preview }
                headingTarget = heading.id
                headingRequest += 1
            })
        }
        .confirmationDialog(
            "Restore revision \(selectedRestoreVersion?.id ?? "")?",
            isPresented: $showRestoreConfirm,
            titleVisibility: .visible
        ) {
            Button("Restore Document", role: .destructive) {
                if let version = selectedRestoreVersion {
                    Task {
                        _ = await store.restoreRevision(revisionId: version.id, model: model)
                    }
                }
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("This will replace the current document content with this revision and create a new audit record.")
        }
        .onChange(of: store.editedTitle) { _, _ in if let doc = store.selectedDoc { store.saveDraft(for: doc, model: model) } }
        .onChange(of: store.editedDescription) { _, _ in if let doc = store.selectedDoc { store.saveDraft(for: doc, model: model) } }
        .onChange(of: store.editedTags) { _, _ in if let doc = store.selectedDoc { store.saveDraft(for: doc, model: model) } }
        .onDisappear { if let doc = store.selectedDoc, store.isDirty { store.saveDraft(for: doc, model: model) } }
    }

    // MARK: - Sidebar

    private func openPendingDocument() async {
        guard let target = model.pendingDocument else { return }
        let doc = store.docs.first { $0.path == target.path && $0.projectId == target.projectID }
            ?? DocItem(path: target.path, projectId: target.projectID)
        await store.selectDoc(doc, model: model)
        if model.pendingDocument == target {
            if let anchor = target.heading {
                let headings = MarkdownParser.extractHeadings(from: store.editedContent)
                headingTarget = headings.first { $0.title == anchor || $0.title.lowercased().replacingOccurrences(of: " ", with: "-") == anchor }?.id
                headingRequest += 1
                if viewMode == .edit { viewMode = .preview }
            }
            model.pendingDocument = nil
        }
    }

    private var sidebarContent: some View {
        VStack(spacing: 0) {
            HStack(spacing: 8) {
                Text("Documents")
                    .font(.headline)
                Spacer()
                Button {
                    showNewDocSheet = true
                } label: {
                    Label("New Document", systemImage: "plus")
                }
                .help("Create a new document")
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 12)

            HStack(spacing: 6) {
                Image(systemName: "magnifyingglass")
                    .foregroundStyle(.secondary)
                TextField("Search docs...", text: $store.searchQuery)
                    .textFieldStyle(.plain)
                if !store.searchQuery.isEmpty {
                    Button {
                        store.searchQuery = ""
                    } label: {
                        Image(systemName: "xmark.circle.fill")
                            .foregroundStyle(.secondary)
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(8)
            .background(Color.secondary.opacity(0.08))
            .clipShape(RoundedRectangle(cornerRadius: 8))
            .padding(.horizontal, 12)
            .padding(.bottom, 8)

            Divider()

            if store.isLoading && store.docs.isEmpty {
                VStack(spacing: 12) {
                    ProgressView()
                    Text("Loading documents...").font(.caption).foregroundStyle(.secondary)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if store.filteredDocs.isEmpty {
                ContentUnavailableView(
                    store.searchQuery.isEmpty ? "No Documents" : "No Matches",
                    systemImage: "doc.text",
                    description: Text(store.searchQuery.isEmpty ? "No documents found in this workspace." : "Try adjusting your search query.")
                )
            } else {
                List(selection: Binding(
                    get: { store.selectedDoc?.id },
                    set: { path in
                        if let path, let found = store.docs.first(where: { $0.id == path }) {
                            Task { await store.selectDoc(found, model: model) }
                        }
                    }
                )) {
                    ForEach(store.folderGroups) { group in
                        Section(header: Label(group.folderName, systemImage: "folder")) {
                            ForEach(group.docs) { doc in
                                NavigationLink(value: doc.id) {
                                    docRow(doc)
                                }
                            }
                        }
                    }
                }
                .listStyle(.sidebar)
            }

            Divider()

            HStack {
                Label(model.scopeTitle, systemImage: "tray")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                Spacer()
                Button {
                    Task { await store.loadDocs(model: model) }
                } label: {
                    Image(systemName: "arrow.clockwise")
                }
                .buttonStyle(.plain)
                .help("Refresh documents")
            }
            .padding(10)
        }
    }

    private func docRow(_ doc: DocItem) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(doc.title)
                .font(.body)
                .lineLimit(1)
            HStack(spacing: 6) {
                Text(doc.path)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
                Spacer()
                if !doc.metadata.tags.isEmpty {
                    Text(doc.metadata.tags.prefix(2).joined(separator: ", "))
                        .font(.caption2)
                        .padding(.horizontal, 4)
                        .padding(.vertical, 1)
                        .background(Color.secondary.opacity(0.12))
                        .clipShape(Capsule())
                }
            }
        }
        .padding(.vertical, 2)
    }

    // MARK: - Detail

    private var detailContent: some View {
        Group {
            if let doc = store.selectedDoc {
                VStack(spacing: 0) {
                    detailHeader(doc)
                    Divider()

                    if store.hasRecoverableDraft {
                        recoverableDraftBanner
                    }

                    if let err = store.errorMessage {
                        errorBanner(err)
                    }

                    switch viewMode {
                    case .preview:
                        documentPreview(padding: 24)
                            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
                    case .edit:
                        editorView(doc)
                    case .split:
                        HSplitView {
                            editorView(doc)
                                .frame(minWidth: 320)
                            documentPreview(padding: 20)
                            .frame(minWidth: 320, maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
                            .background(Color.secondary.opacity(0.02))
                        }
                    }
                }
            } else {
                ContentUnavailableView(
                    "No Document Selected",
                    systemImage: "doc.text",
                    description: Text("Choose a document from the sidebar or click '+' to create one.")
                )
            }
        }
    }

    private func documentPreview(padding: CGFloat) -> some View {
        ScrollViewReader { proxy in
            ScrollView {
                MarkdownView(content: store.editedContent, client: model.client)
                    .padding(padding)
                    .frame(maxWidth: 820, alignment: .leading)
            }
            .onChange(of: headingRequest) { _, _ in
                if let target = headingTarget { proxy.scrollTo(target, anchor: .top) }
            }
            .onAppear { if let target = headingTarget { proxy.scrollTo(target, anchor: .top) } }
            .environment(\.openURL, OpenURLAction { url in
                guard let reference = MarkdownReferences.reference(from: url) else { return .systemAction }
                openReference(reference)
                return .handled
            })
        }
    }

    private func openReference(_ reference: MarkdownReferenceItem) {
        let projectID = store.selectedDoc?.projectId
        switch reference.type {
        case .taskMention: Task { await model.openTask(reference.target, projectID: projectID) }
        case .docWikiLink: Task { await model.openDocument(reference.target, projectID: projectID) }
        case .externalURL: if let url = URL(string: reference.target) { NSWorkspace.shared.open(url) }
        }
    }

    private func detailHeader(_ doc: DocItem) -> some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 8) {
                    Text(store.editedTitle.isEmpty ? doc.title : store.editedTitle)
                        .font(.title2.weight(.semibold))
                        .lineLimit(1)
                    if store.isDirty {
                        Circle()
                            .fill(WorkspaceStyle.accent)
                            .frame(width: 8, height: 8)
                            .help("Unsaved changes")
                    }
                }
                HStack(spacing: 8) {
                    Label(doc.path, systemImage: "doc")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    if let folder = doc.folder, !folder.isEmpty {
                        Text("•")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                        Label(folder, systemImage: "folder")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
            }

            Spacer()

            // Mode Picker
            Picker("View Mode", selection: $viewMode) {
                ForEach(DocViewMode.allCases) { mode in
                    Label(mode.rawValue, systemImage: mode.symbol).tag(mode)
                }
            }
            .pickerStyle(.segmented)
            .frame(width: 220)

            // References & TOC
            Button {
                showReferencesSheet = true
            } label: {
                Label("TOC & Links", systemImage: "list.bullet.rectangle")
            }
            .help("Table of contents and references")

            // Annotations
            Button {
                showAnnotationsSheet = true
            } label: {
                Label("Annotations (\(store.annotations.count))", systemImage: "highlighter")
            }
            .help("View or export local document annotations")

            // History
            Button {
                Task {
                    await store.loadHistory(model: model)
                    showHistorySheet = true
                }
            } label: {
                Label("History", systemImage: "clock.arrow.circlepath")
            }
            .help("Revision history and diff")

            // Save Button
            Button {
                Task {
                    _ = await store.saveCurrentDoc(model: model)
                }
            } label: {
                if store.isSaving {
                    ProgressView().controlSize(.small)
                } else {
                    Label("Save", systemImage: "square.and.arrow.down")
                }
            }
            .keyboardShortcut("s", modifiers: .command)
            .disabled(!store.isDirty || store.isSaving)
            .tint(WorkspaceStyle.accent)
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 12)
        .background(Color.secondary.opacity(0.04))
    }

    private var recoverableDraftBanner: some View {
        HStack {
            Image(systemName: "exclamationmark.triangle.fill")
                .foregroundStyle(.yellow)
            Text("Recovered local draft found from a previous session.")
                .font(.callout)
            Spacer()
            Button("Restore Draft") {
                store.restoreDraft()
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.small)
            Button("Discard") {
                store.discardDraft(model: model)
            }
            .buttonStyle(.bordered)
            .controlSize(.small)
        }
        .padding(10)
        .background(Color.yellow.opacity(0.12))
        .border(Color.yellow.opacity(0.3), width: 1)
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

    // MARK: - Editor View

    private func editorView(_ doc: DocItem) -> some View {
        VStack(spacing: 0) {
            // Metadata bar
            DisclosureGroup("Document Metadata") {
                Grid(alignment: .leading, horizontalSpacing: 12, verticalSpacing: 8) {
                    GridRow {
                        Text("Title:").font(.caption).foregroundStyle(.secondary)
                        TextField("Document Title", text: $store.editedTitle)
                            .textFieldStyle(.roundedBorder)
                    }
                    GridRow {
                        Text("Description:").font(.caption).foregroundStyle(.secondary)
                        TextField("Short summary", text: $store.editedDescription)
                            .textFieldStyle(.roundedBorder)
                    }
                    GridRow {
                        Text("Tags:").font(.caption).foregroundStyle(.secondary)
                        TextField("tag1, tag2, tag3", text: $store.editedTags)
                            .textFieldStyle(.roundedBorder)
                    }
                }
                .padding(.vertical, 8)
            }
            .font(.caption.weight(.medium))
            .padding(.horizontal, 16)
            .padding(.vertical, 8)
            .background(Color.secondary.opacity(0.03))

            Divider()

            // Formatting toolbar
            HStack(spacing: 8) {
                Button { insertFormatting(prefix: "**", suffix: "**", placeholder: "bold text") } label: {
                    Image(systemName: "bold")
                }.help("Bold")

                Button { insertFormatting(prefix: "*", suffix: "*", placeholder: "italic text") } label: {
                    Image(systemName: "italic")
                }.help("Italic")

                Button { insertFormatting(prefix: "### ", suffix: "", placeholder: "Heading") } label: {
                    Image(systemName: "number")
                }.help("Heading")

                Button { insertFormatting(prefix: "`", suffix: "`", placeholder: "code") } label: {
                    Image(systemName: "curlybraces")
                }.help("Inline code")

                Button { insertFormatting(prefix: "```\n", suffix: "\n```", placeholder: "code block") } label: {
                    Image(systemName: "chevron.left.forwardslash.chevron.right")
                }.help("Code block")

                Button { insertFormatting(prefix: "- [ ] ", suffix: "", placeholder: "Task item") } label: {
                    Image(systemName: "checklist")
                }.help("Task item")

                Button { insertFormatting(prefix: "[", suffix: "](url)", placeholder: "link text") } label: {
                    Image(systemName: "link")
                }.help("Link")

                Divider().frame(height: 16)

                Button {
                    pickAndUploadImage()
                } label: {
                    Label("Insert Image", systemImage: "photo.badge.plus")
                }
                .help("Upload image attachment")

                Spacer()

                Text("\(store.editedContent.count) chars")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
            .buttonStyle(.borderless)
            .padding(.horizontal, 16)
            .padding(.vertical, 6)
            .background(Color.secondary.opacity(0.06))

            Divider()

            // Source Editor
            TextEditor(text: $store.editedContent)
                .onImagePaste { data, filename, mimeType in
                    let revision = model.workspace
                    if let markdown = await store.uploadImage(data: data, filename: filename, mimeType: mimeType, model: model), revision == model.workspace {
                        store.editedContent.append("\n" + markdown + "\n")
                    }
                }
                .font(.system(.body, design: .monospaced))
                .lineSpacing(3)
                .padding(12)
                .onChange(of: store.editedContent) { _, newText in
                    store.saveDraft(for: doc, model: model)
                }
        }
    }

    private func insertFormatting(prefix: String, suffix: String, placeholder: String) {
        let snippet = "\(prefix)\(placeholder)\(suffix)"
        store.editedContent.append(snippet)
    }

    private func pickAndUploadImage() {
        let panel = NSOpenPanel()
        panel.canChooseFiles = true
        panel.canChooseDirectories = false
        panel.allowsMultipleSelection = false
        panel.allowedContentTypes = [.png, .jpeg, .gif, .webP]

        if panel.runModal() == .OK, let url = panel.url {
            guard let data = try? Data(contentsOf: url) else { return }
            let filename = url.lastPathComponent
            let mimeType = switch url.pathExtension.lowercased() {
            case "png": "image/png"
            case "jpg", "jpeg": "image/jpeg"
            case "gif": "image/gif"
            case "webp": "image/webp"
            default: "application/octet-stream"
            }
            Task {
                if let markdown = await store.uploadImage(data: data, filename: filename, mimeType: mimeType, model: model) {
                    store.editedContent.append("\n" + markdown + "\n")
                }
            }
        }
    }
}

// MARK: - New Document Sheet

struct NewDocumentSheet: View {
    let store: DocumentStore
    let model: AppModel
    @Binding var isPresented: Bool

    @State private var title = ""
    @State private var folder = ""
    @State private var description = ""
    @State private var tags = ""
    @State private var content = "# New Document\n\nStart writing..."
    @State private var isGlobal = false
    @State private var isBusy = false
    @State private var errorMessage: String?

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Text("Create Document").font(.headline)
                Spacer()
                Button("Cancel") { isPresented = false }.keyboardShortcut(.cancelAction)
            }
            .padding(16)
            Divider()

            Form {
                Section("Details") {
                    TextField("Title (required)", text: $title)
                    TextField("Folder (e.g. specs, guides)", text: $folder)
                    TextField("Description", text: $description)
                    TextField("Tags (comma separated)", text: $tags)
                    Toggle("Global Document (across all projects)", isOn: $isGlobal)
                }
                Section("Initial Content") {
                    TextEditor(text: $content)
                        .font(.system(.body, design: .monospaced))
                        .frame(minHeight: 180)
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
                Button("Create Document") {
                    let tagsArray = tags.split(separator: ",").map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }
                    isBusy = true
                    Task {
                        let success = await store.createDoc(
                            title: title,
                            folder: folder.isEmpty ? nil : folder,
                            description: description.isEmpty ? nil : description,
                            content: content,
                            tags: tagsArray,
                            global: isGlobal,
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
                .disabled(title.trimmingCharacters(in: .whitespaces).isEmpty || isBusy)
            }
            .padding(16)
        }
        .frame(width: 580, height: 520)
    }
}

// MARK: - Doc History Sheet

struct DocHistorySheet: View {
    let store: DocumentStore
    let model: AppModel
    @Binding var isPresented: Bool
    var onRestore: (DocVersion) -> Void

    @State private var selectedVersionId: String?

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Text("Revision History").font(.headline)
                Spacer()
                Button("Done") { isPresented = false }.keyboardShortcut(.defaultAction)
            }
            .padding(16)
            Divider()

            if store.isLoadingHistory {
                VStack(spacing: 12) {
                    ProgressView()
                    Text("Loading revisions...").font(.caption).foregroundStyle(.secondary)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if let history = store.history, !history.versions.isEmpty {
                HSplitView {
                    // Versions list
                    List(history.versions, selection: $selectedVersionId) { version in
                        VStack(alignment: .leading, spacing: 4) {
                            HStack {
                                Text("v\(version.version)")
                                    .font(.headline)
                                Spacer()
                                Text(version.timestamp)
                                    .font(.caption2)
                                    .foregroundStyle(.secondary)
                            }
                            if let author = version.author ?? version.actor {
                                Text("By \(author)")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                            if let changes = version.changes {
                                Text("\(changes.count) field changes")
                                    .font(.caption2)
                                    .foregroundStyle(.secondary)
                            }
                        }
                        .padding(.vertical, 4)
                        .tag(version.id)
                    }
                    .frame(minWidth: 220, maxWidth: 300)

                    // Diff view
                    Group {
                        if let diff = store.selectedDiff {
                            diffDetail(diff)
                        } else if store.isLoadingDiff {
                            ProgressView("Loading revision diff...")
                                .frame(maxWidth: .infinity, maxHeight: .infinity)
                        } else {
                            ContentUnavailableView("Select a Revision", systemImage: "clock", description: Text("Select a revision from the left to view diff and restore."))
                        }
                    }
                    .frame(minWidth: 380, maxWidth: .infinity)
                }
                .onChange(of: selectedVersionId) { _, newId in
                    if let newId {
                        Task { await store.loadDiff(revisionId: newId, model: model) }
                    }
                }
            } else {
                ContentUnavailableView("No Revisions", systemImage: "clock", description: Text("This document has no recorded version history yet."))
            }
        }
        .frame(width: 760, height: 500)
    }

    private func diffDetail(_ diff: DocRevisionDiff) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Revision \(diff.revisionId)")
                        .font(.title3.weight(.semibold))
                    Text("Timestamp: \(diff.version.timestamp)")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                Spacer()
                Button("Restore This Revision", systemImage: "arrow.uturn.backward") {
                    onRestore(diff.version)
                }
                .buttonStyle(.borderedProminent)
                .tint(WorkspaceStyle.accent)
            }
            .padding(16)
            Divider()

            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    if !diff.changes.isEmpty {
                        Text("Field Changes").font(.headline)
                        ForEach(diff.changes, id: \.field) { change in
                            VStack(alignment: .leading, spacing: 4) {
                                Text(change.field.uppercased())
                                    .font(.caption.weight(.bold))
                                    .foregroundStyle(WorkspaceStyle.accent)
                                if let old = change.oldValue?.stringValue {
                                    Text("- Old: \(old)")
                                        .font(.caption.monospaced())
                                        .foregroundStyle(.red)
                                }
                                if let new = change.newValue?.stringValue {
                                    Text("+ New: \(new)")
                                        .font(.caption.monospaced())
                                        .foregroundStyle(.green)
                                }
                            }
                            .padding(8)
                            .background(Color.secondary.opacity(0.04))
                            .clipShape(RoundedRectangle(cornerRadius: 6))
                        }
                    }

                    if let scopes = diff.changedScopes, !scopes.isEmpty {
                        Text("Affected Scopes").font(.headline)
                        ForEach(Array(scopes.enumerated()), id: \.offset) { _, scope in
                            HStack {
                                Text(scope.type)
                                    .font(.caption.weight(.semibold))
                                Spacer()
                                if let summary = scope.summary {
                                    Text(summary)
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                }
                                if let delta = scope.deltaBytes {
                                    Text("\(delta > 0 ? "+" : "")\(delta) bytes")
                                        .font(.caption.monospacedDigit())
                                        .foregroundStyle(delta >= 0 ? .green : .red)
                                }
                            }
                            .padding(6)
                            .background(Color.secondary.opacity(0.03))
                        }
                    }
                }
                .padding(16)
            }
        }
    }
}

// MARK: - Doc Annotations Sheet

struct DocAnnotationsSheet: View {
    let store: DocumentStore
    @Binding var isPresented: Bool

    @State private var selectedText = ""
    @State private var noteContent = ""
    @State private var annotationType: AnnotationType = .comment
    @State private var copied = false

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Text("Document Annotations").font(.headline)
                Spacer()
                Button("Done") { isPresented = false }.keyboardShortcut(.defaultAction)
            }
            .padding(16)
            Divider()

            // Audit notice banner
            HStack(spacing: 8) {
                Image(systemName: "info.circle")
                    .foregroundStyle(.secondary)
                Text("Annotations are stored locally on this Mac. The KnowMe server does not provide an /api/annotations endpoint.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                Spacer()
            }
            .padding(10)
            .background(Color.secondary.opacity(0.06))

            HSplitView {
                // List of annotations
                VStack(spacing: 0) {
                    if store.annotations.isEmpty {
                        ContentUnavailableView("No Annotations", systemImage: "highlighter", description: Text("Add feedback or notes on this document below."))
                    } else {
                        List {
                            ForEach(store.annotations) { ann in
                                VStack(alignment: .leading, spacing: 4) {
                                    HStack {
                                        Label(ann.type.title, systemImage: ann.type.symbol)
                                            .font(.caption.weight(.semibold))
                                            .foregroundStyle(WorkspaceStyle.accent)
                                        Spacer()
                                        Button {
                                            if let path = store.selectedDoc?.path {
                                                store.removeAnnotation(id: ann.id, docPath: path)
                                            }
                                        } label: {
                                            Image(systemName: "trash")
                                                .font(.caption2)
                                                .foregroundStyle(.secondary)
                                        }
                                        .buttonStyle(.plain)
                                    }
                                    if !ann.selectedText.isEmpty {
                                        Text("> \(ann.selectedText)")
                                            .font(.caption)
                                            .foregroundStyle(.secondary)
                                            .lineLimit(2)
                                    }
                                    Text(ann.content)
                                        .font(.body)
                                }
                                .padding(.vertical, 4)
                            }
                        }
                    }

                    Divider()

                    HStack {
                        Button {
                            if let path = store.selectedDoc?.path {
                                let md = store.exportAnnotationsMarkdown(for: path)
                                NSPasteboard.general.clearContents()
                                NSPasteboard.general.setString(md, forType: .string)
                                copied = true
                                DispatchQueue.main.asyncAfter(deadline: .now() + 2) { copied = false }
                            }
                        } label: {
                            Label(copied ? "Copied Markdown!" : "Copy for AI", systemImage: copied ? "checkmark" : "doc.on.doc")
                        }
                        .disabled(store.annotations.isEmpty)

                        Spacer()

                        Button("Clear All", role: .destructive) {
                            if let path = store.selectedDoc?.path {
                                store.clearAnnotations(for: path)
                            }
                        }
                        .disabled(store.annotations.isEmpty)
                    }
                    .padding(12)
                }
                .frame(minWidth: 300)

                // Add Annotation Form
                VStack(alignment: .leading, spacing: 12) {
                    Text("Add Annotation").font(.headline)

                    Picker("Type", selection: $annotationType) {
                        ForEach(AnnotationType.allCases, id: \.self) { type in
                            Label(type.title, systemImage: type.symbol).tag(type)
                        }
                    }
                    .pickerStyle(.segmented)

                    Text("Selected / Quoted Text (optional):").font(.caption).foregroundStyle(.secondary)
                    TextField("Quote from document", text: $selectedText)
                        .textFieldStyle(.roundedBorder)

                    Text("Feedback or Note:").font(.caption).foregroundStyle(.secondary)
                    TextEditor(text: $noteContent)
                        .font(.body)
                        .frame(minHeight: 120)
                        .border(Color.secondary.opacity(0.2), width: 1)

                    HStack {
                        Spacer()
                        Button("Add Annotation") {
                            guard let path = store.selectedDoc?.path, !noteContent.trimmingCharacters(in: .whitespaces).isEmpty else { return }
                            store.addAnnotation(docPath: path, selectedText: selectedText, content: noteContent, type: annotationType)
                            selectedText = ""
                            noteContent = ""
                        }
                        .buttonStyle(.borderedProminent)
                        .tint(WorkspaceStyle.accent)
                        .disabled(noteContent.trimmingCharacters(in: .whitespaces).isEmpty)
                    }
                }
                .padding(16)
                .frame(minWidth: 300)
            }
        }
        .frame(width: 720, height: 480)
    }
}

// MARK: - Doc References & TOC Sheet

struct DocReferencesSheet: View {
    let doc: DocItem?
    let content: String
    let model: AppModel
    @Binding var isPresented: Bool
    let onSelectHeading: (MarkdownHeadingItem) -> Void

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Text("Table of Contents & References").font(.headline)
                Spacer()
                Button("Done") { isPresented = false }.keyboardShortcut(.defaultAction)
            }
            .padding(16)
            Divider()

            let headings = MarkdownParser.extractHeadings(from: content)
            let refs = MarkdownParser.extractReferences(from: content)

            HSplitView {
                // Table of Contents
                VStack(alignment: .leading, spacing: 8) {
                    Label("Table of Contents", systemImage: "list.bullet")
                        .font(.headline)
                        .padding([.top, .horizontal], 16)

                    if headings.isEmpty {
                        ContentUnavailableView("No Headings", systemImage: "text.alignleft", description: Text("No # headings found in this document."))
                    } else {
                        List(headings) { h in
                            Button {
                                isPresented = false
                                onSelectHeading(h)
                            } label: {
                            HStack(spacing: 8) {
                                Text(String(repeating: "    ", count: max(0, h.level - 1)))
                                Image(systemName: "number")
                                    .font(.caption2)
                                    .foregroundStyle(.secondary)
                                Text(h.title)
                                    .font(h.level <= 2 ? .body.weight(.semibold) : .callout)
                            }
                            .padding(.vertical, 2)
                            }.buttonStyle(.plain)
                        }
                    }
                }
                .frame(minWidth: 280)

                // Outgoing References
                VStack(alignment: .leading, spacing: 8) {
                    Label("References & Links", systemImage: "arrow.up.right.square")
                        .font(.headline)
                        .padding([.top, .horizontal], 16)

                    if refs.isEmpty {
                        ContentUnavailableView("No References", systemImage: "link", description: Text("No [[doc]] wiki-links, @task mentions, or external links found."))
                    } else {
                        List(refs) { ref in
                            VStack(alignment: .leading, spacing: 2) {
                                HStack {
                                    Text(ref.type.rawValue)
                                        .font(.caption2.weight(.bold))
                                        .foregroundStyle(WorkspaceStyle.accent)
                                    Spacer()
                                }
                                Button(ref.title) {
                                    isPresented = false
                                    switch ref.type {
                                    case .docWikiLink: Task { await model.openDocument(ref.target, projectID: doc?.projectId) }
                                    case .taskMention: Task { await model.openTask(ref.target, projectID: doc?.projectId) }
                                    case .externalURL: if let url = URL(string: ref.target) { NSWorkspace.shared.open(url) }
                                    }
                                }.buttonStyle(.link).font(.body)
                                Text(ref.target).font(.caption2).foregroundStyle(.secondary)
                            }
                            .padding(.vertical, 2)
                        }
                    }
                }
                .frame(minWidth: 280)
            }
        }
        .frame(width: 680, height: 460)
    }
}
