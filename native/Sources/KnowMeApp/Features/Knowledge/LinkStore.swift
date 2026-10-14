import Foundation
import Observation
import SwiftUI
import AppKit
import KnowMeCore

@MainActor
@Observable
final class LinkStore {
    var links: [SavedLink] = []
    var rankedLinks: [RankedLink] = []
    var isLoading = false
    var isSaving = false
    var errorMessage: String?
    var searchQuery = ""
    var searchMode: String = "semantic" // "semantic" or "keyword"
    var isServerSearchActive = false
    var searchFallback = false
    var activeSearchMode: String = "semantic"
    var selectedTag: String?

    // Link Classifier State
    var classifierStatus: LinkClassifierStatus?
    var isLoadingClassifier = false
    var testResult: String?
    var isTestingClassifier = false

    init() {}

    var availableTags: [String] {
        var tagsSet = Set<String>()
        for link in links {
            if let tags = link.tags {
                for t in tags {
                    let trimmed = t.trimmingCharacters(in: .whitespacesAndNewlines)
                    if !trimmed.isEmpty { tagsSet.insert(trimmed) }
                }
            }
        }
        return tagsSet.sorted()
    }

    var displayLinks: [SavedLink] {
        let base: [SavedLink]
        if isServerSearchActive {
            base = rankedLinks.map { $0.link }
        } else {
            base = links
        }

        if let selectedTag {
            return base.filter { link in
                link.tags?.contains(selectedTag) ?? false
            }
        }
        return base
    }

    // MARK: - API Calls

