import SwiftUI
import AppKit
import KnowMeCore

// MARK: - Palette Colors

private let colorPalette = ["gray", "blue", "green", "yellow", "red", "purple", "orange", "pink", "cyan", "indigo"]

private func colorForName(_ name: String) -> Color {
    switch name {
    case "blue": return .blue
    case "green": return .green
    case "yellow": return .yellow
    case "red": return .red
    case "purple": return .purple
    case "orange": return .orange
    case "pink": return .pink
    case "cyan": return .cyan
    case "indigo": return .indigo
    default: return .gray
    }
}

// MARK: - Connection Settings (Foundation Replacement)

struct ConnectionSettingsSection: View {
    @Bindable var model: AppModel
    var store: SettingsStore

    var body: some View {
        Form {
            Section {
                TextField("Server address", text: $model.serverAddress)
                    .textFieldStyle(.roundedBorder)

                LabeledContent("Status") {
                    HStack(spacing: 6) {
                        Circle()
                            .fill(model.connected ? Color.green : Color.red)
                            .frame(width: 8, height: 8)
                        Text(model.connected ? "Connected" : "Disconnected")
                            .font(.callout.weight(.medium))
                    }
                }

                if model.connected {
                    LabeledContent("Backend Version", value: model.status?.version ?? "Unknown")
                    LabeledContent("Active Project", value: model.scopeTitle)
                    LabeledContent("Live Events", value: model.eventsConnected ? "Connected" : "Reconnecting")
                }

                HStack(spacing: 12) {
                    Button {
                        Task { await model.connect() }
                    } label: {
                        Label("Reconnect", systemImage: "arrow.clockwise")
                    }
                    .disabled(model.isConnecting)

                    Button(role: .destructive) {
                        model.disconnect()
                    } label: {
                        Label("Disconnect", systemImage: "xmark.circle")
                    }
                    .disabled(!model.connected)

                    if model.ownsBackend {
                        Button(role: .destructive) {
                            model.stopBackend()
                        } label: {
                            Label("Stop App-Owned Backend", systemImage: "stop.circle")
                        }
                    }
                }
                .padding(.top, 4)
            } header: {
                Text("Connection & Server Lifecycle")
            } footer: {
                Text("Native connection controls inherited from foundation. An app-owned backend helper started by this application will receive SIGTERM when stopped.")
            }
        }
        .formStyle(.grouped)
    }
}

// MARK: - General Settings

struct GeneralSettingsSection: View {
    @Bindable var store: SettingsStore

    var body: some View {
        Form {
            Section("Project Metadata") {
                TextField("Project Name", text: Binding(
                    get: { store.config.name ?? "" },
                    set: { store.config.name = $0; store.markDirty() }
                ))
                .textFieldStyle(.roundedBorder)

                TextField("Workspace Path", text: Binding(
                    get: { store.config.workspacePath ?? "" },
                    set: { store.config.workspacePath = $0; store.markDirty() }
                ))
                .textFieldStyle(.roundedBorder)
            }

            Section("Task Defaults") {
                TextField("Default Assignee", text: Binding(
                    get: { store.config.defaultAssignee ?? "" },
                    set: { store.config.defaultAssignee = $0; store.markDirty() }
                ))
                .textFieldStyle(.roundedBorder)

                Picker("Default Priority", selection: Binding(
                    get: { store.config.defaultPriority ?? "medium" },
                    set: { store.config.defaultPriority = $0; store.markDirty() }
                )) {
                    Text("Low").tag("low")
                    Text("Medium").tag("medium")
                    Text("High").tag("high")
                }

                VStack(alignment: .leading, spacing: 8) {
                    Text("Default Labels").font(.caption).foregroundStyle(.secondary)
                    HStack {
                        TextField("New label", text: $store.newLabelInput)
                            .textFieldStyle(.roundedBorder)
                            .onSubmit { store.addDefaultLabel() }
                        Button("Add") { store.addDefaultLabel() }
                            .disabled(store.newLabelInput.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                    }

                    if let labels = store.config.defaultLabels, !labels.isEmpty {
                        FlowLayout(spacing: 6) {
                            ForEach(labels, id: \.self) { label in
                                HStack(spacing: 4) {
                                    Text(label).font(.caption)
                                    Button {
                                        store.removeDefaultLabel(label)
                                    } label: {
                                        Image(systemName: "xmark").font(.system(size: 8))
                                    }
                                    .buttonStyle(.plain)
                                }
                                .padding(.horizontal, 8)
                                .padding(.vertical, 4)
                                .background(Color.secondary.opacity(0.15))
                                .clipShape(Capsule())
                            }
                        }
                    }
                }
            }

            Section("Preferences") {
                Picker("Time Format", selection: Binding(
                    get: { store.config.timeFormat ?? "24h" },
                    set: { store.config.timeFormat = $0; store.markDirty() }
                )) {
                    Text("12-hour (AM/PM)").tag("12h")
                    Text("24-hour").tag("24h")
                }

                TextField("CLI Editor", text: Binding(
                    get: { store.config.editor ?? "" },
                    set: { store.config.editor = $0; store.markDirty() }
                ))
                .textFieldStyle(.roundedBorder)
            }
        }
        .formStyle(.grouped)
    }
}

// MARK: - Task Lifecycle Settings

struct LifecycleSettingsSection: View {
    @Bindable var store: SettingsStore

