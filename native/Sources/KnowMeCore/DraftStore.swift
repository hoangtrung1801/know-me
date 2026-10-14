import Foundation

/// Recovery text only, never canonical domain storage or provider credentials.
@MainActor public final class DraftStore {
    private let preferences: UserDefaults
    public init(preferences: UserDefaults = .standard) { self.preferences = preferences }
    private func key(namespace: String, projectID: String?, entityID: String) -> String {
        // Length-delimited components cannot collide when names contain colons or separators.
        let components = [namespace, projectID.map { "project:\($0)" } ?? "global", entityID]
        return "KnowMe.draft." + components.map { "\($0.utf8.count):\($0)" }.joined()
    }
    public func load(namespace: String, projectID: String?, entityID: String) -> String? {
        preferences.string(forKey: key(namespace: namespace, projectID: projectID, entityID: entityID))
    }
    public func save(_ text: String, namespace: String, projectID: String?, entityID: String) {
        preferences.set(text, forKey: key(namespace: namespace, projectID: projectID, entityID: entityID))
    }
    public func remove(namespace: String, projectID: String?, entityID: String) {
        preferences.removeObject(forKey: key(namespace: namespace, projectID: projectID, entityID: entityID))
    }
}
