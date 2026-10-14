import Foundation
import KnowMeCore

enum EditableConfiguration {
    static func editable(_ response: JSONValue) -> JSONValue {
        var fields = (response["config"].objectValue ?? response.objectValue) ?? [:]
        for key in ["id", "createdAt", "capabilities", "localONNX", "opencodeInstalled"] { fields.removeValue(forKey: key) }
        return .object(fields)
    }

    /// Send only changed top-level fields, retaining unknown nested server settings.
    static func patch(original: JSONValue, baseline: JSONValue, edited: JSONValue) -> JSONValue {
        let before = baseline.objectValue ?? [:]
        let after = edited.objectValue ?? [:]
        var changes: [String: JSONValue] = [:]
        for key in Set(before.keys).union(after.keys) where before[key] != after[key] {
            changes[key] = merge(original: original[key], baseline: before[key] ?? .null, edited: after[key] ?? .null)
        }
        return editable(.object(changes))
    }

    private static func merge(original: JSONValue, baseline: JSONValue, edited: JSONValue) -> JSONValue {
        guard let before = baseline.objectValue, let after = edited.objectValue else { return edited }
        var result = original.objectValue ?? [:]
        for key in Set(before.keys).union(after.keys) where before[key] != after[key] {
            result[key] = merge(original: original[key], baseline: before[key] ?? .null, edited: after[key] ?? .null)
        }
        return .object(result)
    }

    static func containsCredentials(_ value: JSONValue) -> Bool {
        if let object = value.objectValue {
            return object.contains { key, child in
                let secretKeys = ["password", "apikey", "api_key", "token", "secret", "access_token", "refresh_token"]
                return (secretKeys.contains(key.lowercased()) && child != .null && child != .string("")) || containsCredentials(child)
            }
        }
        return value.arrayValue.contains(where: containsCredentials)
    }

    static func text(_ value: JSONValue) -> String {
        let encoder = JSONEncoder(); encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        return (try? encoder.encode(value)).flatMap { String(data: $0, encoding: .utf8) } ?? "{}"
    }
}
