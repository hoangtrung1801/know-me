import Foundation
import Observation
import KnowMeCore

enum AuditTab: String, CaseIterable, Identifiable {
    case recent = "Recent Activity"
    case stats = "Statistics"

    var id: String { rawValue }
    var symbol: String {
        switch self {
        case .recent: "clock"
        case .stats: "chart.bar"
        }
    }
}

@MainActor
@Observable
final class AuditStore {
    let model: AppModel

    var selectedTab: AuditTab = .recent
    var events: [AuditEvent] = []
    var stats: AuditStats?
    var isLoading = false
    var errorMessage: String?

    // Filters
    var toolFilter: String = ""
    var resultFilter: String = ""
    var limit: Int = 100 // Backend clamps at 500 max
    var availableTools: [String] = []

    // Expanded detail rows in Recent tab
    var expandedEventIDs: Set<String> = []

    init(model: AppModel) {
        self.model = model
    }

    func toggleExpanded(_ id: String) {
        if expandedEventIDs.contains(id) {
            expandedEventIDs.remove(id)
        } else {
            expandedEventIDs.insert(id)
        }
    }

    func refresh() async {
        switch selectedTab {
        case .recent:
            await fetchRecent()
        case .stats:
            await fetchStats()
        }
    }

    func fetchRecent() async {
        guard model.connected else { return }
        isLoading = true
        errorMessage = nil
        let revision = model.workspace

        var query: [String: String] = [
            // Backend hard clamps limit to 500 (auditMaxRecent)
            "limit": "\(min(max(limit, 1), 500))"
        ]
        if !toolFilter.isEmpty {
            query["tool"] = toolFilter
        }
        if !resultFilter.isEmpty {
            query["result"] = resultFilter
        }

        do {
            let response: AuditRecentResponse = try await model.decode(
                path: "/api/audit/recent",
                query: query,
                projectScoped: false
            )
            guard model.workspace == revision else { return }
            self.events = response.events

            // Update unique available tools
            var tools = Set(response.events.map(\.toolName))
            if let currentTool = toolFilter.isEmpty ? nil : toolFilter {
                tools.insert(currentTool)
            }
            self.availableTools = tools.sorted()
        } catch {
            guard model.workspace == revision else { return }
            self.errorMessage = "Failed to load audit events: \(error.localizedDescription)"
        }
        isLoading = false
    }

    func fetchStats() async {
        guard model.connected else { return }
        isLoading = true
        errorMessage = nil
        let revision = model.workspace

        var query: [String: String] = [:]
        if !toolFilter.isEmpty {
            query["tool"] = toolFilter
        }

        do {
            let loaded: AuditStats = try await model.decode(
                path: "/api/audit/stats",
                query: query,
                projectScoped: false
            )
            guard model.workspace == revision else { return }
            self.stats = loaded
        } catch {
            guard model.workspace == revision else { return }
            self.errorMessage = "Failed to load audit statistics: \(error.localizedDescription)"
        }
        isLoading = false
    }
}
