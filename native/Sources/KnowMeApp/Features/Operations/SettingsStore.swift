import Foundation
import SwiftUI
import Observation
import KnowMeCore

@MainActor
@Observable
final class SettingsStore {
    let model: AppModel

    var selectedCategory: SettingsCategory = .connection
    var config = ProjectConfig()
    var isLoading = false
    var isSaving = false
    var saveStatusMessage: String?
    var saveErrorMessage: String?
    var hasUnsavedChanges = false
    private var originalConfig: JSONValue = .object([:])
    private var baselineConfig = ProjectConfig()
    private var rawJSONDirty = false
    private var configDraftID: String { model.client?.baseURL.absoluteString ?? model.serverAddress }

    // Raw JSON supplementary editor
    var rawJSONText: String = ""
    var rawJSONError: String?
    var isSavingJSON = false

    // Link Classifier
    var classifierSettings = ClassifierConfigDTO()
    var classifierApiKeyInput = ""
    var classifierBusy = false
    var classifierResult: String?
    var classifierSuccess: Bool?

    // OMP
    var ompStatus: OMPStatus?
    var ompLoading = false
    var ompError: String?

    // OpenCode
    var openCodeStatus: OpenCodeRuntimeStatus?
    var openCodeLoading = false
    var openCodeError: String?

    // Runtime services
    var runtimeServices: [RuntimeService] = []
    var servicesLoading = false
    var servicesError: String?

    // Security
    var isPasswordProtected = false
    var passwordBusy = false
    var passwordError: String?
    var passwordSuccess: String?
    var newPasswordInput = ""

    // UI helper inputs
    var newStatusInput = ""
    var newLabelInput = ""

    init(model: AppModel) {
        self.model = model
    }

    // MARK: - Lifecycle & Loading

    func loadAll() async {
        guard model.connected else { return }
        isLoading = true
        saveErrorMessage = nil
        let revision = model.workspace

        async let configTask: Void = loadConfig(revision: revision)
        async let authTask: Void = loadAuthStatus(revision: revision)
        async let classifierTask: Void = loadClassifierSettings(revision: revision)
        async let ompTask: Void = loadOMPStatus(revision: revision)
        async let openCodeTask: Void = loadOpenCodeStatus(revision: revision)
        async let servicesTask: Void = loadRuntimeServices(revision: revision)

        _ = await (configTask, authTask, classifierTask, ompTask, openCodeTask, servicesTask)

        guard model.workspace == revision else { return }
        isLoading = false
    }

    func loadConfig(revision: WorkspaceRevision? = nil) async {
        guard model.connected else { return }
        guard !hasUnsavedChanges else {
            saveStatusMessage = "Unsaved settings kept. Save or discard them before reloading."
            return
        }
        let currentRevision = revision ?? model.workspace
        do {
            let result = try await model.request(method: .GET, path: "/api/config", projectScoped: false)
            guard model.workspace == currentRevision else { return }

            try acceptConfiguration(result, recoverDraft: true)
        } catch {
            guard model.workspace == currentRevision else { return }
            saveErrorMessage = "Failed to load config: \(error.localizedDescription)"
        }
    }

    private func acceptConfiguration(_ response: JSONValue, recoverDraft: Bool = false) throws {
        let editable = EditableConfiguration.editable(response)
        let full = response["config"].objectValue != nil ? response["config"] : response
        let loaded = try full.decoded(ProjectConfig.self)
        originalConfig = editable
        baselineConfig = loaded
        rawJSONDirty = false
        self.config = loaded
        self.hasUnsavedChanges = false
        let text = EditableConfiguration.text(editable)
        if recoverDraft {
            if let draft = model.drafts.load(namespace: "settings_raw_json", projectID: nil, entityID: configDraftID), draft != text {
                self.rawJSONText = draft
                self.saveStatusMessage = "Restored unsaved JSON draft"
                self.hasUnsavedChanges = true
                self.rawJSONDirty = true
            } else { self.rawJSONText = text }
        } else { self.rawJSONText = text }
    }

    // MARK: - Saving Config Forms

    func markDirty() {
        hasUnsavedChanges = true
        saveStatusMessage = nil
        saveErrorMessage = nil
    }

