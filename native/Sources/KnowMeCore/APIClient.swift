import Foundation

public enum HTTPMethod: String, Sendable { case GET, POST, PUT, PATCH, DELETE }

public struct APIError: Error, LocalizedError, Sendable {
    public let status: Int
    public let message: String
    public let payload: JSONValue?
    public var errorDescription: String? { message }
    public init(status: Int, message: String, payload: JSONValue? = nil) {
        self.status = status; self.message = message; self.payload = payload
    }
}

public struct UploadPart: Sendable {
    public let name: String
    public let filename: String?
    public let mimeType: String
    public let data: Data
    public init(name: String, filename: String? = nil, mimeType: String = "application/octet-stream", data: Data) {
        self.name = name; self.filename = filename; self.mimeType = mimeType; self.data = data
    }
}

/// One cookie jar and URLSession for REST, SSE and WebSocket connections.
public actor APIClient {
    public nonisolated let baseURL: URL
    private let session: URLSession

    public init(baseURL: URL, session: URLSession? = nil) {
        self.baseURL = baseURL
        if let session { self.session = session }
        else {
            let config = URLSessionConfiguration.ephemeral
            config.httpShouldSetCookies = true
            config.httpCookieAcceptPolicy = .always
            config.timeoutIntervalForRequest = 30
            self.session = URLSession(configuration: config)
        }
    }

    public static func validateBaseURL(_ text: String) throws -> URL {
        guard let u = URL(string: text.trimmingCharacters(in: .whitespacesAndNewlines)),
              let host = u.host, ["http", "https"].contains(u.scheme),
              u.user == nil, u.password == nil, u.query == nil, u.fragment == nil,
              u.path.isEmpty || u.path == "/",
              u.scheme == "https" || ["localhost", "127.0.0.1", "::1"].contains(host)
        else { throw APIError(status: 0, message: "Enter a local HTTP address or an HTTPS server origin, without a path or credentials.") }
        return u
    }

    /// Encode exactly one identifier. Use documentPath for slash-separated document names.
    public nonisolated static func segment(_ value: String) -> String {
        value.addingPercentEncoding(withAllowedCharacters: CharacterSet(charactersIn: "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-._~")) ?? ""
    }
    public nonisolated static func documentPath(_ value: String) -> String {
        value.split(separator: "/", omittingEmptySubsequences: false).map { segment(String($0)) }.joined(separator: "/")
    }

    public func makeRequest(method: HTTPMethod = .GET, path: String, query: [String: String] = [:], body: JSONValue? = nil) throws -> URLRequest {
        guard path.hasPrefix("/"), !path.hasPrefix("//"), !path.contains("?"), !path.contains("#"),
              var components = URLComponents(url: baseURL, resolvingAgainstBaseURL: false)
        else { throw APIError(status: 0, message: "Invalid API path.") }
        guard path.range(of: #"%(?![0-9a-fA-F]{2})"#, options: .regularExpression) == nil,
              let encodedPath = path.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed.union(CharacterSet(charactersIn: "%")))
        else { throw APIError(status: 0, message: "Invalid percent encoding in API path.") }
        components.percentEncodedPath = encodedPath
        if !query.isEmpty { components.queryItems = query.sorted { $0.key < $1.key }.map(URLQueryItem.init) }
        guard let url = components.url else { throw APIError(status: 0, message: "Invalid API URL.") }
        var request = URLRequest(url: url)
        request.httpMethod = method.rawValue
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if let body {
            request.httpBody = try JSONEncoder().encode(body)
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }
        return request
    }

    public func request(method: HTTPMethod = .GET, path: String, query: [String: String] = [:], body: JSONValue? = nil) async throws -> JSONValue {
        try await perform(makeRequest(method: method, path: path, query: query, body: body))
    }
    public func decode<T: Decodable & Sendable>(_ type: T.Type = T.self, method: HTTPMethod = .GET, path: String, query: [String: String] = [:], body: JSONValue? = nil) async throws -> T {
        try await request(method: method, path: path, query: query, body: body).decoded(type)
    }

    private func perform(_ request: URLRequest) async throws -> JSONValue {
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw APIError(status: 0, message: "The server did not return an HTTP response.") }
        let payload = try? JSONDecoder().decode(JSONValue.self, from: data)
        guard (200..<300).contains(http.statusCode) else { throw Self.failure(status: http.statusCode, payload: payload) }
        if data.isEmpty { return .null }
        guard let payload else { throw APIError(status: http.statusCode, message: "The server returned invalid JSON.") }
        return payload
    }
    private static func failure(status: Int, payload: JSONValue?) -> APIError {
        let reason = payload?["items"].arrayValue.flatMap { $0["reasons"].arrayValue }.first?["message"].stringValue
        let message = [payload?["error"].stringValue, payload?["message"].stringValue, reason].compactMap { $0 }.first { !$0.isEmpty }
        return APIError(status: status, message: message ?? "Server request failed (HTTP \(status)).", payload: payload)
    }

    public func upload(method: HTTPMethod = .POST, path: String, parts: [UploadPart]) async throws -> JSONValue {
        let boundary = "KnowMe-\(UUID().uuidString)"
        var request = try makeRequest(method: method, path: path)
        var data = Data()
        func append(_ s: String) { data.append(Data(s.utf8)) }
        for part in parts {
            guard ![part.name, part.filename ?? "", part.mimeType].contains(where: { $0.unicodeScalars.contains { [10, 13, 34].contains($0.value) } }) else {
                throw APIError(status: 0, message: "Invalid upload metadata.")
            }
            append("--\(boundary)\r\nContent-Disposition: form-data; name=\"\(part.name)\"")
            if let filename = part.filename { append("; filename=\"\(filename)\"") }
            append("\r\nContent-Type: \(part.mimeType)\r\n\r\n")
            data.append(part.data); append("\r\n")
        }
        append("--\(boundary)--\r\n")
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        request.httpBody = data
        return try await perform(request)
    }

    public func download(path: String, query: [String: String] = [:]) async throws -> Data {
        let (data, response) = try await session.data(for: makeRequest(path: path, query: query))
        guard let http = response as? HTTPURLResponse else { throw APIError(status: 0, message: "Invalid download response.") }
        guard (200..<300).contains(http.statusCode) else {
            throw Self.failure(status: http.statusCode, payload: try? JSONDecoder().decode(JSONValue.self, from: data))
        }
        return data
    }

    public func events() -> AsyncThrowingStream<ServerEvent, Error> {
        AsyncThrowingStream(bufferingPolicy: .bufferingNewest(256)) { continuation in
            let task = Task {
                do {
                    var request = try self.makeRequest(path: "/api/events")
                    request.timeoutInterval = 86400
                    request.setValue("text/event-stream", forHTTPHeaderField: "Accept")
                    let (bytes, response) = try await self.session.bytes(for: request)
                    guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
                        throw APIError(status: (response as? HTTPURLResponse)?.statusCode ?? 0, message: "Event connection failed.")
                    }
                    var parser = SSEParser()
                    for try await byte in bytes {
                        try Task.checkCancellation()
                        if let event = try parser.consume(byte: byte) { continuation.yield(event) }
                    }
                    continuation.finish()
                } catch { continuation.finish(throwing: error) }
            }
            continuation.onTermination = { _ in task.cancel() }
        }
    }

    public func webSocket(path: String, query: [String: String] = [:]) throws -> URLSessionWebSocketTask {
        var request = try makeRequest(path: path, query: query)
        var url = URLComponents(url: request.url!, resolvingAgainstBaseURL: false)!
        url.scheme = baseURL.scheme == "https" ? "wss" : "ws"
        request.url = url.url
        // URLSessionWebSocketTask does not consistently attach custom session cookies on macOS.
        if let cookies = session.configuration.httpCookieStorage?.cookies(for: baseURL) {
            for (key, value) in HTTPCookie.requestHeaderFields(with: cookies) { request.setValue(value, forHTTPHeaderField: key) }
        }
        let task = session.webSocketTask(with: request)
        task.resume()
        return task
    }
}
