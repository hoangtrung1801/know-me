import Foundation

enum SettingsCategory: String, CaseIterable, Identifiable {
    case connection
    case general
    case lifecycle
    case board
    case search
    case classifier
    case ai
    case runtime
    case security
    case advanced

    var id: String { rawValue }

    var label: String {
        switch self {
        case .connection: "Connection"
        case .general: "General"
        case .lifecycle: "Task Lifecycle"
        case .board: "Board"
        case .search: "Search"
        case .classifier: "Link Classifier"
        case .ai: "AI & Agents"
        case .runtime: "Runtime & Memory"
        case .security: "Security"
        case .advanced: "Advanced & JSON"
        }
    }

    var icon: String {
        switch self {
        case .connection: "network"
        case .general: "gearshape"
        case .lifecycle: "archivebox"
        case .board: "square.grid.3x2"
        case .search: "magnifyingglass"
        case .classifier: "link"
        case .ai: "brain"
        case .runtime: "cpu"
        case .security: "lock.shield"
        case .advanced: "wrench.and.screwdriver"
        }
    }

    var description: String {
        switch self {
        case .connection: "Server connection and app-owned backend lifecycle"
        case .general: "Project metadata, defaults, and preferences"
        case .lifecycle: "Retention, archival, and AI context exclusion"
        case .board: "Kanban statuses, color accents, and column visibility"
        case .search: "Semantic search and embedding vector dimensions"
        case .classifier: "Automated link tagging via OpenAI-compatible API"
        case .ai: "Oh My Pi (OMP) background coding agent and OpenCode server"
        case .runtime: "Managed sub-processes and memory limit queues"
        case .security: "In-memory WebUI password protection"
        case .advanced: "Git tracking, server port, platforms, Chat UI, and raw JSON"
        }
    }
}
