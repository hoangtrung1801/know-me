import Foundation

public struct ServerEvent: Sendable, Equatable {
    public let name: String
    public let data: String
    public let id: String?
    public let sequence: UInt64?
    public var json: JSONValue? { try? JSONDecoder().decode(JSONValue.self, from: Data(data.utf8)) }
    public init(name: String, data: String, id: String? = nil, sequence: UInt64? = nil) { self.name = name; self.data = data; self.id = id; self.sequence = sequence }
}

/// Byte framing preserves blank lines and split UTF-8 sequences across network chunks.
public struct SSEParser: Sendable {
    private var name = ""
    private var data: [String] = []
    private var lastID: String?
    private var isFirstLine = true
    private var lineBytes: [UInt8] = []
    private var previousCR = false
    private var frameBytes = 0
    public init() {}
    public mutating func consume(byte: UInt8) throws -> ServerEvent? {
        if previousCR && byte == 10 { previousCR = false; return nil }
        previousCR = false
        frameBytes += 1
        guard frameBytes <= 2_097_152, lineBytes.count <= 1_048_576 else {
            throw APIError(status: 0, message: "The server event exceeded the native stream size limit.")
        }
        if byte == 10 || byte == 13 {
            previousCR = byte == 13
            let line = String(decoding: lineBytes, as: UTF8.self)
            lineBytes.removeAll(keepingCapacity: true)
            if line.isEmpty { frameBytes = 0 }
            return consume(line: line)
        }
        lineBytes.append(byte)
        return nil
    }
    public mutating func consume(line raw: String) -> ServerEvent? {
        var line = raw
        if isFirstLine { if line.hasPrefix("\u{feff}") { line.removeFirst() }; isFirstLine = false }
        if line.isEmpty {
            defer { name = ""; data.removeAll(keepingCapacity: true) }
            guard !data.isEmpty else { return nil }
            return ServerEvent(name: name.isEmpty ? "message" : name, data: data.joined(separator: "\n"), id: lastID)
        }
        if line.hasPrefix(":") { return nil }
        let fields = line.split(separator: ":", maxSplits: 1, omittingEmptySubsequences: false)
        var value = fields.count == 2 ? String(fields[1]) : ""
        if value.hasPrefix(" ") { value.removeFirst() }
        switch fields[0] {
        case "event": name = value
        case "data": data.append(value)
        case "id": if !value.contains("\0") { lastID = value }
        default: break
        }
        return nil
    }
}
