import SwiftUI
import AppKit
import KnowMeCore

public struct MarkdownHeadingItem: Identifiable, Hashable, Sendable {
    public let id: String
    public let level: Int
    public let title: String
}

public struct MarkdownReferenceItem: Identifiable, Hashable, Sendable {
    public var id: String { "\(type):\(target)" }
    public let type: ReferenceType
    public let title: String
    public let target: String

    public enum ReferenceType: String, Sendable {
        case docWikiLink = "Doc link"
        case taskMention = "Task mention"
        case externalURL = "Web link"
    }
}

public enum MarkdownBlock: Identifiable, Sendable {
    case heading(level: Int, text: String)
    case paragraph(text: String)
    case blockquote(text: String)
    case codeBlock(language: String, code: String)
    case mermaidBlock(source: String)
    case taskItem(isCompleted: Bool, text: String)
    case listItem(number: Int?, text: String)
    case image(alt: String, url: String)
    case table(headers: [String], rows: [[String]])
    case divider

    public var id: String {
        switch self {
        case .heading(let l, let t): return "h-\(l)-\(t.hashValue)"
        case .paragraph(let t): return "p-\(t.hashValue)"
        case .blockquote(let t): return "q-\(t.hashValue)"
        case .codeBlock(let l, let c): return "code-\(l)-\(c.hashValue)"
        case .mermaidBlock(let s): return "mermaid-\(s.hashValue)"
        case .taskItem(let c, let t): return "task-\(c)-\(t.hashValue)"
        case .listItem(let n, let t): return "list-\(n ?? 0)-\(t.hashValue)"
        case .image(let a, let u): return "img-\(a)-\(u)"
        case .table(let h, _): return "table-\(h.joined())"
        case .divider: return "hr-\(UUID().uuidString)"
        }
    }
}

public enum MarkdownParser {
    public static func extractHeadings(from markdown: String) -> [MarkdownHeadingItem] {
        parseBlocks(from: markdown).enumerated().compactMap { index, block in
            guard case .heading(let level, let title) = block else { return nil }
            return MarkdownHeadingItem(id: "markdown-block-\(index)", level: level, title: title)
        }
    }

    public static func extractReferences(from markdown: String) -> [MarkdownReferenceItem] {
        MarkdownReferences.extract(from: markdown)
    }

    private static func heading(_ text: String) -> (level: Int, text: String)? {
        let level = text.prefix(while: { $0 == "#" }).count
        guard (1...6).contains(level) else { return nil }
        let tail = text.dropFirst(level)
        guard tail.isEmpty || tail.first?.isWhitespace == true else { return nil }
        return (level, tail.trimmingCharacters(in: .whitespaces))
    }

