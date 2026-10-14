import Foundation
import Testing
import os
@testable import KnowMeCore

private final class StubProtocol: URLProtocol, @unchecked Sendable {
    struct Response: Sendable { let status: Int; let body: String }
    static let responses = OSAllocatedUnfairLock(initialState: [String: Response]())
    override class func canInit(with request: URLRequest) -> Bool { request.url?.host?.hasSuffix(".test") == true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        let result = Self.responses.withLock { $0[request.url!.host!]! }
        let response = HTTPURLResponse(url: request.url!, statusCode: result.status, httpVersion: "HTTP/1.1", headerFields: ["Content-Type": "application/json"])!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: Data(result.body.utf8))
        client?.urlProtocolDidFinishLoading(self)
    }
    override func stopLoading() {}
}

private func stubClient(status: Int = 200, body: String) -> APIClient {
    let host = UUID().uuidString.lowercased() + ".test"
    StubProtocol.responses.withLock { $0[host] = .init(status: status, body: body) }
    let config = URLSessionConfiguration.ephemeral
    config.protocolClasses = [StubProtocol.self]
    return APIClient(baseURL: URL(string: "https://" + host)!, session: URLSession(configuration: config))
}

@Test func requestPreservesEncodedIdentifiersAndQuery() async throws {
    let client = stubClient(body: "{}")
    let request = try await client.makeRequest(method: .PUT, path: "/api/tasks/" + APIClient.segment("proj:task/一"), query: ["projectId": "a b&c"], body: .object(["title": .string("New title")]))
    #expect(request.httpMethod == "PUT")
    #expect(request.url!.absoluteString.contains("proj%3Atask%2F%E4%B8%80"))
    #expect(URLComponents(url: request.url!, resolvingAgainstBaseURL: false)?.queryItems?.first?.value == "a b&c")
    #expect(try JSONDecoder().decode(JSONValue.self, from: request.httpBody!)["title"] == .string("New title"))
    #expect(APIClient.documentPath("plans/hello world.md") == "plans/hello%20world.md")
}

@Test func originValidationRejectsUnsafeOrAmbiguousOrigins() throws {
    for value in ["http://example.org", "https://user:password@example.org", "file:///tmp/a", "http://localhost/api", "http://localhost?token=secret"] {
        #expect(throws: APIError.self) { try APIClient.validateBaseURL(value) }
    }
    #expect(try APIClient.validateBaseURL(" http://127.0.0.1:6420 ").port == 6420)
    #expect(try APIClient.validateBaseURL("https://example.org").host == "example.org")
}