    func discardChanges() {
        config = baselineConfig
        rawJSONText = EditableConfiguration.text(originalConfig)
        rawJSONDirty = false
        hasUnsavedChanges = false
        rawJSONError = nil
        saveErrorMessage = nil
        saveStatusMessage = "Unsaved changes discarded"
        model.drafts.remove(namespace: "settings_raw_json", projectID: nil, entityID: configDraftID)
    }

    func saveConfig() async {
        guard model.connected, !isSaving else { return }
        guard !rawJSONDirty else {
            saveErrorMessage = "Apply or discard your JSON edits before saving form changes."
            return
        }
        isSaving = true
        saveErrorMessage = nil
        saveStatusMessage = nil
        let revision = model.workspace

        do {
            let encodedConfig = EditableConfiguration.patch(original: originalConfig, baseline: try JSONValue.encoded(baselineConfig), edited: try JSONValue.encoded(config))
            let result = try await model.request(method: .PATCH, path: "/api/config", body: encodedConfig, projectScoped: false)
            guard model.workspace == revision else { return }

            try acceptConfiguration(result)
            model.drafts.remove(namespace: "settings_raw_json", projectID: nil, entityID: configDraftID)
            hasUnsavedChanges = false
            let formatter = DateFormatter()
            formatter.timeStyle = .medium
            saveStatusMessage = "Saved at \(formatter.string(from: Date()))"
        } catch {
            guard model.workspace == revision else { return }
            saveErrorMessage = error.localizedDescription
        }
        isSaving = false
    }

    // MARK: - Raw JSON Editor

    func updateRawJSON(_ newText: String) {
        rawJSONText = newText
        rawJSONError = nil
        hasUnsavedChanges = true
        rawJSONDirty = true
        if let data = newText.data(using: .utf8), let value = try? JSONDecoder().decode(JSONValue.self, from: data), !EditableConfiguration.containsCredentials(value) {
            model.drafts.save(newText, namespace: "settings_raw_json", projectID: nil, entityID: configDraftID)
        } else {
            model.drafts.remove(namespace: "settings_raw_json", projectID: nil, entityID: configDraftID)
        }
    }

    func saveRawJSON() async {
        guard model.connected, !isSavingJSON else { return }
        guard let data = rawJSONText.data(using: .utf8) else {
            rawJSONError = "Encoding error: could not read text as UTF-8."
            return
        }

        let parsedValue: JSONValue
        do {
            parsedValue = try JSONDecoder().decode(JSONValue.self, from: data)
        } catch {
            rawJSONError = "Invalid JSON syntax: \(error.localizedDescription)"
            return
        }

        isSavingJSON = true
        rawJSONError = nil
        let revision = model.workspace

        do {
            guard parsedValue.objectValue != nil else { throw APIError(status: 0, message: "Configuration must be a JSON object.") }
            let result = try await model.request(method: .PATCH, path: "/api/config", body: EditableConfiguration.editable(parsedValue), projectScoped: false)
            guard model.workspace == revision else { return }

            try acceptConfiguration(result)
            model.drafts.remove(namespace: "settings_raw_json", projectID: nil, entityID: configDraftID)
            hasUnsavedChanges = false
            let formatter = DateFormatter()
            formatter.timeStyle = .medium
            saveStatusMessage = "JSON configuration applied at \(formatter.string(from: Date()))"
        } catch {
            guard model.workspace == revision else { return }
            rawJSONError = error.localizedDescription
        }
        isSavingJSON = false
    }

    // MARK: - Task Statuses & Columns

    func addStatus() {
        let trimmed = newStatusInput.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !trimmed.isEmpty else { return }
        var current = config.statuses ?? ["todo", "in-progress", "done"]
        guard !current.contains(trimmed) else {
            newStatusInput = ""
            return
        }
        current.append(trimmed)
        config.statuses = current

        // Set default color
        var colors = config.statusColors ?? [:]
        if colors[trimmed] == nil {
            colors[trimmed] = "gray"
            config.statusColors = colors
        }

        // Add to visible columns by default
        var visible = config.visibleColumns ?? current
        if !visible.contains(trimmed) {
            visible.append(trimmed)
            config.visibleColumns = visible
        }

        newStatusInput = ""
        markDirty()
        Task { await saveConfig() }
    }

