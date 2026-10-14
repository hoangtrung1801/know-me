import SwiftUI
import AppKit
import KnowMeCore

struct ProjectsView: View {
    @Bindable var model: AppModel
    @State private var store: WorkStore?

    // Filter
    @State private var searchFilter = ""

    // Create Project sheet
    @State private var showCreateSheet = false
    @State private var newProjectName = ""
    @State private var newProjectPath = ""
    @State private var createError: String?

    // Edit Project sheet
    @State private var editingProject: WorkspaceProject?
    @State private var editProjectName = ""
    @State private var editProjectPath = ""
    @State private var editError: String?

    // Delete Project confirmation
    @State private var projectToDelete: WorkspaceProject?
    @State private var showDeleteConfirm = false

    init(model: AppModel) {
        self.model = model
    }

    private var activeStore: WorkStore {
        if let store { return store }
        let newStore = WorkStore(model: model)
        return newStore
    }

    var body: some View {
        Group {
            if let store {
                content(store)
            } else {
                ProgressView("Loading projects...")
            }
        }
        .task(id: model.workspaceKey) {
            let s = WorkStore(model: model)
            self.store = s
            restoreCreateDraft()
        }
        .sheet(isPresented: $showCreateSheet) {
            createProjectSheet(activeStore)
        }
        .onChange(of: model.showCreate) { _, show in
            if show { model.showCreate = false; showCreateSheet = true }
        }
        .sheet(item: $editingProject) { project in
            editProjectSheet(project, store: activeStore)
        }
        .confirmationDialog(
            "Delete Workspace?",
            isPresented: $showDeleteConfirm,
            presenting: projectToDelete
        ) { project in
            Button("Delete Workspace '\(project.name)'", role: .destructive) {
                Task {
                    do {
                        try await activeStore.deleteWorkspace(id: project.id)
                    } catch {
                        model.report(error)
                    }
                }
            }
            Button("Cancel", role: .cancel) {}
        } message: { project in
            Text("Are you sure you want to remove '\(project.name)' from the workspace registry? Files on disk will remain untouched.")
        }
    }

    @ViewBuilder
    private func content(_ store: WorkStore) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            // Header
            HStack(alignment: .center) {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Workspaces").font(.title2.weight(.bold))
                    Text("Manage registered project directories and global logical scopes.").font(.subheadline).foregroundStyle(.secondary)
                }
                Spacer()
                HStack(spacing: 12) {
                    Button {
                        Task {
                            do { try await model.reloadProjects() } catch { model.report(error) }
                        }
                    } label: {
                        Label("Refresh", systemImage: "arrow.clockwise")
                    }

                    Button {
                        restoreCreateDraft()
                        showCreateSheet = true
                    } label: {
                        Label("New Workspace", systemImage: "plus")
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(WorkspaceStyle.accent)
                }
            }
            .padding(24)

