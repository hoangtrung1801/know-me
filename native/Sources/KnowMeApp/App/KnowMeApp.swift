import AppKit
import SwiftUI

@MainActor final class AppDelegate: NSObject, NSApplicationDelegate {
    var model: AppModel?
    func applicationShouldTerminate(_ sender: NSApplication) -> NSApplication.TerminateReply {
        model?.shutdown()
        return .terminateNow
    }
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }
}

@main struct KnowMeApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) private var delegate
    @State private var model = AppModel(preferences: ProcessInfo.processInfo.environment["KNOWME_SMOKE_TEST"] == "1" ? UserDefaults(suiteName: "app.knowme.macos.smoke")! : .standard)
    var body: some Scene {
        Window("KnowMe", id: "workspace") {
            RootView(model: model)
                .task {
                    delegate.model = model
                    await model.connect()
                    if ProcessInfo.processInfo.environment["KNOWME_SMOKE_TEST"] == "1" {
                        if model.requiresLogin, let password = ProcessInfo.processInfo.environment["KNOWME_TEST_PASSWORD"] { await model.login(password: password) }
                        print("KNOWME_SMOKE connected=\(model.connected) projects=\(model.projects.count) login=\(model.requiresLogin)")
                        UserDefaults.standard.removePersistentDomain(forName: "app.knowme.macos.smoke")
                        NSApplication.shared.terminate(nil)
                    }
                }
        }.defaultSize(width: 1280, height: 820)
            .commands {
                CommandGroup(replacing: .newItem) {
                    Button("New…") { model.showCreate = true }
                        .keyboardShortcut("n", modifiers: .command)
                        .disabled(!model.connected || ![Destination.tasks, .documents, .links, .chat, .projects].contains(model.destination))
                }
                CommandMenu("Workspace") {
                    Button("Overview") { model.navigate(.overview) }.keyboardShortcut("1", modifiers: .command)
                    Button("Projects") { model.navigate(.projects) }.keyboardShortcut("2", modifiers: .command)
                    Button("Search…") { model.showSearch = true }.keyboardShortcut("k", modifiers: .command)
                    Divider()
                    Button("Reconnect") { Task { await model.connect() } }.disabled(model.isConnecting)
                }
            }
        Settings { SettingsView(model: model).frame(minWidth: 900, minHeight: 660) }
    }
}
