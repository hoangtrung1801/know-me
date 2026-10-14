import Foundation
import KnowMeCore

// MARK: - Document DTOs

public struct DocMetadata: Codable, Sendable, Equatable {
    public var title: String
    public var description: String?
    public var createdAt: String?
    public var updatedAt: String?
    public var tags: [String]
    public var order: Int?

    public init(
        title: String = "",
        description: String? = nil,
        createdAt: String? = nil,
        updatedAt: String? = nil,
        tags: [String] = [],
        order: Int? = nil
    ) {
        self.title = title
        self.description = description
        self.createdAt = createdAt
        self.updatedAt = updatedAt
        self.tags = tags
        self.order = order
    }
}

public struct DocItem: Codable, Sendable, Identifiable, Equatable {
    public var id: String { "\(projectId ?? "global"):\(path)" }
    public var filename: String?
    public var path: String
    public var projectId: String?
    public var folder: String?
    public var metadata: DocMetadata
    public var content: String
    public var isImported: Bool?
    public var source: String?

    public var title: String {
        if !metadata.title.isEmpty { return metadata.title }
        if let filename = filename, !filename.isEmpty {
            return (filename as NSString).deletingPathExtension
        }
        return (path as NSString).lastPathComponent
    }

    public init(
        filename: String? = nil,
        path: String,
        projectId: String? = nil,
        folder: String? = nil,
        metadata: DocMetadata = DocMetadata(),
        content: String = "",
        isImported: Bool? = nil,
        source: String? = nil
    ) {
        self.filename = filename
        self.path = path
        self.projectId = projectId
        self.folder = folder
        self.metadata = metadata
        self.content = content
        self.isImported = isImported
        self.source = source
    }
}

public struct DocsListResponse: Codable, Sendable {
    public let docs: [DocItem]
}

public struct DocCreatePayload: Codable, Sendable {
    public var title: String
    public var path: String?
    public var folder: String?
    public var description: String?
    public var content: String
    public var tags: [String]
    public var global: Bool

    public init(
        title: String,
        path: String? = nil,
        folder: String? = nil,
        description: String? = nil,
        content: String = "",
        tags: [String] = [],
        global: Bool = false
    ) {
        self.title = title
        self.path = path
        self.folder = folder
        self.description = description
        self.content = content
        self.tags = tags
        self.global = global
    }
}

public struct DocUpdatePayload: Codable, Sendable {
    public var title: String?
    public var description: String?
    public var content: String?
    public var tags: [String]?
    public var path: String?
    public var projectId: String?
    public var section: String?

    public init(
        title: String? = nil,
        description: String? = nil,
        content: String? = nil,
        tags: [String]? = nil,
        path: String? = nil,
        projectId: String? = nil,
        section: String? = nil
    ) {
        self.title = title
        self.description = description
        self.content = content
        self.tags = tags
        self.path = path
        self.projectId = projectId
        self.section = section
    }
}

// MARK: - Document History & Diff & Restore DTOs

public struct DocChange: Codable, Sendable, Equatable {
    public let field: String
    public let oldValue: JSONValue?
    public let newValue: JSONValue?
}

public struct DocChangeScope: Codable, Sendable, Equatable {
    public let type: String
    public let field: String?
    public let section: String?
    public let summary: String?
    public let oldBytes: Int?
    public let newBytes: Int?
    public let deltaBytes: Int?
}

public struct DocHistoryGap: Codable, Sendable, Equatable {
    public let type: String
    public let reason: String
    public let count: Int
    public let beforeVersion: String?
    public let afterVersion: String?
    public let appliedAt: String?
}

public struct DocVersion: Codable, Sendable, Identifiable, Equatable {
    public let id: String
    public let docId: String?
    public let docPath: String
    public let currentPath: String?
    public let previousPath: String?
    public let version: Int
    public let timestamp: String
    public let author: String?
    public let actor: String?
    public let source: String?
    public let auditEventId: String?
    public let sessionId: String?
    public let baseHash: String?
    public let newHash: String?
    public let checkpoint: Bool?
    public let changes: [DocChange]?
    public let changedScopes: [DocChangeScope]?
}

public struct DocVersionHistory: Codable, Sendable, Equatable {
    public let docId: String?
    public let docPath: String
    public let currentPath: String?
    public let currentVersion: Int
    public let versions: [DocVersion]
    public let retentionGaps: [DocHistoryGap]?
}

public struct DocRevisionDiff: Codable, Sendable, Equatable {
    public let docId: String?
    public let docPath: String
    public let currentPath: String?
    public let revisionId: String
    public let previousRevisionId: String?
    public let version: DocVersion
    public let checkpoint: Bool
    public let changes: [DocChange]
    public let changedScopes: [DocChangeScope]?
    public let retentionGaps: [DocHistoryGap]?
}

