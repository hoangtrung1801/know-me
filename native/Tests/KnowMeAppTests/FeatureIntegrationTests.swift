import Foundation
import Testing
import KnowMeCore
@testable import KnowMeApp

@Test @MainActor func workContractVerification() {
    WorkFeatureVerification.runVerification()
}

@Test @MainActor func knowledgeContractVerification() {
    for (name, passed) in KnowledgeSanity.runAllChecks() { #expect(passed, Comment(rawValue: name)) }
}

@Test func formPatchesPreserveUnknownNestedConfiguration() throws {
    let original: JSONValue = .object([
        "defaultPriority": .string("medium"),
        "semanticSearch": .object(["enabled": .bool(true), "model": .string("old"), "huggingFaceId": .string("keep-me")]),
        "capabilities": .object(["taskHardDelete": .bool(true)]),
        "futureSetting": .string("retain")
    ])
    let before = try original.decoded(ProjectConfig.self)
    var after = before
    after.semanticSearch?.model = "new"
    let patch = EditableConfiguration.patch(original: original, baseline: try .encoded(before), edited: try .encoded(after))
    #expect(patch["semanticSearch"]["model"] == .string("new"))
    #expect(patch["semanticSearch"]["huggingFaceId"] == .string("keep-me"))
    #expect(patch["defaultPriority"] == .null)
    #expect(patch["capabilities"] == .null)
    #expect(EditableConfiguration.editable(original)["futureSetting"] == .string("retain"))
}

@Test func configurationDraftsDetectCredentials() {
    #expect(EditableConfiguration.containsCredentials(.object(["opencodeServer": .object(["password": .string("private")])])))
    #expect(!EditableConfiguration.containsCredentials(.object(["defaultPriority": .string("high")])))
    #expect(EditableConfiguration.editable(.object(["id": .string("read-only"), "name": .string("Editable")])) == .object(["name": .string("Editable")]))
}

@Test @MainActor func documentIdentityAndDraftsAreProjectScoped() {
    let first = DocItem(path: "guide", projectId: "one", content: "Original")
    let second = DocItem(path: "guide", projectId: "two", content: "Original")
    #expect(first.id != second.id)
    let name = "KnowMeFeatureTests-\(UUID().uuidString)"
    let defaults = UserDefaults(suiteName: name)!
    defer { defaults.removePersistentDomain(forName: name) }
    let model = AppModel(preferences: defaults)
    let store = DocumentStore()
    #expect(store.scopeQuery(for: first) == ["projectId": "one"])
    store.editedContent = "" // An intentional deletion is a recoverable draft.
    store.saveDraft(for: first, model: model)
    #expect(model.drafts.load(namespace: "docs", projectID: "one", entityID: "guide") != nil)
    #expect(model.drafts.load(namespace: "docs", projectID: "two", entityID: "guide") == nil)
    store.checkRecoverableDraft(for: first, model: model)
    store.editedContent = "Original"
    store.restoreDraft()
    #expect(store.editedContent == "")
}

@Test @MainActor func chatEventHistoryIsNotReplayedOnEachNewEvent() throws {
    let model = AppModel()
    let store = AgentStore(model: model)
    var old = AgentFixtures.sampleSession
    store.activeSessionId = old.id
    store.activeSession = old
    let payload = JSONValue.object(["session": try .encoded(old)])
    model.recordServerEvent(ServerEvent(name: "chats:updated", data: String(decoding: try JSONEncoder().encode(payload), as: UTF8.self)))
    store.checkServerEvents()
    old.title = "Newer authoritative snapshot"
    store.activeSession = old
    model.recordServerEvent(ServerEvent(name: "unrelated", data: "{}"))
    store.checkServerEvents()
    #expect(store.activeSession?.title == "Newer authoritative snapshot")
}

@Test func headingTargetsMatchRenderedBlocksAndExcludeCode() {
    let markdown = """
    # Repeated

    ```markdown
    # Not a heading
    ```

    ## Repeated

    ~~~~text
    ## Also code
    ~~~~

    #not-a-heading
    ####### Invalid
    Final paragraph
    """
    let blocks = MarkdownParser.parseBlocks(from: markdown)
    let headings = MarkdownParser.extractHeadings(from: markdown)
    #expect(headings.count == 2)
    #expect(Set(headings.map(\.id)).count == 2)
    for heading in headings {
        let index = Int(heading.id.replacingOccurrences(of: "markdown-block-", with: ""))!
        guard case .heading(_, let title) = blocks[index] else { Issue.record("Target does not refer to a heading"); continue }
        #expect(title == heading.title)
    }
    #expect(blocks.contains { if case .paragraph(let text) = $0 { return text.contains("#not-a-heading") && text.contains("Final paragraph") }; return false })
}

@Test func semanticReferencesRespectSyntaxCodeAndUnicode() {
    let markdown = """
    Tiếng Việt 👋 @task/abc123. @task-abc123{blocks} @task/abc123.2
    [[guide|Guide]] @docs/guide.md{references} @doc/guide.md#install
    .know-me/docs/setup.md and .known-me/docs/legacy.md
    `@task/inline` [@task/linked](https://example.com) ![Image](https://example.com/image.png)
    ```text
    @task/fenced @doc/hidden
    ```
    ~~~
    @task/tilde
    ~~~
    Contact name@example.com and @someone.
    """
    let refs = MarkdownParser.extractReferences(from: markdown)
    #expect(refs.filter { $0.type == .taskMention }.map(\.target) == ["abc123", "abc123.2"])
    #expect(refs.filter { $0.type == .docWikiLink }.map(\.target) == ["guide", "guide#install", "setup", "legacy"])
    #expect(refs.filter { $0.type == .externalURL }.map(\.target) == ["https://example.com"])
    #expect(!refs.contains { ["inline", "fenced", "tilde", "hidden", "someone", "task"].contains($0.target) })
}

@Test func nativeReferenceLinksPreserveTargetsAndExistingMarkdown() throws {
    let ref = MarkdownReferenceItem(type: .docWikiLink, title: "Guide", target: "hướng dẫn#install & setup")
    let url = try #require(MarkdownReferences.url(for: ref))
    #expect(MarkdownReferences.reference(from: url)?.target == ref.target)
    #expect(MarkdownReferences.reference(from: URL(string: "https://example.com")!) == nil)
    let text = MarkdownReferences.attributed("**Bold** @task/abc123 and `@task/hidden` [web](https://example.com)")
    let links = text.runs.compactMap { $0.link }
    #expect(links.count == 2)
    #expect(links.contains { MarkdownReferences.reference(from: $0)?.target == "abc123" })
    #expect(links.contains { $0.absoluteString == "https://example.com" })
}

@Test func taskFiltersComposeAndSearchIdentifiersAndAssignees() {
    let tasks = [
        TaskItem(id: "abc123", projectId: "one", title: "Login", status: "in-review", priority: "high", assignee: "Alice", labels: ["security"], spec: "specs/auth"),
        TaskItem(id: "abc124", projectId: "two", title: "Login", status: "todo", priority: "low", labels: ["security"]),
        TaskItem(id: "global1", title: "Global", status: "todo", priority: "high"),
        TaskItem(id: "old1", title: "Archived", archived: true)
    ]
    var query = TaskQuery()
    query.status = "in-review"; query.priority = "high"; query.assignee = "Alice"; query.label = "security"; query.spec = "specs/auth"; query.project = "one"
    #expect(query.apply(to: tasks).map(\.id) == ["abc123"])
    query.search = " ALICE "
    #expect(query.apply(to: tasks).map(\.id) == ["abc123"])
    query.search = "abc123"
    #expect(query.apply(to: tasks).map(\.id) == ["abc123"])
    query.label = "unknown"
    #expect(query.apply(to: tasks).isEmpty)
    query = TaskQuery(project: "global", assignee: "unassigned", spec: "none")
    #expect(query.apply(to: tasks).map(\.id) == ["global1"])
    query = TaskQuery(lifecycle: .archived)
    #expect(query.apply(to: tasks).map(\.id) == ["old1"])
}

@Test func taskSortingAndGroupingStayStableDuringRefresh() {
    let tasks = [
        TaskItem(id: "task10", title: "Same", status: "custom", priority: "low", order: 1),
        TaskItem(id: "task2", title: "Same", status: "todo", priority: "high", assignee: "Alice", order: 1),
        TaskItem(id: "task3", title: "Same", status: "in-review", priority: "medium", order: 0)
    ]
    #expect(TaskQuery().apply(to: tasks).map(\.id) == ["task3", "task2", "task10"])
    #expect(TaskQuery(sort: .title).apply(to: tasks.reversed()).map(\.id) == ["task2", "task3", "task10"])
    #expect(TaskQuery(sort: .priority).apply(to: tasks).map(\.id) == ["task2", "task3", "task10"])
    let groups = TaskQuery.groups(tasks, by: .status, statuses: ["in-review", "todo"])
    #expect(groups.map(\.id) == ["in-review", "todo", "custom"])
    #expect(groups.flatMap(\.tasks).count == tasks.count)
    let unassigned = TaskQuery.groups(tasks, by: .assignee, statuses: []).first { $0.title == "Unassigned" }
    #expect(unassigned?.tasks.count == 2)
}

@Test @MainActor func failedChatSubmissionRetainsDraftAndAllowsRetry() async {
    let name = "KnowMeChatFailureTests-\(UUID().uuidString)"
    let defaults = UserDefaults(suiteName: name)!
    defer { defaults.removePersistentDomain(forName: name) }
    let model = AppModel(preferences: defaults)
    let store = AgentStore(model: model)
    let session = AgentFixtures.sampleSession
    store.activeSessionId = session.id
    store.activeSession = session
    let sent = await store.sendMessage(content: "Keep my unsent message")
    #expect(!sent) // Disconnected client exercises the real error path without invoking an agent.
    #expect(store.loadDraft(sessionId: session.id) == "Keep my unsent message")
    #expect(!store.isSending)
    #expect(store.errorMessage != nil)
    await store.selectSession(id: nil)
    #expect(store.activeSession == nil)
    #expect(store.queueStatus == nil)
}

@Test func boardOrderingKeepsHiddenCardsAndProjectScope() throws {
    let tasks = [
        TaskItem(id: "one", projectId: "p1", title: "First", order: 0),
        TaskItem(id: "hidden", projectId: "p1", title: "Hidden by a filter", order: 1),
        TaskItem(id: "one", projectId: "p2", title: "Another project", status: "in-review", order: 0),
        TaskItem(id: "last", projectId: "p1", title: "Last", order: 2),
        TaskItem(id: "archived", title: "Archived", archived: true)
    ]
    let orders = try #require(TaskOrdering.orders(in: tasks, moving: "p1:last", to: "todo", before: "p1:hidden"))
    #expect(orders.map(\.id) == ["p1:one", "p1:last", "p1:hidden"])
    #expect(orders.map(\.order) == [0, 1, 2])
    let across = try #require(TaskOrdering.orders(in: tasks, moving: "p1:last", to: "in-review", before: nil))
    #expect(across.map(\.id) == ["p2:one", "p1:last"])
    #expect(TaskOrdering.orders(in: tasks, moving: "archived", to: "todo", before: nil) == nil)
    #expect(TaskOrdering.orders(in: tasks, moving: "p1:last", to: "todo", before: "unknown") == nil)
    #expect(TaskOrdering.orders(in: tasks, moving: "p1:last", to: "todo", before: "p1:last") == nil)
}