@Test func requestRejectsAuthorityAndMalformedPercentPaths() async throws {
    let client = stubClient(body: "{}")
    for path in ["//other.test/api", "/api/%ZZ", "/api/tasks?q=other"] {
        do { _ = try await client.makeRequest(path: path); Issue.record("Accepted invalid path") }
        catch { #expect(error is APIError) }
    }
}

@Test func preservesLifecycleDenialPayload() async throws {
    let client = stubClient(status: 409, body: #"{"items":[{"reasons":[{"message":"Task has an active timer"}]}]}"#)
    do { _ = try await client.request(method: .POST, path: "/api/tasks/id/archive"); Issue.record("Expected denial") }
    catch let error as APIError {
        #expect(error.status == 409)
        #expect(error.message == "Task has an active timer")
        #expect(error.payload?["items"].arrayValue.count == 1)
    }
}

@Test func handlesEmptySuccessAndNonJSONFailure() async throws {
    let empty = stubClient(status: 204, body: "")
    #expect(try await empty.request(method: .DELETE, path: "/api/memos/id") == .null)
    let bad = stubClient(status: 502, body: "<html>Bad gateway</html>")
    do { _ = try await bad.request(path: "/api/status"); Issue.record("Expected HTTP error") }
    catch let error as APIError { #expect(error.status == 502); #expect(error.message.contains("502")) }
    let invalid = stubClient(body: "<html>Not JSON</html>")
    do { _ = try await invalid.request(path: "/api/status"); Issue.record("Expected decoding error") }
    catch let error as APIError { #expect(error.message.contains("invalid JSON")) }
}

@Test func decodesRealWorkspaceAndInactiveStatusShapes() async throws {
    let client = stubClient(body: #"[{"id":"abc","name":"Workspace","lastUsed":"2026-10-14T08:00:00Z"}]"#)
    let projects = try await WorkspaceRepository(client: client).list()
    #expect(projects.first?.id == "abc")
    #expect(projects.first?.path == nil)
    let inactive = stubClient(body: #"{"active":false,"projectName":"","projectPath":"","version":"1.12.4"}"#)
    #expect(try await WorkspaceRepository(client: inactive).status().active == false)
}

@Test func parsesNamedMultilineSSEWithBOMAndPersistentID() {
    var parser = SSEParser()
    for line in ["\u{feff}: heartbeat", "id: 123", "event: tasks:updated", "data: first", "data: second"] { #expect(parser.consume(line: line) == nil) }
    #expect(parser.consume(line: "") == ServerEvent(name: "tasks:updated", data: "first\nsecond", id: "123"))
    #expect(parser.consume(line: "data: next") == nil)
    #expect(parser.consume(line: "") == ServerEvent(name: "message", data: "next", id: "123"))
    #expect(parser.consume(line: "") == nil)
}

@Test func SSEIgnoresUnknownFieldsAndDoesNotDispatchIncompleteEvents() {
    var parser = SSEParser()
    #expect(parser.consume(line: "retry: 5000") == nil)
    #expect(parser.consume(line: "id: invalid\0id") == nil)
    #expect(parser.consume(line: "event: ping") == nil)
    #expect(parser.consume(line: "") == nil)
    #expect(parser.consume(line: "data:") == nil)
    #expect(parser.consume(line: "") == ServerEvent(name: "message", data: ""))
    #expect(parser.consume(line: "data: incomplete") == nil)
}

@Test func SSEByteFramingPreservesBlankLinesCRLFAndUnicode() throws {
    var parser = SSEParser()
    var events: [ServerEvent] = []
    for byte in Data("event: connected\r\ndata: Xin chào\r\n\r\nevent: next\ndata: 2\n\n".utf8) {
        if let event = try parser.consume(byte: byte) { events.append(event) }
    }
    #expect(events == [ServerEvent(name: "connected", data: "Xin chào"), ServerEvent(name: "next", data: "2")])
}

@Test func workspaceGenerationRejectsPreviouslyCapturedResponses() {
    var workspace = WorkspaceRevision()
    workspace.invalidate(projectID: "first")
    let old = workspace
    workspace.invalidate(projectID: "second")
    #expect(old != workspace)
    workspace.invalidate(projectID: "first")
    #expect(old != workspace) // Switching back cannot revive an earlier response.
}

@Test func multipartRejectsHeaderInjection() async throws {
    let client = stubClient(body: "{}")
    do {
        _ = try await client.upload(path: "/api/assets", parts: [.init(name: "file", filename: "bad\r\nname", data: Data())])
        Issue.record("Expected invalid upload metadata")
    } catch let error as APIError { #expect(error.status == 0) }
    #expect(try await client.upload(path: "/api/assets", parts: [.init(name: "file", filename: "hello.txt", mimeType: "text/plain", data: Data("hello".utf8))]) == .object([:]))
}

@Test func JSONValueRoundTripsExtensiblePayloads() throws {
    let payload: JSONValue = .object(["tool": .string("read"), "ok": .bool(true), "count": .number(2), "parts": .array([.null])])
    #expect(try JSONDecoder().decode(JSONValue.self, from: JSONEncoder().encode(payload)) == payload)
}

@Test @MainActor func draftRecoverySeparatesProjectsAndGlobalContent() {
    let name = "KnowMeNativeTests-\(UUID().uuidString)"
    let preferences = UserDefaults(suiteName: name)!
    defer { preferences.removePersistentDomain(forName: name) }
    let drafts = DraftStore(preferences: preferences)
    drafts.save("Project draft", namespace: "docs", projectID: "a", entityID: "notes")
    drafts.save("Global draft", namespace: "docs", projectID: nil, entityID: "notes")
    #expect(drafts.load(namespace: "docs", projectID: "b", entityID: "notes") == nil)
    #expect(drafts.load(namespace: "docs", projectID: nil, entityID: "notes") == "Global draft")
    drafts.remove(namespace: "docs", projectID: "a", entityID: "notes")
    #expect(drafts.load(namespace: "docs", projectID: "a", entityID: "notes") == nil)
    #expect(drafts.load(namespace: "docs", projectID: nil, entityID: "notes") != nil)
}
