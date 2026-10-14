import Foundation

public struct WorkspaceProject: Codable, Sendable, Identifiable, Equatable {
    public let id: String
    public var name: String
    public var path: String?
    public var lastUsed: String?
    public init(id: String, name: String, path: String? = nil, lastUsed: String? = nil) {
        self.id = id; self.name = name; self.path = path; self.lastUsed = lastUsed
    }
}
public struct ProjectStatus: Codable, Sendable, Equatable {
    public var active: Bool
    public var projectName: String
    public var projectPath: String
    public var version: String
}
public struct AuthStatus: Codable, Sendable { public let protected: Bool; public let authenticated: Bool }

/// Capture before asynchronous feature work; compare before applying results.
public struct WorkspaceRevision: Sendable, Equatable {
    public private(set) var generation: UInt64 = 0
    public private(set) var projectID: String?
    public init() {}
    public mutating func invalidate(projectID: String?) { generation &+= 1; self.projectID = projectID }
}

public struct WorkspaceRepository: Sendable {
    public let client: APIClient
    public init(client: APIClient) { self.client = client }
    public func list() async throws -> [WorkspaceProject] { try await client.decode(path: "/api/workspaces") }
    public func status() async throws -> ProjectStatus { try await client.decode(path: "/api/status") }
    public func select(_ id: String) async throws {
        _ = try await client.request(method: .POST, path: "/api/workspaces/switch", body: .object(["id": .string(id)]))
    }
    public func create(name: String, path: String?) async throws -> WorkspaceProject {
        var body: [String: JSONValue] = ["name": .string(name)]
        if let path { body["path"] = .string(path) }
        return try await client.decode(method: .POST, path: "/api/workspaces", body: .object(body))
    }
}
