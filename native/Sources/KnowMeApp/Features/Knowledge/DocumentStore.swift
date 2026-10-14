import Foundation
import Observation
import SwiftUI
import AppKit
import KnowMeCore

struct DocFolderGroup: Identifiable, Sendable {
    var id: String { folderName }
    let folderName: String
    var docs: [DocItem]
}

private struct DocumentDraft: Codable {
    var version = 2
    let content: String
    let title: String
    let description: String
    let tags: String
}

@MainActor
@Observable
final class DocumentStore {
    var docs: [DocItem] = []
    var selectedDoc: DocItem?
    var isLoading = false
    var isSaving = false
    var errorMessage: String?
    var searchQuery = ""

    // Edit state
    var editedContent = ""
    var editedTitle = ""
    var editedDescription = ""
    var editedTags = ""

    // Draft state
    var hasRecoverableDraft = false
    var recoverableDraftText: String?
    private var recoveredMetadataDraft: DocumentDraft?

    // History state
    var history: DocVersionHistory?
    var isLoadingHistory = false
    var selectedDiff: DocRevisionDiff?
    var isLoadingDiff = false

    // Local Annotations
    var annotations: [LocalAnnotation] = []
    private var selectionGeneration: UInt64 = 0

    init() {}

    var isDirty: Bool {
        guard let selectedDoc else { return false }
        let tagsArray = editedTags.split(separator: ",").map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }
        return editedContent != selectedDoc.content ||
               editedTitle != (selectedDoc.metadata.title.isEmpty ? selectedDoc.title : selectedDoc.metadata.title) ||
               editedDescription != (selectedDoc.metadata.description ?? "") ||
               tagsArray != selectedDoc.metadata.tags
    }

    var filteredDocs: [DocItem] {
        let q = searchQuery.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        if q.isEmpty { return docs }
        return docs.filter { doc in
            doc.title.lowercased().contains(q) ||
            doc.path.lowercased().contains(q) ||
            (doc.metadata.description?.lowercased().contains(q) ?? false) ||
            doc.metadata.tags.contains { $0.lowercased().contains(q) } ||
            doc.content.lowercased().contains(q)
        }
    }

    var folderGroups: [DocFolderGroup] {
        var groups: [String: [DocItem]] = [:]
        for doc in filteredDocs {
            let folder = doc.folder?.trimmingCharacters(in: .whitespacesAndNewlines)
            let folderName = (folder == nil || folder!.isEmpty) ? "Root" : folder!
            groups[folderName, default: []].append(doc)
        }
        return groups.keys.sorted { k1, k2 in
            if k1 == "Root" { return true }
            if k2 == "Root" { return false }
            return k1.localizedCaseInsensitiveCompare(k2) == .orderedAscending
        }.map { DocFolderGroup(folderName: $0, docs: groups[$0] ?? []) }
    }

    // MARK: - API Calls

    func loadDocs(model: AppModel) async {
        guard model.connected else { return }
        isLoading = true
        errorMessage = nil

        let rev = model.workspace
        var query: [String: String] = [:]
        if let projectID = model.selectedProject?.id {
            query["projectId"] = projectID
        }

        do {
            let res = try await model.decode(
                DocsListResponse.self,
                method: .GET,
                path: "/api/docs",
                query: query,
                projectScoped: true
            )
            guard rev == model.workspace else { return }
            self.docs = res.docs

            // If selectedDoc exists, update or reselect it
            if let selected = self.selectedDoc {
                if let updated = res.docs.first(where: { $0.id == selected.id }) {
                    if !isDirty { await selectDoc(updated, model: model) }
                } else if let first = res.docs.first {
                    await selectDoc(first, model: model)
                } else {
                    self.selectedDoc = nil
                }
            } else if let first = res.docs.first {
                await selectDoc(first, model: model)
            }
        } catch {
            guard rev == model.workspace else { return }
            self.errorMessage = "Failed to load documents: \(error.localizedDescription)"
        }
        isLoading = false
    }

    func selectDoc(_ doc: DocItem, model: AppModel) async {
        selectionGeneration &+= 1
        let generation = selectionGeneration
        // Auto-save draft of currently selected doc before switching if dirty
        if let current = selectedDoc, isDirty {
            saveDraft(for: current, model: model)
        }

        errorMessage = nil
        let rev = model.workspace

        do {
            let freshDoc = try await model.decode(
                DocItem.self,
                method: .GET,
                path: "/api/docs/\(APIClient.documentPath(doc.path))",
                query: scopeQuery(for: doc),
                projectScoped: false
            )
            guard rev == model.workspace, generation == selectionGeneration else { return }
            self.selectedDoc = freshDoc
            self.editedContent = freshDoc.content
            self.editedTitle = freshDoc.metadata.title.isEmpty ? freshDoc.title : freshDoc.metadata.title
            self.editedDescription = freshDoc.metadata.description ?? ""
            self.editedTags = freshDoc.metadata.tags.joined(separator: ", ")

            // Check draft recovery
            checkRecoverableDraft(for: freshDoc, model: model)
            // Load local annotations
            loadAnnotations(for: freshDoc.path)
        } catch {
            guard rev == model.workspace, generation == selectionGeneration else { return }
            self.errorMessage = "Could not open document: \(error.localizedDescription)"
        }
    }

    func scopeQuery(for doc: DocItem) -> [String: String] {
        doc.projectId.map { ["projectId": $0] } ?? [:]
    }

    func saveCurrentDoc(model: AppModel) async -> Bool {
        guard let doc = selectedDoc else { return false }
        isSaving = true
        errorMessage = nil
        let rev = model.workspace

        let tagsArray = editedTags.split(separator: ",").map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }

        let payload = DocUpdatePayload(
            title: editedTitle,
            description: editedDescription,
            content: editedContent,
            tags: tagsArray,
            path: doc.path,
            projectId: doc.projectId
        )

        do {
            let bodyJSON = try JSONValue.encoded(payload)
            let updated = try await model.decode(
                DocItem.self,
                method: .PUT,
                path: "/api/docs/\(APIClient.documentPath(doc.path))",
                query: scopeQuery(for: doc),
                body: bodyJSON,
                projectScoped: false
            )
            guard rev == model.workspace else { return false }
            self.selectedDoc = updated
            self.editedContent = updated.content
            self.editedTitle = updated.metadata.title.isEmpty ? updated.title : updated.metadata.title
            self.editedDescription = updated.metadata.description ?? ""
            self.editedTags = updated.metadata.tags.joined(separator: ", ")

            // Clear draft upon successful save
            clearDraft(for: doc, model: model)
            hasRecoverableDraft = false

            // Update in-memory list
            if let idx = self.docs.firstIndex(where: { $0.id == doc.id }) {
                self.docs[idx] = updated
            }
            isSaving = false
            return true
        } catch {
            guard rev == model.workspace else { return false }
            self.errorMessage = "Failed to save document: \(error.localizedDescription)"
            isSaving = false
            return false
        }
    }

    func createDoc(
        title: String,
        folder: String?,
        description: String?,
        content: String,
        tags: [String],
        global: Bool,
        model: AppModel
    ) async -> Bool {
        isSaving = true
        errorMessage = nil
        let rev = model.workspace

        let payload = DocCreatePayload(
            title: title,
            folder: folder,
            description: description,
            content: content,
            tags: tags,
            global: global
        )

        do {
            let bodyJSON = try JSONValue.encoded(payload)
            let created = try await model.decode(
                DocItem.self,
                method: .POST,
                path: "/api/docs",
                body: bodyJSON,
                projectScoped: !global
            )
            guard rev == model.workspace else { return false }
            self.docs.insert(created, at: 0)
            await selectDoc(created, model: model)
            isSaving = false
            return true
        } catch {
            guard rev == model.workspace else { return false }
            self.errorMessage = "Failed to create document: \(error.localizedDescription)"
            isSaving = false
            return false
        }
    }

    // MARK: - Draft Recovery

    func saveDraft(for doc: DocItem, model: AppModel) {
        let tags = editedTags.split(separator: ",").map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }
        guard editedContent != doc.content || editedTitle != doc.metadata.title || editedDescription != (doc.metadata.description ?? "") || tags != doc.metadata.tags else {
            model.drafts.remove(namespace: "docs", projectID: doc.projectId, entityID: doc.path)
            return
        }
        let draft = DocumentDraft(content: editedContent, title: editedTitle, description: editedDescription, tags: editedTags)
        if let data = try? JSONEncoder().encode(draft), let text = String(data: data, encoding: .utf8) {
            model.drafts.save(text, namespace: "docs", projectID: doc.projectId, entityID: doc.path)
        }
    }

    func checkRecoverableDraft(for doc: DocItem, model: AppModel) {
        if let draft = model.drafts.load(namespace: "docs", projectID: doc.projectId, entityID: doc.path),
           draft != doc.content {
            self.hasRecoverableDraft = true
            let metadata = try? JSONDecoder().decode(DocumentDraft.self, from: Data(draft.utf8))
            self.recoveredMetadataDraft = metadata
            self.recoverableDraftText = metadata?.content ?? draft
        } else {
            self.hasRecoverableDraft = false
            self.recoverableDraftText = nil
            self.recoveredMetadataDraft = nil
        }
    }

    func restoreDraft() {
        guard let text = recoverableDraftText else { return }
        self.editedContent = text
        if let draft = recoveredMetadataDraft {
            self.editedTitle = draft.title
            self.editedDescription = draft.description
            self.editedTags = draft.tags
        }
        self.hasRecoverableDraft = false
    }

    func discardDraft(model: AppModel) {
        guard let doc = selectedDoc else { return }
        clearDraft(for: doc, model: model)
        self.hasRecoverableDraft = false
        self.recoverableDraftText = nil
        self.recoveredMetadataDraft = nil
        self.editedContent = doc.content
    }

    private func clearDraft(for doc: DocItem, model: AppModel) {
        model.drafts.remove(namespace: "docs", projectID: doc.projectId, entityID: doc.path)
    }

    // MARK: - History & Diff & Restore

    func loadHistory(model: AppModel) async {
        guard let doc = selectedDoc else { return }
        isLoadingHistory = true
        errorMessage = nil
        let rev = model.workspace

        do {
            let res = try await model.decode(
                DocVersionHistory.self,
                method: .GET,
                path: "/api/docs/\(APIClient.documentPath(doc.path))/history",
                query: scopeQuery(for: doc),
                projectScoped: false
            )
            guard rev == model.workspace else { return }
            self.history = res
        } catch {
            guard rev == model.workspace else { return }
            self.errorMessage = "Failed to load history: \(error.localizedDescription)"
        }
        isLoadingHistory = false
    }

    func loadDiff(revisionId: String, model: AppModel) async {
        guard let doc = selectedDoc else { return }
        isLoadingDiff = true
        errorMessage = nil
        let rev = model.workspace

        do {
            let res = try await model.decode(
                DocRevisionDiff.self,
                method: .GET,
                path: "/api/docs/\(APIClient.documentPath(doc.path))/history/\(APIClient.segment(revisionId))/diff",
                query: scopeQuery(for: doc),
                projectScoped: false
            )
            guard rev == model.workspace else { return }
            self.selectedDiff = res
        } catch {
            guard rev == model.workspace else { return }
            self.errorMessage = "Failed to load diff: \(error.localizedDescription)"
        }
        isLoadingDiff = false
    }

    func restoreRevision(revisionId: String, section: String? = nil, mode: String = "document", model: AppModel) async -> Bool {
        guard let doc = selectedDoc else { return false }
        isSaving = true
        errorMessage = nil
        let rev = model.workspace

        let req = DocRestoreRequest(revision: revisionId, section: section, mode: mode)

        do {
            let bodyJSON = try JSONValue.encoded(req)
            let res = try await model.decode(
                DocRestoreResponse.self,
                method: .POST,
                path: "/api/docs/\(APIClient.documentPath(doc.path))/restore",
                query: scopeQuery(for: doc),
                body: bodyJSON,
                projectScoped: false
            )
            guard rev == model.workspace else { return false }
            self.selectedDoc = res.doc
            self.editedContent = res.doc.content
            self.editedTitle = res.doc.metadata.title.isEmpty ? res.doc.title : res.doc.metadata.title
            self.editedDescription = res.doc.metadata.description ?? ""
            self.editedTags = res.doc.metadata.tags.joined(separator: ", ")
            self.history = res.history
            self.selectedDiff = nil
            clearDraft(for: doc, model: model)
            hasRecoverableDraft = false

            if let idx = self.docs.firstIndex(where: { $0.id == doc.id }) {
                self.docs[idx] = res.doc
            }
            isSaving = false
            return true
        } catch {
            guard rev == model.workspace else { return false }
            self.errorMessage = "Failed to restore revision: \(error.localizedDescription)"
            isSaving = false
            return false
        }
    }

    // MARK: - Asset Upload

    func uploadImage(data: Data, filename: String, mimeType: String, model: AppModel) async -> String? {
        guard let client = model.client else { return nil }
        isSaving = true
        errorMessage = nil

        let part = UploadPart(name: "file", filename: filename, mimeType: mimeType, data: data)

        do {
            let json = try await client.upload(method: .POST, path: "/api/assets", parts: [part])
            let asset = try json.decoded(AssetResponse.self)
            isSaving = false
            return "![\(asset.name ?? filename)](\(asset.url))"
        } catch {
            self.errorMessage = "Failed to upload image: \(error.localizedDescription)"
            isSaving = false
            return nil
        }
    }

    // MARK: - Local Annotations (Client-side audited storage)

    private func annotationKey(for docPath: String) -> String {
        let project = selectedDoc?.projectId ?? "global"
        return "KnowMe.annotations.\(project.utf8.count):\(project)\(docPath.utf8.count):\(docPath)"
    }

    func loadAnnotations(for docPath: String) {
        guard let data = UserDefaults.standard.data(forKey: annotationKey(for: docPath)),
              let decoded = try? JSONDecoder().decode([LocalAnnotation].self, from: data) else {
            self.annotations = []
            return
        }
        self.annotations = decoded
    }

    func addAnnotation(docPath: String, selectedText: String, content: String, type: AnnotationType) {
        let newAnnotation = LocalAnnotation(docPath: docPath, selectedText: selectedText, content: content, type: type)
        annotations.append(newAnnotation)
        saveAnnotations(for: docPath)
    }

    func removeAnnotation(id: String, docPath: String) {
        annotations.removeAll { $0.id == id }
        saveAnnotations(for: docPath)
    }

    func clearAnnotations(for docPath: String) {
        annotations.removeAll()
        UserDefaults.standard.removeObject(forKey: annotationKey(for: docPath))
    }

    private func saveAnnotations(for docPath: String) {
        if let data = try? JSONEncoder().encode(annotations) {
            UserDefaults.standard.set(data, forKey: annotationKey(for: docPath))
        }
    }

    func exportAnnotationsMarkdown(for docPath: String) -> String {
        guard !annotations.isEmpty else { return "" }
        var lines: [String] = []
        lines.append("# Annotations for \(docPath) (\(annotations.count) total)")
        lines.append("Exported: \(ISO8601DateFormatter().string(from: Date()))\n")

        for (idx, ann) in annotations.enumerated() {
            lines.append("### \(idx + 1). [\(ann.type.title.uppercased())]")
            if !ann.selectedText.isEmpty {
                lines.append("> \(ann.selectedText)\n")
            }
            lines.append(ann.content)
            lines.append("")
        }
        return lines.joined(separator: "\n")
    }
}