    public static func parseBlocks(from markdown: String) -> [MarkdownBlock] {
        var blocks: [MarkdownBlock] = []
        let lines = markdown.components(separatedBy: .newlines)
        var i = 0

        while i < lines.count {
            let line = lines[i]
            let trimmed = line.trimmingCharacters(in: .whitespaces)

            // Blank line
            if trimmed.isEmpty {
                i += 1
                continue
            }

            // Code blocks
            if trimmed.hasPrefix("```") || trimmed.hasPrefix("~~~") {
                let marker = trimmed.first!
                let fenceLength = trimmed.prefix(while: { $0 == marker }).count
                let language = String(trimmed.dropFirst(fenceLength)).trimmingCharacters(in: .whitespaces).lowercased()
                var codeLines: [String] = []
                i += 1
                while i < lines.count {
                    let next = lines[i]
                    let closing = next.trimmingCharacters(in: .whitespaces)
                    if closing.prefix(while: { $0 == marker }).count >= fenceLength && closing.allSatisfy({ $0 == marker }) {
                        i += 1
                        break
                    }
                    codeLines.append(next)
                    i += 1
                }
                let code = codeLines.joined(separator: "\n")
                if language == "mermaid" {
                    blocks.append(.mermaidBlock(source: code))
                } else {
                    blocks.append(.codeBlock(language: language, code: code))
                }
                continue
            }

            // ATX headings require whitespace after the opening markers.
            if let heading = heading(trimmed) {
                blocks.append(.heading(level: heading.level, text: heading.text))
                i += 1
                continue
            }

            // Horizontal rule
            if trimmed == "---" || trimmed == "***" || trimmed == "___" {
                blocks.append(.divider)
                i += 1
                continue
            }

            // Standalone image: ![alt](url)
            if trimmed.hasPrefix("![") && trimmed.hasSuffix(")") {
                if let openParen = trimmed.firstIndex(of: "("),
                   let closeBracket = trimmed.firstIndex(of: "]"),
                   openParen > closeBracket {
                    let alt = String(trimmed[trimmed.index(trimmed.startIndex, offsetBy: 2)..<closeBracket])
                    let url = String(trimmed[trimmed.index(after: openParen)..<trimmed.index(before: trimmed.endIndex)])
                    blocks.append(.image(alt: alt, url: url))
                    i += 1
                    continue
                }
            }

            // Blockquote
            if trimmed.hasPrefix(">") {
                var quoteLines: [String] = []
                while i < lines.count {
                    let qLine = lines[i].trimmingCharacters(in: .whitespaces)
                    if qLine.hasPrefix(">") {
                        quoteLines.append(String(qLine.dropFirst()).trimmingCharacters(in: .whitespaces))
                        i += 1
                    } else {
                        break
                    }
                }
                blocks.append(.blockquote(text: quoteLines.joined(separator: "\n")))
                continue
            }

            // Task list item: - [ ] or - [x]
            if trimmed.hasPrefix("- [ ] ") || trimmed.hasPrefix("- [x] ") || trimmed.hasPrefix("- [X] ") {
                let isCompleted = !trimmed.hasPrefix("- [ ] ")
                let text = String(trimmed.dropFirst(6))
                blocks.append(.taskItem(isCompleted: isCompleted, text: text))
                i += 1
                continue
            }

            // Unordered list item
            if trimmed.hasPrefix("- ") || trimmed.hasPrefix("* ") || trimmed.hasPrefix("+ ") {
                let text = String(trimmed.dropFirst(2))
                blocks.append(.listItem(number: nil, text: text))
                i += 1
                continue
            }

            // Ordered list item
            if let dotIndex = trimmed.firstIndex(of: "."),
               let num = Int(trimmed[..<dotIndex]),
               trimmed[dotIndex...].hasPrefix(". ") {
                let text = String(trimmed[trimmed.index(dotIndex, offsetBy: 2)...])
                blocks.append(.listItem(number: num, text: text))
                i += 1
                continue
            }

            // Table check
            if trimmed.hasPrefix("|") && trimmed.hasSuffix("|") && i + 1 < lines.count {
                let nextLine = lines[i + 1].trimmingCharacters(in: .whitespaces)
                if nextLine.hasPrefix("|") && nextLine.contains("---") {
                    let headers = trimmed.split(separator: "|").map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }
                    i += 2 // Skip header and separator
                    var rows: [[String]] = []
                    while i < lines.count {
                        let rowLine = lines[i].trimmingCharacters(in: .whitespaces)
                        if rowLine.hasPrefix("|") && rowLine.hasSuffix("|") {
                            let cells = rowLine.split(separator: "|").map { $0.trimmingCharacters(in: .whitespaces) }
                            rows.append(cells)
                            i += 1
                        } else {
                            break
                        }
                    }
                    blocks.append(.table(headers: headers, rows: rows))
                    continue
                }
            }

            // General Paragraph
            var paragraphLines: [String] = []
            while i < lines.count {
                let pLine = lines[i]
                let pTrimmed = pLine.trimmingCharacters(in: .whitespaces)
                if pTrimmed.isEmpty ||
                    heading(pTrimmed) != nil ||
                    pTrimmed.hasPrefix("```") || pTrimmed.hasPrefix("~~~") ||
                    pTrimmed.hasPrefix(">") ||
                    pTrimmed.hasPrefix("- ") ||
                    pTrimmed.hasPrefix("* ") ||
                    pTrimmed == "---" {
                    break
                }
                paragraphLines.append(pTrimmed)
                i += 1
            }
            if !paragraphLines.isEmpty {
                blocks.append(.paragraph(text: paragraphLines.joined(separator: " ")))
            }
        }

        return blocks
    }
}

public struct MarkdownView: View {
    public let content: String
    public let client: APIClient?
    public var onSelectHeading: ((String) -> Void)?

    public init(content: String, client: APIClient? = nil, onSelectHeading: ((String) -> Void)? = nil) {
        self.content = content
        self.client = client
        self.onSelectHeading = onSelectHeading
    }

    public var body: some View {
        let blocks = MarkdownParser.parseBlocks(from: content)

        if blocks.isEmpty {
            Text("No document content.").foregroundStyle(.secondary).padding()
        } else {
            VStack(alignment: .leading, spacing: 14) {
                ForEach(Array(blocks.enumerated()), id: \.offset) { index, block in
                    Group {
                    switch block {
                    case .heading(let level, let text):
                        headingView(level: level, text: text)
                    case .paragraph(let text):
                        paragraphView(text: text)
                    case .blockquote(let text):
                        blockquoteView(text: text)
                    case .codeBlock(let language, let code):
                        codeBlockView(language: language, code: code)
                    case .mermaidBlock(let source):
                        mermaidNoticeView(source: source)
                    case .taskItem(let isCompleted, let text):
                        taskItemView(isCompleted: isCompleted, text: text)
                    case .listItem(let number, let text):
                        listItemView(number: number, text: text)
                    case .image(let alt, let url):
                        imageView(alt: alt, url: url)
                    case .table(let headers, let rows):
                        tableView(headers: headers, rows: rows)
                    case .divider:
                        Divider().padding(.vertical, 8)
                    }
                    }.id("markdown-block-\(index)")
                }
            }
        }
    }

