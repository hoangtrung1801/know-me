import SwiftUI

struct RootView: View {
    @Bindable var model: AppModel
    @State private var sidebarVisibility = NavigationSplitViewVisibility.all
    var body: some View {
        Group {
            if model.connected {
                NavigationSplitView(columnVisibility: $sidebarVisibility) {
                    sidebar.navigationSplitViewColumnWidth(min: 210, ideal: 240, max: 300)
                } detail: {
                    HStack(spacing: 0) {
                        FeatureRouter(model: model).frame(maxWidth: .infinity, maxHeight: .infinity)
                            .id(model.workspaceKey)
                        if model.inspectorVisible && model.destination == .overview {
                            Divider()
                            WorkspaceInspector(model: model).frame(width: 290)
                        }
                    }
                    .navigationTitle(model.destination.title)
                    .toolbar {
                        ToolbarItem(placement: .navigation) { Text(model.scopeTitle).font(.callout).foregroundStyle(.secondary) }
                        ToolbarItemGroup {
                            Button("Search", systemImage: "magnifyingglass") { model.showSearch = true }
                                .keyboardShortcut("k", modifiers: .command)
                            Button("Toggle Inspector", systemImage: "sidebar.right") { model.inspectorVisible.toggle() }
                                .help("Show or hide the workspace inspector")
                        }
                    }
                }
            } else { ConnectionView(model: model) }
        }
        .tint(WorkspaceStyle.accent)
        .frame(minWidth: 960, minHeight: 640)
        .sheet(isPresented: $model.showSearch) {
            VStack(spacing: 20) {
                SearchView(model: model)
                Button("Close") { model.showSearch = false }.keyboardShortcut(.cancelAction)
            }.padding(16).frame(width: 760, height: 580)
        }
        .sheet(isPresented: Binding(get: { model.agentTaskID != nil }, set: { if !$0 { model.agentTaskID = nil } })) {
            if let taskID = model.agentTaskID {
                VStack(spacing: 0) {
                    HStack { Text("Task Agent").font(.headline); Spacer(); Button("Close") { model.agentTaskID = nil }.keyboardShortcut(.cancelAction) }.padding(16)
                    Divider()
                    AgentRunView(model: model, taskID: taskID)
                }.frame(width: 1000, height: 760)
            }
        }
        .safeAreaInset(edge: .bottom) {
            if model.connected, let error = model.errorMessage {
                HStack {
                    Label(error, systemImage: "exclamationmark.triangle").textSelection(.enabled)
                    Spacer()
                    Button("Dismiss") { model.errorMessage = nil }
                }.font(.callout).padding(12).background(.bar)
            }
        }
    }
    private var sidebar: some View {
        List {
            Section {
                Picker("Project", selection: Binding(get: { model.workspace.projectID ?? "" }, set: { id in Task { await model.selectProject(id.isEmpty ? nil : id) } })) {
                    Text("All projects").tag("")
                    ForEach(model.projects) { Text($0.name).tag($0.id) }
                }.disabled(model.isSwitching)
            }
            Section("Workspace") { ForEach([Destination.overview, .tasks, .documents, .chat]) { item in row(item) } }
            Section("Global Library") { ForEach([Destination.links, .memos]) { item in row(item) } }
            Section("Operations") { ForEach([Destination.projects, .audit]) { item in row(item) } }
        }.listStyle(.sidebar)
        .safeAreaInset(edge: .bottom) {
            HStack {
                Image(systemName: model.eventsConnected ? "bolt.horizontal.circle.fill" : "arrow.clockwise.circle")
                Text(model.eventsConnected ? "Connected" : "Reconnecting").font(.caption)
                Spacer()
                SettingsLink { Image(systemName: "gearshape") }.help("Settings")
            }.foregroundStyle(.secondary).padding(16)
        }
    }
    private func row(_ destination: Destination) -> some View {
        Button { model.navigate(destination) } label: {
            Label(destination.title, systemImage: destination.symbol)
                .frame(maxWidth: .infinity, alignment: .leading).padding(.vertical, 4)
        }.buttonStyle(.plain)
            .listRowBackground(model.destination == destination ? WorkspaceStyle.accent.opacity(0.13) : .clear)
            .accessibilityAddTraits(model.destination == destination ? .isSelected : [])
    }
}

/// Integration owner replaces these cases with feature exports after OMP settlement.
struct FeatureRouter: View {
    let model: AppModel
    @ViewBuilder var body: some View {
        switch model.destination {
        case .overview: OverviewView(model: model)
        case .projects: ProjectsView(model: model)
        case .tasks: TasksView(model: model)
        case .documents: DocumentsView(model: model)
        case .chat: ChatView(model: model)
        case .links: LinksView(model: model)
        case .memos: MemosView(model: model)
        case .audit: AuditView(model: model)
        }
    }
}

struct FoundationSettings: View {
    @Bindable var model: AppModel
    var body: some View {
        Form {
            Section("Connection") {
                TextField("Server address", text: $model.serverAddress)
                LabeledContent("Status", value: model.connected ? "Connected" : "Disconnected")
                Button("Reconnect") { Task { await model.connect() } }.disabled(model.isConnecting)
                Button("Disconnect") { model.disconnect() }
                if model.ownsBackend { Button("Stop App-Owned Backend") { model.stopBackend() } }
            }
            Section("Native foundation") {
                Text("Project configuration, provider settings, and runtime management will be added by the Operations feature worker.").foregroundStyle(.secondary)
            }
        }.formStyle(.grouped).padding(20).frame(width: 580, height: 400)
    }
}