public struct DocRestoreRequest: Codable, Sendable {
    public let revision: String
    public let section: String?
    public let mode: String?

    public init(revision: String, section: String? = nil, mode: String? = "document") {
        self.revision = revision
        self.section = section
        self.mode = mode
    }
}

public struct DocRestoreResponse: Codable, Sendable {
    public let restored: Bool
    public let doc: DocItem
    public let history: DocVersionHistory?
}

// MARK: - Asset DTOs

public struct AssetResponse: Codable, Sendable {
    public let filename: String
    public let url: String
    public let name: String?
}

// MARK: - Link DTOs

public struct SavedLink: Codable, Sendable, Identifiable, Equatable {
    public let id: String
    public var url: String
    public var title: String?
    public var description: String?
    public var note: String?
    public var image: String?
    public var tags: [String]?
    public let createdAt: String
    public let updatedAt: String

    public var displayTitle: String {
        if let title, !title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            return title
        }
        return url
    }
}

public struct RankedLink: Codable, Sendable, Identifiable, Equatable {
    public var id: String { link.id }
    public let link: SavedLink
    public let score: Double?
    public let matchedBy: [String]?

    public init(from decoder: Decoder) throws {
        // The Go server embeds models.Link directly into RankedLink
        let container = try decoder.singleValueContainer()
        self.link = try container.decode(SavedLink.self)
        let rankedContainer = try decoder.container(keyedBy: CodingKeys.self)
        self.score = try rankedContainer.decodeIfPresent(Double.self, forKey: .score)
        self.matchedBy = try rankedContainer.decodeIfPresent([String].self, forKey: .matchedBy)
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        try container.encode(link)
    }

    private enum CodingKeys: String, CodingKey {
        case score
        case matchedBy
    }
}

public struct LinkSearchResponse: Codable, Sendable {
    public let links: [RankedLink]
    public let mode: String
    public let fallback: Bool
}

public struct LinkClassifierStatus: Codable, Sendable, Equatable {
    public let apiBase: String
    public let model: String
    public let configured: Bool
}

public struct LinkClassifierSettings: Codable, Sendable {
    public var apiBase: String
    public var apiKey: String
    public var model: String

    public init(apiBase: String = "", apiKey: String = "", model: String = "") {
        self.apiBase = apiBase
        self.apiKey = apiKey
        self.model = model
    }
}

public struct LinkClassifierTestResponse: Codable, Sendable {
    public let success: Bool
    public let error: String?
}

// MARK: - Memo DTOs

public struct MemoItem: Codable, Sendable, Identifiable, Equatable {
    public let id: String
    public var content: String
    public let createdAt: String
    public let updatedAt: String

    public init(id: String, content: String, createdAt: String, updatedAt: String) {
        self.id = id
        self.content = content
        self.createdAt = createdAt
        self.updatedAt = updatedAt
    }

    public var tags: [String] {
        guard let regex = try? NSRegularExpression(pattern: #"(?:^|\s)#([\p{L}\p{N}_-]+)"#) else { return [] }
        let nsContent = content as NSString
        let matches = regex.matches(in: content, range: NSRange(location: 0, length: nsContent.length))
        return matches.compactMap { match in
            guard match.numberOfRanges > 1 else { return nil }
            return nsContent.substring(with: match.range(at: 1))
        }
    }
}

// MARK: - Local Annotations

public enum AnnotationType: String, Codable, Sendable, CaseIterable {
    case comment = "comment"
    case suggestion = "suggestion"
    case issue = "issue"

    public var title: String {
        switch self {
        case .comment: return "Comment"
        case .suggestion: return "Suggestion"
        case .issue: return "Issue"
        }
    }

    public var symbol: String {
        switch self {
        case .comment: return "bubble.left"
        case .suggestion: return "lightbulb"
        case .issue: return "exclamationmark.triangle"
        }
    }
}

public struct LocalAnnotation: Codable, Sendable, Identifiable, Equatable {
    public let id: String
    public let docPath: String
    public var selectedText: String
    public var content: String
    public var type: AnnotationType
    public let createdAt: String

    public init(
        id: String = UUID().uuidString,
        docPath: String,
        selectedText: String,
        content: String,
        type: AnnotationType = .comment,
        createdAt: String = ISO8601DateFormatter().string(from: Date())
    ) {
        self.id = id
        self.docPath = docPath
        self.selectedText = selectedText
        self.content = content
        self.type = type
        self.createdAt = createdAt
    }
}