    var body: some View {
        Form {
            Section {
                Toggle(
                    "Exclude done Tasks from default AI retrieval",
                    isOn: Binding(
                        get: { store.config.taskLifecycle?.excludeDoneFromDefaultRetrieval ?? true },
                        set: {
                            var lc = store.config.taskLifecycle ?? TaskLifecycleConfig()
                            lc.excludeDoneFromDefaultRetrieval = $0
                            store.config.taskLifecycle = lc
                            store.markDirty()
                        }
                    )
                )

                Toggle(
                    "Enable automatic Task archival",
                    isOn: Binding(
                        get: { store.config.taskLifecycle?.autoArchive ?? true },
                        set: {
                            var lc = store.config.taskLifecycle ?? TaskLifecycleConfig()
                            lc.autoArchive = $0
                            store.config.taskLifecycle = lc
                            store.markDirty()
                        }
                    )
                )

                TextField(
                    "Archive completed Tasks after",
                    text: Binding(
                        get: { store.config.taskLifecycle?.archiveAfter ?? "30d" },
                        set: {
                            var lc = store.config.taskLifecycle ?? TaskLifecycleConfig()
                            lc.archiveAfter = $0
                            store.config.taskLifecycle = lc
                            store.markDirty()
                        }
                    )
                )
                .textFieldStyle(.roundedBorder)
                .disabled(!(store.config.taskLifecycle?.autoArchive ?? true))

                LabeledContent("Automatic purge") {
                    Text("Disabled (project default: retained until guarded hard-delete)")
                        .foregroundStyle(.secondary)
                        .font(.callout)
                }
            } header: {
                Text("Task Retention & Archival")
            } footer: {
                Text("Zero archive duration means archive immediately after eligibility checks pass; turning Auto-archive off disables the periodic sweep. Purging is permanently guarded against accidental loss.")
            }
        }
        .formStyle(.grouped)
    }
}

// MARK: - Board Settings

struct BoardSettingsSection: View {
    @Bindable var store: SettingsStore

