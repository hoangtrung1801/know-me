import Foundation
import Testing
@testable import KnowMeCore

@Test(.timeLimit(.minutes(1)), .enabled(if: ProcessInfo.processInfo.environment["KNOWME_TEST_URL"] != nil))
func productionRouteAuthenticationReadsEventsAndWebSocket() async throws {
    let url = try APIClient.validateBaseURL(ProcessInfo.processInfo.environment["KNOWME_TEST_URL"]!)
    let client = APIClient(baseURL: url)
    let auth: AuthStatus = try await client.decode(path: "/api/auth/status")
    #expect(auth.protected && !auth.authenticated)
    do { _ = try await client.request(path: "/api/workspaces"); Issue.record("Protected route allowed without login") }
    catch let error as APIError { #expect(error.status == 401) }
    _ = try await client.request(method: .POST, path: "/api/auth/login", body: .object(["password": .string("fixture-password")]))
    let repository = WorkspaceRepository(client: client)
    #expect(try await repository.status().version == "fixture-current-source")
    let projects = try await repository.list()
    #expect(projects.count == 1)
    #expect(projects.first?.name == "Native Fixture")
    #expect(try await client.request(path: "/api/tasks") == .array([]))
    #expect(try await client.request(path: "/api/docs")["docs"] == .array([]))
    // Guard the fixture boundary: global handlers and arbitrary writes must not
    // accidentally reach personal storage while checking production routes.
    for (method, path) in [(HTTPMethod.GET, "/api/links"), (.POST, "/api/tasks")] {
        do { _ = try await client.request(method: method, path: path); Issue.record("Unsafe fixture route was enabled") }
        catch let error as APIError { #expect(error.status == 403) }
    }
    // Production task mutations stay inside the fixture's temporary project.
    let projectID = try #require(projects.first?.id)
    let scope = ["projectId": projectID]
    var ids: [String] = []
    for title in ["First card", "Hidden card", "Moving card"] {
        let created = try await client.request(method: .POST, path: "/api/tasks", query: scope,
            body: .object(["title": .string(title), "projectId": .string(projectID), "status": .string("todo"), "global": .bool(false)]))
        let id = created["id"].stringValue
        #expect(!id.isEmpty)
        ids.append(id.hasPrefix(projectID + ":") ? id : projectID + ":" + id)
    }
    _ = try await client.request(method: .PUT, path: "/api/tasks/" + APIClient.segment(ids[2]), query: scope,
        body: .object(["status": .string("in-review")]))
    let order = [ids[1], ids[0], ids[2]]
    let reordered = try await client.request(method: .POST, path: "/api/tasks/reorder", query: scope,
        body: .object(["orders": .array(order.enumerated().map { .object(["id": .string($0.element), "order": .number(Double($0.offset))]) })]))
    #expect(reordered["success"].boolValue)
    #expect(reordered["updated"].numberValue == 3)
    let cards = try await client.request(path: "/api/tasks", query: scope).arrayValue
    #expect(cards.count == 3)
    #expect(cards.first { $0["title"].stringValue == "Moving card" }?["status"] == .string("in-review"))
    #expect(cards.first { $0["title"].stringValue == "Hidden card" }?["order"] == .number(0))
    #expect(cards.first { $0["title"].stringValue == "First card" }?["order"] == .number(1))
    let stream = await client.events()
    for try await event in stream { #expect(event.name == "connected"); break }
    let socket = try await client.webSocket(path: "/ws/chat", query: ["chatId": "fixture"])
    defer { socket.cancel(with: .normalClosure, reason: nil) }
    let message = try await socket.receive()
    if case .string(let data) = message { #expect(data.contains("fixture-ready")) }
    else { Issue.record("Expected fixture-ready WebSocket event") }
}