    func loadLinks(model: AppModel) async {
        guard model.connected else { return }
        isLoading = true
        errorMessage = nil

        do {
            // GET /api/links is global
            let fetched = try await model.decode(
                [SavedLink].self,
                method: .GET,
                path: "/api/links",
                projectScoped: false
            )
            self.links = fetched
            if !searchQuery.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                await search(query: searchQuery, mode: searchMode, model: model)
            }
        } catch {
            self.errorMessage = "Failed to load links: \(error.localizedDescription)"
        }
        isLoading = false
    }

    func search(query: String, mode: String, model: AppModel) async {
        let q = query.trimmingCharacters(in: .whitespacesAndNewlines)
        if q.isEmpty {
            self.isServerSearchActive = false
            self.rankedLinks = []
            self.searchFallback = false
            return
        }

        isLoading = true
        errorMessage = nil

        do {
            let res = try await model.decode(
                LinkSearchResponse.self,
                method: .GET,
                path: "/api/links",
                query: ["q": q, "mode": mode],
                projectScoped: false
            )
            self.isServerSearchActive = true
            self.rankedLinks = res.links
            self.searchFallback = res.fallback
            self.activeSearchMode = res.mode
        } catch {
            self.errorMessage = "Search failed: \(error.localizedDescription)"
            self.isServerSearchActive = false
        }
        isLoading = false
    }

    func addLink(url: String, note: String?, tags: [String], imageData: Data?, imageFilename: String?, model: AppModel) async -> Bool {
        guard let client = model.client else { return false }
        isSaving = true
        errorMessage = nil

        var parts: [UploadPart] = [
            UploadPart(name: "url", data: Data(url.utf8))
        ]
        if let note, !note.isEmpty {
            parts.append(UploadPart(name: "note", data: Data(note.utf8)))
        }
        for tag in tags {
            parts.append(UploadPart(name: "tag", data: Data(tag.utf8)))
        }
        if let imageData, let imageFilename {
            parts.append(UploadPart(
                name: "image",
                filename: imageFilename,
                mimeType: "image/png",
                data: imageData
            ))
        }

        do {
            let json = try await client.upload(method: .POST, path: "/api/links", parts: parts)
            let created = try json.decoded(SavedLink.self)
            self.links.insert(created, at: 0)
            isSaving = false
            return true
        } catch {
            self.errorMessage = "Failed to add link: \(error.localizedDescription)"
            isSaving = false
            return false
        }
    }

    func updateLink(
        id: String,
        title: String?,
        description: String?,
        note: String?,
        tags: [String]?,
        imageData: Data?,
        imageFilename: String?,
        model: AppModel
    ) async -> Bool {
        guard let client = model.client else { return false }
        isSaving = true
        errorMessage = nil

        var parts: [UploadPart] = []
        if let title { parts.append(UploadPart(name: "title", data: Data(title.utf8))) }
        if let description { parts.append(UploadPart(name: "description", data: Data(description.utf8))) }
        if let note { parts.append(UploadPart(name: "note", data: Data(note.utf8))) }
        if let tags {
            for tag in tags {
                parts.append(UploadPart(name: "tag", data: Data(tag.utf8)))
            }
        }
        if let imageData, let imageFilename {
            parts.append(UploadPart(
                name: "image",
                filename: imageFilename,
                mimeType: "image/png",
                data: imageData
            ))
        }

        do {
            let json = try await client.upload(method: .PATCH, path: "/api/links/\(APIClient.segment(id))", parts: parts)
            let updated = try json.decoded(SavedLink.self)
            if let idx = self.links.firstIndex(where: { $0.id == id }) {
                self.links[idx] = updated
            }
            if let idx = self.rankedLinks.firstIndex(where: { $0.id == id }) {
                self.rankedLinks[idx] = RankedLinkWrapper(link: updated, score: self.rankedLinks[idx].score, matchedBy: self.rankedLinks[idx].matchedBy).toRankedLink()
            }
            isSaving = false
            return true
        } catch {
            self.errorMessage = "Failed to update link: \(error.localizedDescription)"
            isSaving = false
            return false
        }
    }

    func deleteLink(id: String, model: AppModel) async -> Bool {
        isSaving = true
        errorMessage = nil

        do {
            _ = try await model.request(
                method: .DELETE,
                path: "/api/links/\(APIClient.segment(id))",
                projectScoped: false
            )
            self.links.removeAll { $0.id == id }
            self.rankedLinks.removeAll { $0.id == id }
            isSaving = false
            return true
        } catch {
            self.errorMessage = "Failed to delete link: \(error.localizedDescription)"
            isSaving = false
            return false
        }
    }

    // MARK: - Classifier

    func loadClassifierStatus(model: AppModel) async {
        isLoadingClassifier = true
        do {
            let status = try await model.decode(
                LinkClassifierStatus.self,
                method: .GET,
                path: "/api/link-classifier",
                projectScoped: false
            )
            self.classifierStatus = status
        } catch {
            // Non-fatal if classifier is unconfigured
        }
        isLoadingClassifier = false
    }

    func saveClassifierSettings(settings: LinkClassifierSettings, model: AppModel) async -> Bool {
        isSaving = true
        errorMessage = nil
        do {
            let bodyJSON = try JSONValue.encoded(settings)
            let updated = try await model.decode(
                LinkClassifierStatus.self,
                method: .PUT,
                path: "/api/link-classifier",
                body: bodyJSON,
                projectScoped: false
            )
            self.classifierStatus = updated
            isSaving = false
            return true
        } catch {
            self.errorMessage = "Failed to save classifier settings: \(error.localizedDescription)"
            isSaving = false
            return false
        }
    }

    func testClassifier(settings: LinkClassifierSettings, model: AppModel) async {
        isTestingClassifier = true
        testResult = nil
        do {
            let bodyJSON = try JSONValue.encoded(settings)
            let res = try await model.decode(
                LinkClassifierTestResponse.self,
                method: .POST,
                path: "/api/link-classifier/test",
                body: bodyJSON,
                projectScoped: false
            )
            if res.success {
                self.testResult = "Connection test succeeded!"
            } else {
                self.testResult = "Test failed: \(res.error ?? "Unknown error")"
            }
        } catch {
            self.testResult = "Test request failed: \(error.localizedDescription)"
        }
        isTestingClassifier = false
    }
}

private struct RankedLinkWrapper {
    let link: SavedLink
    let score: Double?
    let matchedBy: [String]?

    func toRankedLink() -> RankedLink {
        var dict: [String: Any] = [
            "id": link.id,
            "url": link.url,
            "title": link.title as Any,
            "description": link.description as Any,
            "note": link.note as Any,
            "image": link.image as Any,
            "tags": link.tags as Any,
            "createdAt": link.createdAt,
            "updatedAt": link.updatedAt
        ]
        if let score { dict["score"] = score }
        if let matchedBy { dict["matchedBy"] = matchedBy }
        let data = (try? JSONSerialization.data(withJSONObject: dict)) ?? Data()
        return (try? JSONDecoder().decode(RankedLink.self, from: data)) ?? (try! JSONDecoder().decode(RankedLink.self, from: JSONEncoder().encode(link)))
    }
}