    var body: some View {
        Form {
            Section("Kanban Task Statuses & Colors") {
                let statuses = store.config.statuses ?? ["todo", "in-progress", "done"]
                ForEach(statuses, id: \.self) { status in
                    HStack(spacing: 12) {
                        Circle()
                            .fill(colorForName(store.config.statusColors?[status] ?? "gray"))
                            .frame(width: 10, height: 10)

                        Text(status)
                            .font(.system(.body, design: .monospaced))

                        Spacer()

                        Picker("Color", selection: Binding(
                            get: { store.config.statusColors?[status] ?? "gray" },
                            set: { store.setStatusColor(status, color: $0) }
                        )) {
                            ForEach(colorPalette, id: \.self) { color in
                                Text(color.capitalized).tag(color)
                            }
                        }
                        .frame(width: 110)

                        Button(role: .destructive) {
                            store.removeStatus(status)
                        } label: {
                            Image(systemName: "trash").foregroundStyle(.red)
                        }
                        .buttonStyle(.plain)
                    }
                    .padding(.vertical, 2)
                }

                HStack {
                    TextField("Add new status", text: $store.newStatusInput)
                        .textFieldStyle(.roundedBorder)
                        .onSubmit { store.addStatus() }
                    Button("Add") { store.addStatus() }
                        .disabled(store.newStatusInput.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
                .padding(.top, 4)
            }

            Section("Visible Kanban Columns") {
                let statuses = store.config.statuses ?? ["todo", "in-progress", "done"]
                let visible = store.config.visibleColumns ?? statuses
                ForEach(statuses, id: \.self) { status in
                    Toggle(
                        status.replacingOccurrences(of: "-", with: " ").capitalized,
                        isOn: Binding(
                            get: { visible.contains(status) },
                            set: { store.toggleVisibleColumn(status, isVisible: $0) }
                        )
                    )
                }
            }
        }
        .formStyle(.grouped)
    }
}

// MARK: - Search Settings

struct SearchSettingsSection: View {
    @Bindable var store: SettingsStore

    var body: some View {
        Form {
            Section("Semantic Search Configuration") {
                Toggle(
                    "Enable Semantic Search",
                    isOn: Binding(
                        get: { store.config.semanticSearch?.enabled ?? false },
                        set: {
                            var ss = store.config.semanticSearch ?? SemanticSearchConfig()
                            ss.enabled = $0
                            store.config.semanticSearch = ss
                            store.markDirty()
                        }
                    )
                )

                TextField("Model Identifier", text: Binding(
                    get: { store.config.semanticSearch?.model ?? "gte-small" },
                    set: {
                        var ss = store.config.semanticSearch ?? SemanticSearchConfig()
                        ss.model = $0
                        store.config.semanticSearch = ss
                        store.markDirty()
                    }
                ))
                .textFieldStyle(.roundedBorder)

                TextField("Vector Dimensions", value: Binding(
                    get: { store.config.semanticSearch?.dimensions ?? 384 },
                    set: {
                        var ss = store.config.semanticSearch ?? SemanticSearchConfig()
                        ss.dimensions = $0
                        store.config.semanticSearch = ss
                        store.markDirty()
                    }
                ), format: .number)
                .textFieldStyle(.roundedBorder)

                TextField("Max Tokens per Chunk", value: Binding(
                    get: { store.config.semanticSearch?.maxTokens ?? 512 },
                    set: {
                        var ss = store.config.semanticSearch ?? SemanticSearchConfig()
                        ss.maxTokens = $0
                        store.config.semanticSearch = ss
                        store.markDirty()
                    }
                ), format: .number)
                .textFieldStyle(.roundedBorder)
            }

            if let onnx = store.config.localONNX {
                Section("Local ONNX Runtime Capability") {
                    LabeledContent("Hardware ONNX Support", value: onnx.supported ? "Available" : "Unavailable")
                    if let reason = onnx.reason, !reason.isEmpty {
                        LabeledContent("Note", value: reason)
                    }
                }
            }
        }
        .formStyle(.grouped)
    }
}

// MARK: - Link Classifier Settings

struct ClassifierSettingsSection: View {
    @Bindable var store: SettingsStore

    var body: some View {
        Form {
            Section {
                TextField("API Base URL", text: $store.classifierSettings.apiBase)
                    .textFieldStyle(.roundedBorder)
                    .autocorrectionDisabled()

                SecureField("API Key (leave blank to keep saved key)", text: $store.classifierApiKeyInput)
                    .textFieldStyle(.roundedBorder)

                TextField("Model Identifier", text: $store.classifierSettings.model)
                    .textFieldStyle(.roundedBorder)
                    .autocorrectionDisabled()

                HStack(spacing: 12) {
                    Button {
                        Task { await store.testClassifier() }
                    } label: {
                        if store.classifierBusy {
                            ProgressView().controlSize(.small)
                        } else {
                            Label("Test Connection", systemImage: "bolt.fill")
                        }
                    }
                    .disabled(store.classifierBusy || store.classifierSettings.apiBase.isEmpty || store.classifierSettings.model.isEmpty)

                    Button {
                        Task { await store.saveClassifier() }
                    } label: {
                        Label("Save Classifier", systemImage: "checkmark")
                    }
                    .disabled(store.classifierBusy || store.classifierSettings.apiBase.isEmpty || store.classifierSettings.model.isEmpty)
                }
                .padding(.top, 4)

                if let result = store.classifierResult {
                    HStack(alignment: .top, spacing: 8) {
                        Image(systemName: (store.classifierSuccess == true) ? "checkmark.circle.fill" : "exclamationmark.triangle.fill")
                            .foregroundStyle((store.classifierSuccess == true) ? Color.green : Color.red)
                        Text(result)
                            .font(.callout)
                            .foregroundStyle((store.classifierSuccess == true) ? Color.green : Color.red)
                    }
                    .padding(.vertical, 4)
                }
            } header: {
                Text("Automated Link Classification")
            } footer: {
                Text("Uses an OpenAI-compatible endpoint to auto-categorize and tag links saved into your global library.")
            }
        }
        .formStyle(.grouped)
    }
}

// MARK: - AI & Agents Settings

struct AISettingsSection: View {
    @Bindable var store: SettingsStore

    var body: some View {
        Form {
            Section("Oh My Pi (OMP) ACP Background Agent") {
                if store.ompLoading {
                    ProgressView("Checking OMP agent status…")
                        .padding(.vertical, 8)
                } else if let omp = store.ompStatus {
                    HStack(spacing: 8) {
                        Image(systemName: omp.installed && omp.loggedIn ? "checkmark.circle.fill" : "exclamationmark.triangle.fill")
                            .foregroundStyle(omp.installed && omp.loggedIn ? Color.green : Color.orange)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(omp.installed ? (omp.loggedIn ? "Connected & Signed In" : "Installed (Sign-in required)") : "omp CLI executable is not installed")
                                .font(.headline)
                            if let version = omp.version {
                                Text(version).font(.caption).foregroundStyle(.secondary)
                            }
                            if let error = omp.error {
                                Text(error).font(.caption).foregroundStyle(.red)
                            }
                        }
                    }
                    .padding(.vertical, 4)

                    let command = omp.installed ? omp.loginCommand : omp.installCommand
                    if let cmd = command, !cmd.isEmpty {
                        VStack(alignment: .leading, spacing: 4) {
                            Text("Setup / Sign-in Command:").font(.caption).foregroundStyle(.secondary)
                            HStack {
                                Text(cmd)
                                    .font(.system(.caption, design: .monospaced))
                                    .textSelection(.enabled)
                                    .lineLimit(2)
                                Spacer()
                                Button {
                                    NSPasteboard.general.clearContents()
                                    NSPasteboard.general.setString(cmd, forType: .string)
                                } label: {
                                    Image(systemName: "doc.on.doc")
                                }
                                .buttonStyle(.borderless)
                                .help("Copy command")
                            }
                            .padding(8)
                            .background(Color.secondary.opacity(0.1))
                            .clipShape(RoundedRectangle(cornerRadius: 6))
                        }
                    }

                    HStack(spacing: 12) {
                        Button("Refresh Status", systemImage: "arrow.clockwise") {
                            Task { await store.loadOMPStatus() }
                        }
                        if let urlString = omp.docsUrl, let url = URL(string: urlString) {
                            Link("Setup Guide", destination: url)
                        }
                    }
                } else if let err = store.ompError {
                    Text(err).foregroundStyle(.red)
                    Button("Retry", systemImage: "arrow.clockwise") {
                        Task { await store.loadOMPStatus() }
                    }
                }
            }

            Section("OpenCode Server Configuration") {
                if store.openCodeLoading {
                    ProgressView("Checking OpenCode status…")
                        .padding(.vertical, 8)
                } else if let openCode = store.openCodeStatus {
                    HStack(spacing: 8) {
                        Image(systemName: (openCode.available == true) ? "checkmark.circle.fill" : "exclamationmark.triangle.fill")
                            .foregroundStyle((openCode.available == true) ? Color.green : Color.orange)
                        VStack(alignment: .leading, spacing: 2) {
                            Text((openCode.available == true) ? "Connected to \(openCode.host ?? "127.0.0.1"):\(openCode.port ?? 64200)" : (openCode.lastError ?? "OpenCode server unavailable"))
                                .font(.headline)
                            if openCode.cliInstalled == false {
                                Text("opencode CLI not found; auto-start disabled.").font(.caption).foregroundStyle(.secondary)
                            }
                        }
                    }

                    SecureField("OpenCode Server Password", text: Binding(
                        get: { store.config.opencodeServer?.password ?? "" },
                        set: {
                            var s = store.config.opencodeServer ?? OpenCodeServerConfig()
                            s.password = $0.isEmpty ? nil : $0
                            store.config.opencodeServer = s
                            store.markDirty()
                        }
                    ))
                    .textFieldStyle(.roundedBorder)

                    Button("Refresh OpenCode Status", systemImage: "arrow.clockwise") {
                        Task { await store.loadOpenCodeStatus() }
                    }
                } else {
                    Text("OpenCode is disabled in the current Go server configuration.")
                        .font(.callout)
                        .foregroundStyle(.secondary)
                }
            }
        }
        .formStyle(.grouped)
    }
}

// MARK: - Runtime & Memory Settings

struct RuntimeSettingsSection: View {
    @Bindable var store: SettingsStore

