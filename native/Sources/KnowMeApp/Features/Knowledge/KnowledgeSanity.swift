import Foundation
import KnowMeCore

/// In-module verification tests for Knowledge domain DTOs, parsers, and invariants.
/// Can be invoked during smoke tests or self-tests without external testing frameworks.
enum KnowledgeSanity {
    static func runAllChecks() -> [String: Bool] {
        var results: [String: Bool] = [:]
        results["testDocResponseDecoding"] = testDocResponseDecoding()
        results["testDocHistoryDecoding"] = testDocHistoryDecoding()
        results["testDocDiffDecoding"] = testDocDiffDecoding()
        results["testSavedLinkDecoding"] = testSavedLinkDecoding()
        results["testRankedLinkDecoding"] = testRankedLinkDecoding()
        results["testMemoDecodingAndTags"] = testMemoDecodingAndTags()
        results["testMarkdownHeadingAndRefExtraction"] = testMarkdownHeadingAndRefExtraction()
        results["testMarkdownBlockParsing"] = testMarkdownBlockParsing()
        results["testDateGroupFormatting"] = testDateGroupFormatting()
        return results
    }

    static func testDocResponseDecoding() -> Bool {
        let json = """
        {
            "filename": "guide.md",
            "path": "docs/guide",
            "projectId": "p123",
            "folder": "docs",
            "metadata": {
                "title": "User Guide",
                "description": "How to use",
                "createdAt": "2026-10-14T10:00:00Z",
                "updatedAt": "2026-10-14T11:00:00Z",
                "tags": ["guide", "manual"],
                "order": 1
            },
            "content": "# User Guide\\n\\nWelcome to the guide.",
            "isImported": false,
            "source": ""
        }
        """
        guard let data = json.data(using: .utf8),
              let doc = try? JSONDecoder().decode(DocItem.self, from: data) else {
            return false
        }
        return doc.title == "User Guide" &&
               doc.folder == "docs" &&
               doc.metadata.tags == ["guide", "manual"] &&
               doc.content.contains("Welcome")
    }

    static func testDocHistoryDecoding() -> Bool {
        let json = """
        {
            "docId": "doc-1",
            "docPath": "docs/guide",
            "currentPath": "docs/guide",
            "currentVersion": 2,
            "versions": [
                {
                    "id": "v1",
                    "docPath": "docs/guide",
                    "version": 1,
                    "timestamp": "2026-10-14T10:00:00Z",
                    "author": "alice",
                    "changes": [
                        { "field": "content", "oldValue": null, "newValue": "Initial" }
                    ]
                }
            ]
        }
        """
        guard let data = json.data(using: .utf8),
              let history = try? JSONDecoder().decode(DocVersionHistory.self, from: data) else {
            return false
        }
        return history.currentVersion == 2 &&
               history.versions.count == 1 &&
               history.versions[0].author == "alice"
    }

    static func testDocDiffDecoding() -> Bool {
        let json = """
        {
            "docId": "doc-1",
            "docPath": "docs/guide",
            "revisionId": "v2",
            "version": {
                "id": "v2",
                "docPath": "docs/guide",
                "version": 2,
                "timestamp": "2026-10-14T11:00:00Z"
            },
            "checkpoint": true,
            "changes": [
                { "field": "content", "oldValue": "Initial", "newValue": "Updated" }
            ],
            "changedScopes": [
                { "type": "section", "section": "intro", "oldBytes": 7, "newBytes": 7, "deltaBytes": 0 }
            ]
        }
        """
        guard let data = json.data(using: .utf8),
              let diff = try? JSONDecoder().decode(DocRevisionDiff.self, from: data) else {
            return false
        }
        return diff.revisionId == "v2" &&
               diff.checkpoint == true &&
               diff.changes.count == 1 &&
               diff.changedScopes?.count == 1
    }

    static func testSavedLinkDecoding() -> Bool {
        let json = """
        {
            "id": "link-99",
            "url": "https://developer.apple.com/swift",
            "title": "Swift Programming",
            "description": "Apple Swift documentation",
            "note": "Read before Swift 6 migration",
            "image": "swift.png",
            "tags": ["swift", "apple"],
            "createdAt": "2026-10-14T09:00:00Z",
            "updatedAt": "2026-10-14T09:30:00Z"
        }
        """
        guard let data = json.data(using: .utf8),
              let link = try? JSONDecoder().decode(SavedLink.self, from: data) else {
            return false
        }
        return link.id == "link-99" &&
               link.displayTitle == "Swift Programming" &&
               link.tags == ["swift", "apple"]
    }

    static func testRankedLinkDecoding() -> Bool {
        let json = """
        {
            "id": "link-99",
            "url": "https://developer.apple.com/swift",
            "title": "Swift Programming",
            "description": "Apple Swift documentation",
            "createdAt": "2026-10-14T09:00:00Z",
            "updatedAt": "2026-10-14T09:30:00Z",
            "score": 0.94,
            "matchedBy": ["title", "semantic"]
        }
        """
        guard let data = json.data(using: .utf8),
              let ranked = try? JSONDecoder().decode(RankedLink.self, from: data) else {
            return false
        }
        return ranked.id == "link-99" &&
               ranked.score == 0.94 &&
               ranked.matchedBy == ["title", "semantic"]
    }

    static func testMemoDecodingAndTags() -> Bool {
        let json = """
        {
            "id": "memo-1",
            "content": "Check out the new #swift6 and #macos architecture notes!",
            "createdAt": "2026-10-14T10:00:00Z",
            "updatedAt": "2026-10-14T10:00:00Z"
        }
        """
        guard let data = json.data(using: .utf8),
              let memo = try? JSONDecoder().decode(MemoItem.self, from: data) else {
            return false
        }
        let tags = memo.tags
        return memo.id == "memo-1" &&
               tags.contains("swift6") &&
               tags.contains("macos")
    }

    static func testMarkdownHeadingAndRefExtraction() -> Bool {
        let md = """
        # Architecture Guide
        ## Subsystem Layout
        Refer to [[specs/database]] and mention @task-xyz or visit [Docs](https://example.com/docs).
        """
        let headings = MarkdownParser.extractHeadings(from: md)
        let refs = MarkdownParser.extractReferences(from: md)

        let h1Ok = headings.count == 2 && headings[0].title == "Architecture Guide" && headings[1].level == 2
        let docRefOk = refs.contains { $0.type == .docWikiLink && $0.target == "specs/database" }
        let taskRefOk = refs.contains { $0.type == .taskMention && $0.target == "xyz" }
        let urlRefOk = refs.contains { $0.type == .externalURL && $0.target == "https://example.com/docs" }

        return h1Ok && docRefOk && taskRefOk && urlRefOk
    }

    static func testMarkdownBlockParsing() -> Bool {
        let md = """
        # Heading 1

        Paragraph with text.

        > A blockquote

        ```mermaid
        graph TD
            A --> B
        ```

        ```swift
        let x = 42
        ```

        - [ ] Pending task
        - [x] Completed task

        - Bullet item
        """
        let blocks = MarkdownParser.parseBlocks(from: md)
        var hasMermaid = false
        var hasTask = false
        var hasCode = false

        for b in blocks {
            switch b {
            case .mermaidBlock: hasMermaid = true
            case .taskItem: hasTask = true
            case .codeBlock: hasCode = true
            default: break
            }
        }

        return blocks.count >= 6 && hasMermaid && hasTask && hasCode
    }

    static func testDateGroupFormatting() -> Bool {
        let now = ISO8601DateFormatter().string(from: Date())
        let label = MemoStore.formatDateLabel(now)
        return label == "Today"
    }
}
