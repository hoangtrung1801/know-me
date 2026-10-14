import SwiftUI
import KnowMeCore

enum WorkspaceStyle {
    static let accent = Color(red: 0.09, green: 0.42, blue: 0.38)
}

struct FeaturePendingView: View {
    let title: String
    let symbol: String
    var body: some View {
        ContentUnavailableView {
            Label(title, systemImage: symbol)
        } description: {
            Text("The native foundation is ready. This feature is scheduled for OMP implementation.")
        }
    }
}

struct FoundationOverview: View {
    @Bindable var model: AppModel
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                Text("Your KnowMe workspace").font(.largeTitle.weight(.semibold))
                Text("Connected to your existing knowledge and agent runtime.").foregroundStyle(.secondary)
                Divider()
                LabeledContent("Server", value: model.serverAddress)
                LabeledContent("Backend version", value: model.status?.version ?? "Unknown")
                LabeledContent("Project scope", value: model.scopeTitle)
                LabeledContent("Registered projects", value: "\(model.projects.count)")
                LabeledContent("Live updates", value: model.eventsConnected ? "Connected" : "Reconnecting")
                LabeledContent("Server ownership", value: model.ownsBackend ? "Started by this app" : "Existing server")
                Divider()
                Text("Foundation build").font(.headline)
                Text("Connection, project selection, native navigation and live events are available. Feature screens will be implemented separately; this build does not yet provide web feature parity.").foregroundStyle(.secondary)
                Button("Browse Projects") { model.navigate(.projects) }
            }.padding(32).frame(maxWidth: 780, alignment: .leading)
        }.frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }
}

struct FoundationProjects: View {
    @Bindable var model: AppModel
    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                Text("Projects").font(.title2.weight(.semibold))
                Spacer()
                Button("Refresh", systemImage: "arrow.clockwise") { Task { do { try await model.reloadProjects() } catch { model.report(error) } } }
            }.padding(24)
            if model.projects.isEmpty {
                ContentUnavailableView("No projects registered", systemImage: "folder", description: Text("Global links and memos can still be accessed. Project creation will be added in the Projects feature."))
            } else {
                List(model.projects) { project in
                    HStack(spacing: 12) {
                        Image(systemName: "folder").foregroundStyle(.secondary)
                        VStack(alignment: .leading, spacing: 4) {
                            Text(project.name).font(.headline)
                            Text(project.path ?? "No repository folder").font(.caption).foregroundStyle(.secondary).textSelection(.enabled)
                        }
                        Spacer()
                        if model.workspace.projectID == project.id {
                            Label("Selected", systemImage: "checkmark").foregroundStyle(WorkspaceStyle.accent)
                        } else {
                            Button("Select") { Task { await model.selectProject(project.id) } }.disabled(model.isSwitching)
                        }
                    }.padding(.vertical, 8)
                }.listStyle(.inset)
            }
        }
    }
}

struct WorkspaceInspector: View {
    let model: AppModel
    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            Text("Workspace").font(.headline)
            Label(model.scopeTitle, systemImage: "folder")
            Text(model.selectedProject?.path ?? "Global content across registered projects").font(.caption).foregroundStyle(.secondary).textSelection(.enabled)
            Divider()
            Label(model.eventsConnected ? "Live updates connected" : "Live updates reconnecting", systemImage: model.eventsConnected ? "bolt.horizontal.circle" : "arrow.clockwise.circle")
                .font(.callout)
            if let error = model.eventError { Text(error).font(.caption).foregroundStyle(.secondary) }
            Text("\(model.recentEvents.count) recent events in memory").font(.caption).foregroundStyle(.secondary)
            Spacer()
            Text("Feature inspectors will show details for the selected task, document, or agent run.").font(.caption).foregroundStyle(.secondary)
        }.padding(20).frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }
}