    var body: some View {
        Form {
            Section {
                if store.servicesLoading {
                    ProgressView("Checking runtime processes…")
                        .padding(.vertical, 8)
                } else if store.runtimeServices.isEmpty {
                    ContentUnavailableView(
                        "No Runtime Services",
                        systemImage: "cpu",
                        description: Text("No background services are currently reported by the server.")
                    )
                } else {
                    ForEach(store.runtimeServices) { svc in
                        VStack(alignment: .leading, spacing: 6) {
                            HStack(spacing: 8) {
                                Circle()
                                    .fill(statusColor(svc.status))
                                    .frame(width: 8, height: 8)
                                Text(svc.name)
                                    .font(.headline)
                                Text(svc.status.capitalized)
                                    .font(.caption)
                                    .padding(.horizontal, 6)
                                    .padding(.vertical, 2)
                                    .background(Color.secondary.opacity(0.15))
                                    .clipShape(Capsule())

                                Spacer()

                                if let uptime = svc.uptime, !uptime.isEmpty {
                                    Text("uptime: \(uptime)").font(.caption).foregroundStyle(.secondary)
                                }
                                if let pid = svc.pid {
                                    Text("pid: \(pid)").font(.caption).foregroundStyle(.secondary)
                                }
                            }

                            if let details = svc.details, !details.isEmpty {
                                FlowLayout(spacing: 4) {
                                    ForEach(details.sorted(by: { $0.key < $1.key }), id: \.key) { k, v in
                                        Text("\(k)=\(v)")
                                            .font(.system(.caption2, design: .monospaced))
                                            .padding(.horizontal, 6)
                                            .padding(.vertical, 2)
                                            .background(k.contains("error") ? Color.red.opacity(0.15) : Color.secondary.opacity(0.1))
                                            .foregroundStyle(k.contains("error") ? Color.red : Color.primary)
                                            .clipShape(RoundedRectangle(cornerRadius: 4))
                                    }
                                }
                            }
                        }
                        .padding(.vertical, 4)
                    }
                }

                Button("Refresh Services", systemImage: "arrow.clockwise") {
                    Task { await store.loadRuntimeServices() }
                }
                .padding(.top, 4)
            } header: {
                Text("Managed Runtime Processes")
            } footer: {
                Text("Live sub-processes monitored by KnowMe's runtime daemon.")
            }

            Section("Memory Limits") {
                Picker("Memory Queue Mode", selection: Binding(
                    get: { store.config.runtimeMemory?.mode ?? "auto" },
                    set: {
                        var rm = store.config.runtimeMemory ?? RuntimeMemoryConfig()
                        rm.mode = $0
                        store.config.runtimeMemory = rm
                        store.markDirty()
                    }
                )) {
                    Text("Off").tag("off")
                    Text("Auto").tag("auto")
                    Text("Manual").tag("manual")
                    Text("Debug").tag("debug")
                }

                TextField("Max Queued Items (0 = unlimited)", value: Binding(
                    get: { store.config.runtimeMemory?.maxItems ?? 0 },
                    set: {
                        var rm = store.config.runtimeMemory ?? RuntimeMemoryConfig()
                        rm.maxItems = $0
                        store.config.runtimeMemory = rm
                        store.markDirty()
                    }
                ), format: .number)
                .textFieldStyle(.roundedBorder)

                TextField("Max Memory Bytes (0 = unlimited)", value: Binding(
                    get: { store.config.runtimeMemory?.maxBytes ?? 0 },
                    set: {
                        var rm = store.config.runtimeMemory ?? RuntimeMemoryConfig()
                        rm.maxBytes = $0
                        store.config.runtimeMemory = rm
                        store.markDirty()
                    }
                ), format: .number)
                .textFieldStyle(.roundedBorder)
            }
        }
        .formStyle(.grouped)
    }