    func removeStatus(_ status: String) {
        var current = config.statuses ?? []
        current.removeAll { $0 == status }
        config.statuses = current

        var colors = config.statusColors ?? [:]
        colors.removeValue(forKey: status)
        config.statusColors = colors

        var visible = config.visibleColumns ?? []
        visible.removeAll { $0 == status }
        config.visibleColumns = visible

        markDirty()
        Task { await saveConfig() }
    }

    func setStatusColor(_ status: String, color: String) {
        var colors = config.statusColors ?? [:]
        colors[status] = color
        config.statusColors = colors
        markDirty()
        Task { await saveConfig() }
    }

    func toggleVisibleColumn(_ status: String, isVisible: Bool) {
        var visible = config.visibleColumns ?? config.statuses ?? []
        if isVisible {
            if !visible.contains(status) { visible.append(status) }
        } else {
            visible.removeAll { $0 == status }
        }
        config.visibleColumns = visible
        markDirty()
        Task { await saveConfig() }
    }

    // MARK: - Labels

    func addDefaultLabel() {
        let trimmed = newLabelInput.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        var current = config.defaultLabels ?? []
        if !current.contains(trimmed) {
            current.append(trimmed)
            config.defaultLabels = current
            markDirty()
            Task { await saveConfig() }
        }
        newLabelInput = ""
    }

    func removeDefaultLabel(_ label: String) {
        var current = config.defaultLabels ?? []
        current.removeAll { $0 == label }
        config.defaultLabels = current
        markDirty()
        Task { await saveConfig() }
    }

    // MARK: - Platforms

    func togglePlatform(_ platform: String, enabled: Bool) {
        var current = config.platforms ?? []
        if enabled {
            if !current.contains(platform) { current.append(platform) }
        } else {
            current.removeAll { $0 == platform }
        }
        config.platforms = current
        markDirty()
        Task { await saveConfig() }
    }

    // MARK: - Link Classifier

    func loadClassifierSettings(revision: WorkspaceRevision? = nil) async {
        guard model.connected else { return }
        let currentRevision = revision ?? model.workspace
        do {
            let loaded: ClassifierConfigDTO = try await model.decode(path: "/api/link-classifier", projectScoped: false)
            guard model.workspace == currentRevision else { return }
            self.classifierSettings = loaded
        } catch {
            // Classifier may not be configured yet, keep defaults
        }
    }

    func testClassifier() async {
        guard model.connected, !classifierBusy else { return }
        classifierBusy = true
        classifierResult = nil
        classifierSuccess = nil

        let req = LinkClassifierTestRequest(
            apiBase: classifierSettings.apiBase.trimmingCharacters(in: .whitespacesAndNewlines),
            apiKey: classifierApiKeyInput.trimmingCharacters(in: .whitespacesAndNewlines),
            model: classifierSettings.model.trimmingCharacters(in: .whitespacesAndNewlines)
        )

        do {
            let res: LinkClassifierTestResult = try await model.decode(
                method: .POST,
                path: "/api/link-classifier/test",
                body: try JSONValue.encoded(req),
                projectScoped: false
            )
            classifierSuccess = res.success
            classifierResult = res.success ? "Connection successful! Link classifier is functional." : (res.error ?? "Classifier test failed.")
        } catch {
            classifierSuccess = false
            classifierResult = "Test request failed: \(error.localizedDescription)"
        }
        classifierBusy = false
    }

    func saveClassifier() async {
        guard model.connected, !classifierBusy else { return }
        classifierBusy = true
        classifierResult = nil
        classifierSuccess = nil

        let req = LinkClassifierSaveRequest(
            apiBase: classifierSettings.apiBase.trimmingCharacters(in: .whitespacesAndNewlines),
            apiKey: classifierApiKeyInput.trimmingCharacters(in: .whitespacesAndNewlines),
            model: classifierSettings.model.trimmingCharacters(in: .whitespacesAndNewlines)
        )

        do {
            let saved: ClassifierConfigDTO = try await model.decode(
                method: .PUT,
                path: "/api/link-classifier",
                body: try JSONValue.encoded(req),
                projectScoped: false
            )
            classifierSettings = saved
            classifierApiKeyInput = ""
            classifierSuccess = true
            classifierResult = "Link classifier configuration saved."
        } catch {
            classifierSuccess = false
            classifierResult = "Failed to save: \(error.localizedDescription)"
        }
        classifierBusy = false
    }

