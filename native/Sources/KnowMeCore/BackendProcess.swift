import Foundation

/// Owns only the child it launches. Attaching never acquires shutdown authority.
@MainActor public final class BackendProcess {
    private var process: Process?
    private var output: FileHandle?
    private var logURL: URL?
    public var isRunning: Bool { process?.isRunning == true }
    public init() {}

    public func start(executable: URL, workingDirectory: URL) async throws -> URL {
        guard process == nil else { throw APIError(status: 0, message: "The managed backend is already started. Stop it before starting another.") }
        guard FileManager.default.isExecutableFile(atPath: executable.path) else { throw APIError(status: 0, message: "Select an executable KnowMe CLI.") }
        let log = FileManager.default.temporaryDirectory.appendingPathComponent("knowme-native-\(UUID().uuidString).log")
        FileManager.default.createFile(atPath: log.path, contents: nil, attributes: [.posixPermissions: 0o600])
        let handle = try FileHandle(forWritingTo: log)
        let child = Process()
        child.executableURL = executable
        child.arguments = ["browser", "--no-open", "--host", "127.0.0.1", "--port", "6420"]
        child.currentDirectoryURL = workingDirectory
        child.standardOutput = handle; child.standardError = handle
        self.process = child; self.output = handle; self.logURL = log
        do {
            try child.run()
            // The CLI prints the selected port only after binding it; never probe/attach an unrelated busy port.
            let pattern = #"http://127\.0\.0\.1:([0-9]+)"#
            let regex = try NSRegularExpression(pattern: pattern)
            for _ in 0..<100 {
                try Task.checkCancellation()
                guard child.isRunning else { throw APIError(status: 0, message: "The KnowMe helper exited during startup. Check that the selected CLI can run in this folder.") }
                if let reader = try? FileHandle(forReadingFrom: log) {
                    let data = (try? reader.read(upToCount: 131072)) ?? Data()
                    try? reader.close()
                    let text = String(decoding: data, as: UTF8.self)
                    if let match = regex.firstMatch(in: text, range: NSRange(text.startIndex..., in: text)), let range = Range(match.range, in: text), let url = URL(string: String(text[range])) { return url }
                }
                try await Task.sleep(for: .milliseconds(150))
            }
            throw APIError(status: 0, message: "The KnowMe helper did not report a listening address within 15 seconds.")
        } catch { stop(); throw error }
    }
    public func stop() {
        if let process, process.isRunning { process.terminate() }
        process = nil
        try? output?.close(); output = nil
        if let logURL { try? FileManager.default.removeItem(at: logURL) }; logURL = nil
    }
}
