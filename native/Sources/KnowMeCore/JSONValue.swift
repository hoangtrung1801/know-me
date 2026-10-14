import Foundation

/// For extensible agent payloads/configuration. Prefer typed DTOs for domain records.
public enum JSONValue: Codable, Sendable, Equatable {
    case object([String: JSONValue]), array([JSONValue]), string(String), number(Double), bool(Bool), null

    public init(from decoder: Decoder) throws {
        let c = try decoder.singleValueContainer()
        if c.decodeNil() { self = .null }
        else if let v = try? c.decode(Bool.self) { self = .bool(v) }
        else if let v = try? c.decode(Double.self) { self = .number(v) }
        else if let v = try? c.decode(String.self) { self = .string(v) }
        else if let v = try? c.decode([String: JSONValue].self) { self = .object(v) }
        else { self = .array(try c.decode([JSONValue].self)) }
    }
    public func encode(to encoder: Encoder) throws {
        var c = encoder.singleValueContainer()
        switch self {
        case .object(let v): try c.encode(v)
        case .array(let v): try c.encode(v)
        case .string(let v): try c.encode(v)
        case .number(let v): try c.encode(v)
        case .bool(let v): try c.encode(v)
        case .null: try c.encodeNil()
        }
    }
    public subscript(_ key: String) -> JSONValue { objectValue?[key] ?? .null }
    public var objectValue: [String: JSONValue]? { if case .object(let v) = self { v } else { nil } }
    public var arrayValue: [JSONValue] { if case .array(let v) = self { v } else { [] } }
    public var stringValue: String { if case .string(let v) = self { v } else { "" } }
    public var boolValue: Bool { if case .bool(let v) = self { v } else { false } }
    public var numberValue: Double { if case .number(let v) = self { v } else { 0 } }
    public func decoded<T: Decodable>(_ type: T.Type = T.self) throws -> T {
        try JSONDecoder().decode(type, from: JSONEncoder().encode(self))
    }
    public static func encoded<T: Encodable>(_ value: T) throws -> JSONValue {
        try JSONDecoder().decode(Self.self, from: JSONEncoder().encode(value))
    }
}
