import AppKit
import SwiftUI

struct ConnectionView: View {
    @Bindable var model: AppModel
    @State private var password = ""
    var body: some View {
        VStack(alignment: .leading, spacing: 22) {
            Label("KnowMe", systemImage: "square.stack.3d.up").font(.largeTitle.weight(.semibold))
            Text(model.requiresLogin ? "Sign in to your KnowMe server" : "Connect your workspace").font(.title2)
            Text("Use an existing local server, or start the KnowMe helper from this app.").foregroundStyle(.secondary)
            if model.requiresLogin {
                SecureField("Server password", text: $password).onSubmit { login() }
                Button("Sign In") { login() }.buttonStyle(.borderedProminent).disabled(password.isEmpty || model.isConnecting)
                Button("Use Another Server") { password = ""; model.disconnect() }
            } else {
                TextField("Server address", text: $model.serverAddress).textContentType(.URL).onSubmit { Task { await model.connect() } }
                HStack {
                    Button("Connect") { Task { await model.connect() } }.buttonStyle(.borderedProminent)
                    if model.isConnecting { ProgressView().controlSize(.small) }
                }.disabled(model.isConnecting)
                DisclosureGroup("Start a local backend") {
                    VStack(alignment: .leading, spacing: 12) {
                        HStack {
                            TextField("KnowMe executable", text: $model.helperPath)
                            Button("Choose…") { chooseFile() }
                        }
                        HStack {
                            TextField("Working folder", text: $model.workingDirectory)
                            Button("Choose…") { chooseFolder() }
                        }
                        Button("Start Backend and Connect") { Task { await model.startBackend() } }
                            .disabled(model.isConnecting || model.helperPath.isEmpty || model.ownsBackend)
                        Text("The helper binds to loopback. Quitting KnowMe stops only a backend started by this app.").font(.caption).foregroundStyle(.secondary)
                    }.padding(.top, 12)
                }
            }
            if let error = model.errorMessage {
                Label(error, systemImage: "exclamationmark.triangle").foregroundStyle(.red).fixedSize(horizontal: false, vertical: true).textSelection(.enabled)
            }
        }.textFieldStyle(.roundedBorder).padding(40).frame(maxWidth: 600)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
    private func login() {
        let value = password; password = ""
        Task { await model.login(password: value) }
    }
    private func chooseFile() {
        let panel = NSOpenPanel(); panel.canChooseDirectories = false
        if panel.runModal() == .OK, let url = panel.url { model.helperPath = url.path }
    }
    private func chooseFolder() {
        let panel = NSOpenPanel(); panel.canChooseDirectories = true; panel.canChooseFiles = false
        if panel.runModal() == .OK, let url = panel.url { model.workingDirectory = url.path }
    }
}