    private func statusColor(_ status: String) -> Color {
        switch status.lowercased() {
        case "running", "ready", "installed": return .green
        case "crashed", "error": return .red
        case "starting", "indexing", "degraded": return .orange
        default: return .gray
        }
    }
}

// MARK: - Security Settings

struct SecuritySettingsSection: View {
    @Bindable var store: SettingsStore

    var body: some View {
        Form {
            Section {
                HStack(spacing: 8) {
                    Circle()
                        .fill(store.isPasswordProtected ? Color.green : Color.orange)
                        .frame(width: 10, height: 10)
                    Text(store.isPasswordProtected ? "WebUI Access Protected with Password" : "WebUI Access Unprotected")
                        .font(.headline)
                }

                if store.isPasswordProtected {
                    Button(role: .destructive) {
                        Task { await store.removePassword() }
                    } label: {
                        if store.passwordBusy {
                            ProgressView().controlSize(.small)
                        } else {
                            Label("Remove Password Protection", systemImage: "lock.open")
                        }
                    }
                    .disabled(store.passwordBusy)
                } else {
                    HStack {
                        SecureField("Enter new password", text: $store.newPasswordInput)
                            .textFieldStyle(.roundedBorder)
                            .onSubmit { Task { await store.setPassword() } }

                        Button {
                            Task { await store.setPassword() }
                        } label: {
                            if store.passwordBusy {
                                ProgressView().controlSize(.small)
                            } else {
                                Label("Set Password", systemImage: "lock.fill")
                            }
                        }
                        .disabled(store.passwordBusy || store.newPasswordInput.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                    }
                }

                if let err = store.passwordError {
                    Text(err).font(.callout).foregroundStyle(.red)
                }
                if let succ = store.passwordSuccess {
                    Text(succ).font(.callout).foregroundStyle(.green)
                }
            } header: {
                Text("Password Protection")
            } footer: {
                Text("Protects web UI access with an in-memory password. Passwords are never persisted to disk or copied across machines.")
            }
        }
        .formStyle(.grouped)
    }
}

// MARK: - Advanced & JSON Settings

struct AdvancedSettingsSection: View {
    @Bindable var store: SettingsStore