    @ViewBuilder
    private func headingView(level: Int, text: String) -> some View {
        let font: Font = switch level {
        case 1: .title.weight(.bold)
        case 2: .title2.weight(.semibold)
        case 3: .title3.weight(.semibold)
        case 4: .headline
        case 5: .subheadline.weight(.semibold)
        default: .subheadline
        }

        Text(text)
            .font(font)
            .textSelection(.enabled)
            .padding(.top, level <= 2 ? 8 : 4)
    }

    private func paragraphView(text: String) -> some View {
        Text(MarkdownReferences.attributed(text))
            .font(.body)
            .textSelection(.enabled)
            .lineSpacing(4)
    }

    private func blockquoteView(text: String) -> some View {
        HStack(alignment: .top, spacing: 12) {
            Rectangle()
                .fill(WorkspaceStyle.accent)
                .frame(width: 4)
            Text(MarkdownReferences.attributed(text))
                .font(.callout)
                .foregroundStyle(.secondary)
                .textSelection(.enabled)
                .lineSpacing(3)
        }
        .padding(.vertical, 2)
    }

    private func codeBlockView(language: String, code: String) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                Text(language.isEmpty ? "code" : language.uppercased())
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(.secondary)
                Spacer()
                Button {
                    NSPasteboard.general.clearContents()
                    NSPasteboard.general.setString(code, forType: .string)
                } label: {
                    Label("Copy", systemImage: "doc.on.doc")
                        .font(.caption2)
                }
                .buttonStyle(.borderless)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 6)
            .background(Color.secondary.opacity(0.08))

            ScrollView(.horizontal, showsIndicators: true) {
                Text(code)
                    .font(.system(.body, design: .monospaced))
                    .textSelection(.enabled)
                    .padding(12)
            }
        }
        .background(Color.secondary.opacity(0.04))
        .clipShape(RoundedRectangle(cornerRadius: 6))
        .overlay(
            RoundedRectangle(cornerRadius: 6)
                .stroke(Color.secondary.opacity(0.18), lineWidth: 1)
        )
    }

    private func mermaidNoticeView(source: String) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Image(systemName: "diagram")
                    .foregroundStyle(WorkspaceStyle.accent)
                Text("Mermaid Diagram")
                    .font(.caption.weight(.semibold))
                Spacer()
                Text("Diagram rendering requires a browser engine; raw source shown")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 6)
            .background(WorkspaceStyle.accent.opacity(0.1))

            ScrollView(.horizontal, showsIndicators: true) {
                Text(source)
                    .font(.system(.caption, design: .monospaced))
                    .textSelection(.enabled)
                    .padding(10)
            }
        }
        .clipShape(RoundedRectangle(cornerRadius: 6))
        .overlay(
            RoundedRectangle(cornerRadius: 6)
                .stroke(WorkspaceStyle.accent.opacity(0.3), lineWidth: 1)
        )
    }

    private func taskItemView(isCompleted: Bool, text: String) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
            Image(systemName: isCompleted ? "checkmark.circle.fill" : "circle")
                .foregroundStyle(isCompleted ? WorkspaceStyle.accent : .secondary)
                .font(.body)
            Text(MarkdownReferences.attributed(text))
                .strikethrough(isCompleted)
                .foregroundStyle(isCompleted ? .secondary : .primary)
                .textSelection(.enabled)
        }
    }

    private func listItemView(number: Int?, text: String) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
            if let number {
                Text("\(number).")
                    .font(.callout.monospacedDigit())
                    .foregroundStyle(.secondary)
                    .frame(minWidth: 20, alignment: .trailing)
            } else {
                Text("•")
                    .font(.title3)
                    .foregroundStyle(.secondary)
                    .frame(minWidth: 16, alignment: .center)
            }
            Text(MarkdownReferences.attributed(text))
                .font(.body)
                .textSelection(.enabled)
        }
    }

    private func imageView(alt: String, url: String) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            AuthenticatedImageView(pathOrURL: url, client: client)
                .frame(maxHeight: 400)
                .clipShape(RoundedRectangle(cornerRadius: 6))
                .overlay(
                    RoundedRectangle(cornerRadius: 6)
                        .stroke(Color.secondary.opacity(0.2), lineWidth: 1)
                )
            if !alt.isEmpty {
                Text(alt)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
    }

    private func tableView(headers: [String], rows: [[String]]) -> some View {
        ScrollView(.horizontal, showsIndicators: true) {
            Grid(alignment: .leading, horizontalSpacing: 16, verticalSpacing: 8) {
                GridRow {
                    ForEach(Array(headers.enumerated()), id: \.offset) { _, header in
                        Text(header)
                            .font(.headline)
                            .padding(.vertical, 4)
                    }
                }
                Divider()
                ForEach(Array(rows.enumerated()), id: \.offset) { _, row in
                    GridRow {
                        ForEach(Array(row.enumerated()), id: \.offset) { _, cell in
                            Text(cell)
                                .font(.body)
                                .textSelection(.enabled)
                        }
                    }
                }
            }
            .padding(10)
            .background(Color.secondary.opacity(0.03))
            .clipShape(RoundedRectangle(cornerRadius: 6))
        }
    }
}
