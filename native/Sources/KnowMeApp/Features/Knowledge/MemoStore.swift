import Foundation
import Observation
import SwiftUI
import AppKit
import KnowMeCore

public struct MemoDateGroup: Identifiable, Sendable {
    public var id: String { label }
    public let label: String
    public var items: [MemoItem]
}

@MainActor
@Observable
final class MemoStore {
    var memos: [MemoItem] = []
    var isLoading = false
    var isSaving = false
    var errorMessage: String?
    var searchQuery = ""
    var selectedTag: String?

    // Composer draft state
    var newMemoContent = ""
    var hasComposerDraft = false

    init() {}

    var allTags: [String] {
        var set = Set<String>()
        for m in memos {
            for t in m.tags {
                set.insert(t)
            }
        }
        return set.sorted()
    }

    var filteredMemos: [MemoItem] {
        var list = memos
        if let selectedTag {
            list = list.filter { $0.tags.contains(selectedTag) }
        }
        return list
    }

    var dateGroups: [MemoDateGroup] {
        var groups: [MemoDateGroup] = []
        for memo in filteredMemos {
            let label = Self.formatDateLabel(memo.createdAt)
            if let last = groups.last, last.label == label {
                groups[groups.count - 1].items.append(memo)
            } else {
                groups.append(MemoDateGroup(label: label, items: [memo]))
            }
        }
        return groups
    }

    nonisolated static func formatDateLabel(_ isoDate: String) -> String {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        var date = formatter.date(from: isoDate)
        if date == nil {
            formatter.formatOptions = [.withInternetDateTime]
            date = formatter.date(from: isoDate)
        }
        guard let date else {
            return String(isoDate.prefix(10))
        }

        let calendar = Calendar.current
        if calendar.isDateInToday(date) {
            return "Today"
        }
        if calendar.isDateInYesterday(date) {
            return "Yesterday"
        }

        let displayFormatter = DateFormatter()
        displayFormatter.dateStyle = .medium
        displayFormatter.timeStyle = .none
        return displayFormatter.string(from: date)
    }

    // MARK: - API Calls

    func loadMemos(query: String? = nil, model: AppModel) async {
        guard model.connected else { return }
        isLoading = true
        errorMessage = nil

        var queryParams: [String: String] = [:]
        if let query, !query.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            queryParams["q"] = query.trimmingCharacters(in: .whitespacesAndNewlines)
        }

        do {
            let fetched = try await model.decode(
                [MemoItem].self,
                method: .GET,
                path: "/api/memos",
                query: queryParams,
                projectScoped: false
            )
            self.memos = fetched
        } catch {
            self.errorMessage = "Failed to load memos: \(error.localizedDescription)"
        }
        isLoading = false
    }

    func addMemo(content: String, model: AppModel) async -> Bool {
        guard !content.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return false }
        isSaving = true
        errorMessage = nil

        let body: JSONValue = .object(["content": .string(content)])

        do {
            let created = try await model.decode(
                MemoItem.self,
                method: .POST,
                path: "/api/memos",
                body: body,
                projectScoped: false
            )
            self.memos.insert(created, at: 0)
            clearComposerDraft(model: model)
            self.newMemoContent = ""
            isSaving = false
            return true
        } catch {
            self.errorMessage = "Failed to add memo: \(error.localizedDescription)"
            isSaving = false
            return false
        }
    }

    func updateMemo(id: String, content: String, model: AppModel) async -> Bool {
        guard !content.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return false }
        isSaving = true
        errorMessage = nil

        let body: JSONValue = .object(["content": .string(content)])

        do {
            let updated = try await model.decode(
                MemoItem.self,
                method: .PATCH,
                path: "/api/memos/\(APIClient.segment(id))",
                body: body,
                projectScoped: false
            )
            if let idx = self.memos.firstIndex(where: { $0.id == id }) {
                self.memos[idx] = updated
            }
            isSaving = false
            return true
        } catch {
            self.errorMessage = "Failed to update memo: \(error.localizedDescription)"
            isSaving = false
            return false
        }
    }

    func deleteMemo(id: String, model: AppModel) async -> Bool {
        isSaving = true
        errorMessage = nil

        do {
            _ = try await model.request(
                method: .DELETE,
                path: "/api/memos/\(APIClient.segment(id))",
                projectScoped: false
            )
            self.memos.removeAll { $0.id == id }
            isSaving = false
            return true
        } catch {
            self.errorMessage = "Failed to delete memo: \(error.localizedDescription)"
            isSaving = false
            return false
        }
    }

    // MARK: - Image Upload Helper

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

    // MARK: - Draft Recovery

    func checkComposerDraft(model: AppModel) {
        if let draft = model.drafts.load(namespace: "memos", projectID: nil, entityID: "new"),
           !draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            self.newMemoContent = draft
            self.hasComposerDraft = true
        }
    }

    func saveComposerDraft(content: String, model: AppModel) {
        if content.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            clearComposerDraft(model: model)
        } else {
            model.drafts.save(content, namespace: "memos", projectID: nil, entityID: "new")
        }
    }

    func clearComposerDraft(model: AppModel) {
        model.drafts.remove(namespace: "memos", projectID: nil, entityID: "new")
        self.hasComposerDraft = false
    }
}