            // Search Filter
            HStack {
                Image(systemName: "magnifyingglass").foregroundStyle(.secondary)
                TextField("Filter workspaces by name or path...", text: $searchFilter)
                    .textFieldStyle(.plain)
                if !searchFilter.isEmpty {
                    Button {
                        searchFilter = ""
                    } label: {
                        Image(systemName: "xmark.circle.fill").foregroundStyle(.secondary)
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(10)
            .background(Color(nsColor: .controlBackgroundColor))
            .clipShape(RoundedRectangle(cornerRadius: 8))
            .padding(.horizontal, 24)
            .padding(.bottom, 16)

            Divider()

            let filteredProjects = model.projects.filter { project in
                guard !searchFilter.isEmpty else { return true }
                let query = searchFilter.lowercased()
                return project.name.lowercased().contains(query) || (project.path?.lowercased().contains(query) ?? false)
            }

            if filteredProjects.isEmpty {
                ContentUnavailableView(
                    model.projects.isEmpty ? "No Workspaces Registered" : "No Matching Workspaces",
                    systemImage: "folder.badge.questionmark",
                    description: Text(model.projects.isEmpty
                        ? "Register a workspace to scope tasks, documents, and agent runs to a codebase."
                        : "No projects match '\(searchFilter)'.")
                )
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                List(filteredProjects) { project in
                    projectRow(project, store: store)
                }
                .listStyle(.inset)
            }
        }
    }

    private func projectRow(_ project: WorkspaceProject, store: WorkStore) -> some View {
        let isSelected = model.workspace.projectID == project.id

        return HStack(spacing: 16) {
            Image(systemName: isSelected ? "folder.fill.badge.person.crop" : "folder.fill")
                .font(.title2)
                .foregroundStyle(isSelected ? WorkspaceStyle.accent : .secondary)

            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 8) {
                    Text(project.name).font(.headline)
                    if isSelected {
                        Text("ACTIVE")
                            .font(.system(size: 9, weight: .bold))
                            .padding(.horizontal, 6)
                            .padding(.vertical, 2)
                            .background(WorkspaceStyle.accent.opacity(0.18))
                            .foregroundStyle(WorkspaceStyle.accent)
                            .clipShape(Capsule())
                    }
                }

                if let path = project.path, !path.isEmpty {
                    Text(path).font(.caption).foregroundStyle(.secondary).textSelection(.enabled)
                } else {
                    Text("No local folder linked").font(.caption).foregroundStyle(.tertiary)
                }
            }

            Spacer()

            HStack(spacing: 10) {
                if !isSelected {
                    Button("Select") {
                        Task { await model.selectProject(project.id) }
                    }
                    .buttonStyle(.bordered)
                    .disabled(model.isSwitching)
                }

                Menu {
                    Button("Edit Workspace...") {
                        editingProject = project
                        editProjectName = project.name
                        editProjectPath = project.path ?? ""
                        editError = nil
                    }

                    if let path = project.path, !path.isEmpty {
                        Button("Reveal in Finder") {
                            let url = URL(fileURLWithPath: path)
                            NSWorkspace.shared.activateFileViewerSelecting([url])
                        }
                    }

                    Divider()

                    Button("Delete Workspace...", role: .destructive) {
                        projectToDelete = project
                        showDeleteConfirm = true
                    }
                } label: {
                    Image(systemName: "ellipsis.circle")
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.vertical, 8)
    }

    // MARK: - Create Sheet

    private func createProjectSheet(_ store: WorkStore) -> some View {
        NavigationStack {
            Form {
                Section("Workspace Details") {
                    TextField("Name", text: $newProjectName)
                        .onChange(of: newProjectName) { saveCreateDraft() }

                    HStack {
                        TextField("Folder Path (optional)", text: $newProjectPath)
                            .onChange(of: newProjectPath) { saveCreateDraft() }

                        Button("Browse...") {
                            chooseFolder { path in
                                newProjectPath = path
                                if newProjectName.isEmpty {
                                    newProjectName = URL(fileURLWithPath: path).lastPathComponent
                                }
                                saveCreateDraft()
                            }
                        }
                    }
                }

                if let err = createError {
                    Text(err).font(.caption).foregroundStyle(.red)
                }
            }
            .formStyle(.grouped)
            .navigationTitle("Register Workspace")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") {
                        showCreateSheet = false
                    }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Register") {
                        Task {
                            do {
                                _ = try await store.createWorkspace(name: newProjectName, path: newProjectPath.isEmpty ? nil : newProjectPath)
                                clearCreateDraft()
                                showCreateSheet = false
                            } catch {
                                createError = error.localizedDescription
                            }
                        }
                    }
                    .disabled(newProjectName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || store.isMutatingWorkspace)
                }
            }
            .frame(width: 480, height: 260)
        }
    }

    // MARK: - Edit Sheet

    private func editProjectSheet(_ project: WorkspaceProject, store: WorkStore) -> some View {
        NavigationStack {
            Form {
                Section("Workspace Settings") {
                    TextField("Name", text: $editProjectName)

                    HStack {
                        TextField("Folder Path", text: $editProjectPath)

                        Button("Browse...") {
                            chooseFolder { path in
                                editProjectPath = path
                            }
                        }
                    }
                }

                if let err = editError {
                    Text(err).font(.caption).foregroundStyle(.red)
                }
            }
            .formStyle(.grouped)
            .navigationTitle("Edit Workspace")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") {
                        editingProject = nil
                    }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        Task {
                            do {
                                _ = try await store.updateWorkspace(
                                    id: project.id,
                                    name: editProjectName,
                                    path: editProjectPath.isEmpty ? nil : editProjectPath
                                )
                                editingProject = nil
                            } catch {
                                editError = error.localizedDescription
                            }
                        }
                    }
                    .disabled(editProjectName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || store.isMutatingWorkspace)
                }
            }
            .frame(width: 480, height: 260)
        }
    }

    // MARK: - Native Folder Picker

    private func chooseFolder(completion: @escaping (String) -> Void) {
        let panel = NSOpenPanel()
        panel.canChooseFiles = false
        panel.canChooseDirectories = true
        panel.allowsMultipleSelection = false
        panel.canCreateDirectories = true
        panel.prompt = "Choose"

        if panel.runModal() == .OK, let url = panel.url {
            completion(url.path)
        }
    }

    // MARK: - Draft Management

    private func saveCreateDraft() {
        model.drafts.save(newProjectName, namespace: "workspace-name", projectID: nil, entityID: "new")
        model.drafts.save(newProjectPath, namespace: "workspace-path", projectID: nil, entityID: "new")
    }

    private func restoreCreateDraft() {
        if let name = model.drafts.load(namespace: "workspace-name", projectID: nil, entityID: "new"), !name.isEmpty {
            newProjectName = name
        }
        if let path = model.drafts.load(namespace: "workspace-path", projectID: nil, entityID: "new"), !path.isEmpty {
            newProjectPath = path
        }
    }

    private func clearCreateDraft() {
        model.drafts.remove(namespace: "workspace-name", projectID: nil, entityID: "new")
        model.drafts.remove(namespace: "workspace-path", projectID: nil, entityID: "new")
        newProjectName = ""
        newProjectPath = ""
        createError = nil
    }
}
