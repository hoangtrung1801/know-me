import SwiftUI
import KnowMeCore

/// Exported Settings view providing full parity with web configuration forms,
/// supplementary raw JSON editing, and foundation server lifecycle controls.
struct SettingsView: View {
    @Bindable var model: AppModel
    @State private var store: SettingsStore

    init(model: AppModel) {
        self.model = model
        self._store = State(initialValue: SettingsStore(model: model))
    }

    var body: some View {
        NavigationSplitView {
            List(SettingsCategory.allCases, selection: $store.selectedCategory) { category in
                NavigationLink(value: category) {
                    Label(category.label, systemImage: category.icon)
                }
            }
            .navigationTitle("Settings")
            .navigationSplitViewColumnWidth(min: 200, ideal: 220, max: 280)
            .safeAreaInset(edge: .bottom) {
                VStack(alignment: .leading, spacing: 4) {
                    Divider()
                    HStack {
                        Circle()
                            .fill(model.connected ? Color.green : Color.red)
                            .frame(width: 8, height: 8)
                        Text(model.connected ? "Connected" : "Disconnected")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                        Spacer()
                    }
                    .padding(.horizontal, 16)
                    .padding(.vertical, 8)
                }
            }
        } detail: {
            VStack(spacing: 0) {
                // Category Header
                HStack(alignment: .center) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(store.selectedCategory.label)
                            .font(.title2.weight(.semibold))
                        Text(store.selectedCategory.description)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }

                    Spacer()

                    if let msg = store.saveStatusMessage {
                        Text(msg)
                            .font(.caption)
                            .foregroundStyle(.green)
                            .padding(.horizontal, 8)
                            .padding(.vertical, 4)
                            .background(Color.green.opacity(0.1))
                            .clipShape(Capsule())
                    }

                    if let err = store.saveErrorMessage {
                        Text(err)
                            .font(.caption)
                            .foregroundStyle(.red)
                            .padding(.horizontal, 8)
                            .padding(.vertical, 4)
                            .background(Color.red.opacity(0.1))
                            .clipShape(Capsule())
                    }

                    if store.hasUnsavedChanges {
                        Button("Discard Changes") { store.discardChanges() }
                        Button {
                            Task { await store.saveConfig() }
                        } label: {
                            if store.isSaving {
                                ProgressView().controlSize(.small)
                            } else {
                                Label("Save Changes", systemImage: "checkmark.circle.fill")
                            }
                        }
                        .buttonStyle(.borderedProminent)
                        .tint(WorkspaceStyle.accent)
                        .disabled(store.isSaving)
                    }

                    Button {
                        Task { await store.loadAll() }
                    } label: {
                        Image(systemName: "arrow.clockwise")
                    }
                    .buttonStyle(.borderless)
                    .help("Reload settings from server")
                    .disabled(store.isLoading)
                }
                .padding(.horizontal, 24)
                .padding(.vertical, 16)
                .background(.background)

                Divider()

                // Form Content
                Group {
                    switch store.selectedCategory {
                    case .connection:
                        ConnectionSettingsSection(model: model, store: store)
                    case .general:
                        GeneralSettingsSection(store: store)
                    case .lifecycle:
                        LifecycleSettingsSection(store: store)
                    case .board:
                        BoardSettingsSection(store: store)
                    case .search:
                        SearchSettingsSection(store: store)
                    case .classifier:
                        ClassifierSettingsSection(store: store)
                    case .ai:
                        AISettingsSection(store: store)
                    case .runtime:
                        RuntimeSettingsSection(store: store)
                    case .security:
                        SecuritySettingsSection(store: store)
                    case .advanced:
                        AdvancedSettingsSection(store: store)
                    }
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
        .task(id: model.workspaceKey) {
            await store.loadAll()
        }
    }
}
