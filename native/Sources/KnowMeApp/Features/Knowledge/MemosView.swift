import SwiftUI
import AppKit
import KnowMeCore

struct MemosView: View {
    @Bindable var model: AppModel
    @State private var store = MemoStore()
    @State private var editingMemo: MemoItem?
    @State private var deleteTarget: MemoItem?
    @State private var showDeleteConfirm = false

    init(model: AppModel) {
        self.model = model
    }

    var body: some View {
        VStack(spacing: 0) {
            topBar
            Divider()

            if let err = store.errorMessage {
                errorBanner(err)
            }

            tagFilterBar
            Divider()

            ScrollView {
                VStack(spacing: 20) {
                    composerBox
                    feedContent
                }
                .padding(20)
                .frame(maxWidth: 820)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .task(id: model.connected) {
            store.checkComposerDraft(model: model)
            await store.loadMemos(model: model)
        }
        .onChange(of: model.eventSequence) { _, _ in
            Task { await store.loadMemos(model: model) }
        }
        .sheet(item: $editingMemo) { memo in
            EditMemoSheet(memo: memo, store: store, model: model, isPresented: Binding(
                get: { editingMemo != nil },
                set: { if !$0 { editingMemo = nil } }
            ))
        }
        .confirmationDialog(
            "Delete this memo?",
            isPresented: $showDeleteConfirm,
            titleVisibility: .visible
        ) {
            Button("Delete Memo", role: .destructive) {
                if let target = deleteTarget {
                    Task { _ = await store.deleteMemo(id: target.id, model: model) }
                }
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("This will permanently remove the memo.")
        }
    }

    // MARK: - Top Bar

    private var topBar: some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 6) {
                    Text("Memos")
                        .font(.title2.weight(.semibold))
                    Text("(\(store.filteredMemos.count))")
                        .font(.title3)
                        .foregroundStyle(.secondary)
                }
                Text("Global scratchpad notes and quick captures with hashtag organization")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            Spacer()

            // Search Bar
            HStack(spacing: 6) {
                Image(systemName: "magnifyingglass")
                    .foregroundStyle(.secondary)
                TextField("Search memos...", text: $store.searchQuery)
                    .textFieldStyle(.plain)
                    .frame(width: 200)
                    .onSubmit {
                        Task { await store.loadMemos(query: store.searchQuery, model: model) }
                    }

                if !store.searchQuery.isEmpty {
                    Button {
                        store.searchQuery = ""
                        Task { await store.loadMemos(model: model) }
                    } label: {
                        Image(systemName: "xmark.circle.fill")
                            .foregroundStyle(.secondary)
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(6)
            .background(Color.secondary.opacity(0.08))
            .clipShape(RoundedRectangle(cornerRadius: 8))

            Button {
                Task { await store.loadMemos(query: store.searchQuery, model: model) }
            } label: {
                Image(systemName: "arrow.clockwise")
            }
            .buttonStyle(.plain)
            .help("Refresh memos")
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 12)
        .background(Color.secondary.opacity(0.03))
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
                    Text("All Memos")
                        .font(.caption.weight(store.selectedTag == nil ? .bold : .regular))
                        .padding(.horizontal, 10)
                        .padding(.vertical, 4)
                        .background(store.selectedTag == nil ? WorkspaceStyle.accent.opacity(0.2) : Color.secondary.opacity(0.08))
                        .foregroundStyle(store.selectedTag == nil ? WorkspaceStyle.accent : .primary)
                        .clipShape(Capsule())
                }
                .buttonStyle(.plain)

                ForEach(store.allTags, id: \.self) { tag in
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

    // MARK: - Composer Box

    private var composerBox: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Label("Capture Memo", systemImage: "square.and.pencil")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(WorkspaceStyle.accent)
                Spacer()
                if store.hasComposerDraft {
                    Text("Draft recovered")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
            }

            TextEditor(text: $store.newMemoContent)
                .onImagePaste { data, filename, mimeType in
                    if let markdown = await store.uploadImage(data: data, filename: filename, mimeType: mimeType, model: model) {
                        store.newMemoContent.append("\n" + markdown + "\n")
                    }
                }
                .font(.body)
                .frame(minHeight: 70)
                .padding(8)
                .background(Color.secondary.opacity(0.04))
                .clipShape(RoundedRectangle(cornerRadius: 6))
                .onChange(of: store.newMemoContent) { _, newText in
                    store.saveComposerDraft(content: newText, model: model)
                }

            HStack {
                Button {
                    attachImageToComposer()
                } label: {
                    Label("Attach Image", systemImage: "photo")
                        .font(.caption)
                }
                .buttonStyle(.borderless)
                .help("Upload and embed image")

                Spacer()

                Button("Clear") {
                    store.newMemoContent = ""
                    store.clearComposerDraft(model: model)
                }
                .controlSize(.small)
                .disabled(store.newMemoContent.isEmpty)

                Button {
                    Task {
                        _ = await store.addMemo(content: store.newMemoContent, model: model)
                    }
                } label: {
                    if store.isSaving {
                        ProgressView().controlSize(.small)
                    } else {
                        Label("Post Memo", systemImage: "paperplane.fill")
                    }
                }
                .buttonStyle(.borderedProminent)
                .tint(WorkspaceStyle.accent)
                .controlSize(.small)
                .keyboardShortcut(.return, modifiers: .command)
                .disabled(store.newMemoContent.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || store.isSaving)
            }
        }
        .padding(14)
        .background(Color.secondary.opacity(0.05))
        .clipShape(RoundedRectangle(cornerRadius: 10))
        .overlay(
            RoundedRectangle(cornerRadius: 10)
                .stroke(WorkspaceStyle.accent.opacity(0.3), lineWidth: 1)
        )
    }

    private func attachImageToComposer() {
        let panel = NSOpenPanel()
        panel.canChooseFiles = true
        panel.canChooseDirectories = false
        panel.allowedContentTypes = [.png, .jpeg, .webP]
        if panel.runModal() == .OK, let fileURL = panel.url {
            guard let data = try? Data(contentsOf: fileURL) else { return }
            let filename = fileURL.lastPathComponent
            let mimeType = switch fileURL.pathExtension.lowercased() {
            case "png": "image/png"
            case "jpg", "jpeg": "image/jpeg"
            case "webp": "image/webp"
            default: "application/octet-stream"
            }
            Task {
                if let markdown = await store.uploadImage(data: data, filename: filename, mimeType: mimeType, model: model) {
                    store.newMemoContent.append("\n" + markdown + "\n")
                    store.saveComposerDraft(content: store.newMemoContent, model: model)
                }
            }
        }
    }

    // MARK: - Feed Content

    private var feedContent: some View {
        Group {
            if store.isLoading && store.memos.isEmpty {
                VStack(spacing: 12) {
                    ProgressView()
                    Text("Loading memos...").font(.caption).foregroundStyle(.secondary)
                }
                .frame(maxWidth: .infinity, minHeight: 200)
            } else if store.filteredMemos.isEmpty {
                ContentUnavailableView(
                    store.searchQuery.isEmpty ? "No Memos Yet" : "No Matching Memos",
                    systemImage: "note.text",
                    description: Text(store.searchQuery.isEmpty ? "Write your first quick memo in the box above." : "No memos match your search query.")
                )
                .frame(maxWidth: .infinity, minHeight: 200)
            } else {
                VStack(alignment: .leading, spacing: 24) {
                    ForEach(store.dateGroups) { group in
                        VStack(alignment: .leading, spacing: 12) {
                            HStack(spacing: 8) {
                                Label(group.label, systemImage: "calendar")
                                    .font(.headline)
                                    .foregroundStyle(.secondary)
                                Spacer()
                                Text("\(group.items.count) \(group.items.count == 1 ? "memo" : "memos")")
                                    .font(.caption)
                                    .foregroundStyle(.tertiary)
                            }
                            .padding(.horizontal, 4)

                            ForEach(group.items) { memo in
                                memoCard(memo)
                            }
                        }
                    }
                }
            }
        }
    }

    private func memoCard(_ memo: MemoItem) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            MarkdownView(content: memo.content, client: model.client)
                .frame(maxWidth: .infinity, alignment: .leading)

            if !memo.tags.isEmpty {
                HStack(spacing: 6) {
                    ForEach(memo.tags, id: \.self) { tag in
                        Button {
                            store.selectedTag = tag
                        } label: {
                            Text("#\(tag)")
                                .font(.caption2.weight(.medium))
                                .padding(.horizontal, 6)
                                .padding(.vertical, 2)
                                .background(WorkspaceStyle.accent.opacity(0.12))
                                .foregroundStyle(WorkspaceStyle.accent)
                                .clipShape(Capsule())
                        }
                        .buttonStyle(.plain)
                    }
                }
            }

            Divider()

            HStack {
                Text(memo.createdAt.prefix(19).replacingOccurrences(of: "T", with: " "))
                    .font(.caption2)
                    .foregroundStyle(.tertiary)

                Spacer()

                Button {
                    NSPasteboard.general.clearContents()
                    NSPasteboard.general.setString(memo.content, forType: .string)
                } label: {
                    Image(systemName: "doc.on.doc")
                        .font(.caption)
                }
                .buttonStyle(.borderless)
                .help("Copy content")

                Button {
                    editingMemo = memo
                } label: {
                    Image(systemName: "pencil")
                        .font(.caption)
                }
                .buttonStyle(.borderless)
                .help("Edit memo")

                Button {
                    deleteTarget = memo
                    showDeleteConfirm = true
                } label: {
                    Image(systemName: "trash")
                        .font(.caption)
                        .foregroundStyle(.red)
                }
                .buttonStyle(.borderless)
                .help("Delete memo")
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

// MARK: - Edit Memo Sheet

struct EditMemoSheet: View {
    let memo: MemoItem
    let store: MemoStore
    let model: AppModel
    @Binding var isPresented: Bool

    @State private var content: String
    @State private var isBusy = false
    @State private var errorMessage: String?

    init(memo: MemoItem, store: MemoStore, model: AppModel, isPresented: Binding<Bool>) {
        self.memo = memo
        self.store = store
        self.model = model
        self._isPresented = isPresented
        self._content = State(initialValue: memo.content)
    }

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Text("Edit Memo").font(.headline)
                Spacer()
                Button("Cancel") { isPresented = false }.keyboardShortcut(.cancelAction)
            }
            .padding(16)
            Divider()

            VStack(alignment: .leading, spacing: 10) {
                Text("Content (Markdown and #hashtags supported):")
                    .font(.caption)
                    .foregroundStyle(.secondary)

                TextEditor(text: $content)
                    .font(.body)
                    .frame(minHeight: 180)
                    .padding(8)
                    .background(Color.secondary.opacity(0.04))
                    .clipShape(RoundedRectangle(cornerRadius: 6))

                HStack {
                    Button("Attach Image...") {
                        attachImage()
                    }
                    .controlSize(.small)

                    Spacer()

                    if let errorMessage {
                        Text(errorMessage).font(.caption).foregroundStyle(.red)
                    }
                }
            }
            .padding(16)

            Divider()
            HStack {
                Spacer()
                Button("Update Memo") {
                    isBusy = true
                    Task {
                        let success = await store.updateMemo(id: memo.id, content: content, model: model)
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
                .disabled(content.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || isBusy)
            }
            .padding(16)
        }
        .frame(width: 540, height: 360)
    }

    private func attachImage() {
        let panel = NSOpenPanel()
        panel.canChooseFiles = true
        panel.canChooseDirectories = false
        panel.allowedContentTypes = [.png, .jpeg, .webP]
        if panel.runModal() == .OK, let fileURL = panel.url {
            guard let data = try? Data(contentsOf: fileURL) else { return }
            let filename = fileURL.lastPathComponent
            let mimeType = switch fileURL.pathExtension.lowercased() {
            case "png": "image/png"
            case "jpg", "jpeg": "image/jpeg"
            case "webp": "image/webp"
            default: "application/octet-stream"
            }
            Task {
                if let markdown = await store.uploadImage(data: data, filename: filename, mimeType: mimeType, model: model) {
                    content.append("\n" + markdown + "\n")
                }
            }
        }
    }
}