    // MARK: - OMP Status

    func loadOMPStatus(revision: WorkspaceRevision? = nil) async {
        guard model.connected else { return }
        let currentRevision = revision ?? model.workspace
        ompLoading = true
        ompError = nil

        do {
            // Primary route: /api/omp/status, fallback /api/codex/status
            let status: OMPStatus
            if let omp: OMPStatus = try? await model.decode(path: "/api/omp/status", projectScoped: false) {
                status = omp
            } else {
                status = try await model.decode(path: "/api/codex/status", projectScoped: false)
            }
            guard model.workspace == currentRevision else { return }
            self.ompStatus = status
        } catch {
            guard model.workspace == currentRevision else { return }
            self.ompError = error.localizedDescription
        }
        ompLoading = false
    }

    // MARK: - OpenCode Status

    func loadOpenCodeStatus(revision: WorkspaceRevision? = nil) async {
        guard model.connected else { return }
        let currentRevision = revision ?? model.workspace
        openCodeLoading = true
        openCodeError = nil

        do {
            let status: OpenCodeRuntimeStatus = try await model.decode(path: "/api/opencode/status", projectScoped: false)
            guard model.workspace == currentRevision else { return }
            self.openCodeStatus = status
        } catch {
            guard model.workspace == currentRevision else { return }
            self.openCodeError = error.localizedDescription
        }
        openCodeLoading = false
    }

    // MARK: - Runtime Services

    func loadRuntimeServices(revision: WorkspaceRevision? = nil) async {
        guard model.connected else { return }
        let currentRevision = revision ?? model.workspace
        servicesLoading = true
        servicesError = nil

        do {
            let response: RuntimeServicesResponse = try await model.decode(path: "/api/runtime/services", projectScoped: false)
            guard model.workspace == currentRevision else { return }
            self.runtimeServices = response.services
        } catch {
            guard model.workspace == currentRevision else { return }
            self.servicesError = error.localizedDescription
        }
        servicesLoading = false
    }

    // MARK: - Security & Password

    func loadAuthStatus(revision: WorkspaceRevision? = nil) async {
        guard model.connected else { return }
        let currentRevision = revision ?? model.workspace
        do {
            let auth: AuthStatus = try await model.decode(path: "/api/auth/status", projectScoped: false)
            guard model.workspace == currentRevision else { return }
            self.isPasswordProtected = auth.protected
        } catch {
            // Ignore error
        }
    }

    func setPassword() async {
        guard model.connected, !passwordBusy else { return }
        let pw = newPasswordInput.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !pw.isEmpty else {
            passwordError = "Password cannot be empty."
            return
        }

        passwordBusy = true
        passwordError = nil
        passwordSuccess = nil

        do {
            let req = PasswordSetRequest(password: pw)
            let res: PasswordActionResponse = try await model.decode(
                method: .POST,
                path: "/api/auth/password",
                body: try JSONValue.encoded(req),
                projectScoped: false
            )
            if res.success {
                isPasswordProtected = true
                newPasswordInput = ""
                passwordSuccess = "Password protection enabled."
            } else {
                passwordError = "Server did not confirm password protection."
            }
        } catch {
            passwordError = "Failed to set password: \(error.localizedDescription)"
        }
        passwordBusy = false
    }

    func removePassword() async {
        guard model.connected, !passwordBusy else { return }
        passwordBusy = true
        passwordError = nil
        passwordSuccess = nil

        do {
            let res: PasswordActionResponse = try await model.decode(
                method: .DELETE,
                path: "/api/auth/password",
                projectScoped: false
            )
            if res.success {
                isPasswordProtected = false
                passwordSuccess = "Password protection removed."
            } else {
                passwordError = "Server did not confirm password removal."
            }
        } catch {
            passwordError = "Failed to remove password: \(error.localizedDescription)"
        }
        passwordBusy = false
    }
}
