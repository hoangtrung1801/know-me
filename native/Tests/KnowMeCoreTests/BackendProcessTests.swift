import Foundation
import Testing
@testable import KnowMeCore

@Test @MainActor func backendOwnershipUsesReportedPortAndStopsOnlyItsOwnChild() async throws {
    let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
    defer { try? FileManager.default.removeItem(at: root) }
    let script = root.appendingPathComponent("fixture-helper")
    try Data("#!/bin/sh\necho http://127.0.0.1:6543\nexec /bin/sleep 30\n".utf8).write(to: script)
    try FileManager.default.setAttributes([.posixPermissions: 0o700], ofItemAtPath: script.path)
    let backend = BackendProcess()
    defer { backend.stop() }
    #expect(!backend.isRunning)
    let reported = try await backend.start(executable: script, workingDirectory: root)
    #expect(reported.port == 6543)
    #expect(backend.isRunning)
    backend.stop()
    #expect(!backend.isRunning)
    backend.stop() // An attached/unowned backend never acquires process authority.
}

@Test @MainActor func backendStartupFailureClearsOwnership() async throws {
    let backend = BackendProcess()
    do {
        _ = try await backend.start(executable: URL(fileURLWithPath: "/usr/bin/false"), workingDirectory: FileManager.default.temporaryDirectory)
        Issue.record("Expected helper startup failure")
    } catch { #expect(!backend.isRunning) }
}