    private let platformOptions = [
        ("claude-code", "Claude Code"),
        ("opencode", "OpenCode"),
        ("gemini", "Gemini"),
        ("copilot", "Copilot"),
        ("agents", "Agents")
    ]

    var body: some View {
        Form {
            Section("Git Tracking") {
                Picker("Tracking Mode", selection: Binding(
                    get: { store.config.gitTrackingMode ?? "none" },
                    set: { store.config.gitTrackingMode = $0; store.markDirty() }
                )) {
                    Text("Git Tracked").tag("git-tracked")
                    Text("Git Ignored").tag("git-ignored")
                    Text("None").tag("none")
                }
            }

            Section("Network & Server") {
                TextField("Server Port", value: Binding(
                    get: { store.config.serverPort ?? 0 },
                    set: { store.config.serverPort = $0; store.markDirty() }
                ), format: .number)
                .textFieldStyle(.roundedBorder)
            }

            Section("Active AI Platforms") {
                let enabled = store.config.platforms ?? []
                ForEach(platformOptions, id: \.0) { id, title in
                    Toggle(
                        title,
                        isOn: Binding(
                            get: { enabled.contains(id) },
                            set: { store.togglePlatform(id, enabled: $0) }
                        )
                    )
                }
            }

            Section("Chat Interface") {
                Toggle(
                    "Enable Chat UI",
                    isOn: Binding(
                        get: { store.config.enableChatUI ?? true },
                        set: { store.config.enableChatUI = $0; store.markDirty() }
                    )
                )
            }

            Section {
                VStack(alignment: .leading, spacing: 8) {
                    TextEditor(text: Binding(
                        get: { store.rawJSONText },
                        set: { store.updateRawJSON($0) }
                    ))
                    .font(.system(.caption, design: .monospaced))
                    .frame(minHeight: 220)
                    .clipShape(RoundedRectangle(cornerRadius: 6))
                    .overlay(RoundedRectangle(cornerRadius: 6).stroke(Color.secondary.opacity(0.2)))

                    if let err = store.rawJSONError {
                        Text(err).font(.caption).foregroundStyle(.red)
                    }

                    HStack {
                        Spacer()
                        Button {
                            Task { await store.saveRawJSON() }
                        } label: {
                            if store.isSavingJSON {
                                ProgressView().controlSize(.small)
                            } else {
                                Label("Apply Raw JSON", systemImage: "arrow.up.doc")
                            }
                        }
                        .disabled(store.isSavingJSON || store.rawJSONText.isEmpty)
                    }
                }
            } header: {
                Text("Raw config.json Editor")
            } footer: {
                Text("Edits are validated before saving. JSON containing credentials stays in this window and is excluded from draft recovery.")
            }
        }
        .formStyle(.grouped)
    }
}

// MARK: - FlowLayout Helper for Badges

private struct FlowLayout: Layout {
    var spacing: CGFloat = 4

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let width = proposal.width ?? 0
        var height: CGFloat = 0
        var currentX: CGFloat = 0
        var currentY: CGFloat = 0
        var maxHeightInRow: CGFloat = 0

        for subview in subviews {
            let size = subview.sizeThatFits(.unspecified)
            if currentX + size.width > width && currentX > 0 {
                currentX = 0
                currentY += maxHeightInRow + spacing
                maxHeightInRow = 0
            }
            currentX += size.width + spacing
            maxHeightInRow = max(maxHeightInRow, size.height)
            height = max(height, currentY + maxHeightInRow)
        }
        return CGSize(width: width, height: height)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var currentX: CGFloat = bounds.minX
        var currentY: CGFloat = bounds.minY
        var maxHeightInRow: CGFloat = 0

        for subview in subviews {
            let size = subview.sizeThatFits(.unspecified)
            if currentX + size.width > bounds.maxX && currentX > bounds.minX {
                currentX = bounds.minX
                currentY += maxHeightInRow + spacing
                maxHeightInRow = 0
            }
            subview.place(at: CGPoint(x: currentX, y: currentY), proposal: .unspecified)
            currentX += size.width + spacing
            maxHeightInRow = max(maxHeightInRow, size.height)
        }
    }
}
