import Foundation

/// Native links for the task/document notation used by the web editor.
/// Ranges stay in UTF-16 coordinates so Unicode prose and excluded code remain aligned.
enum MarkdownReferences {
    struct Match {
        let range: NSRange
        let reference: MarkdownReferenceItem
    }

    static func matches(in markdown: String) -> [Match] {
        let source = markdown as NSString
        var excluded: [NSRange] = []
        var fence: (marker: Character, count: Int)?
        var offset = 0
        for line in markdown.components(separatedBy: "\n") {
            let trimmed = line.trimmingCharacters(in: .whitespacesAndNewlines)
            let marker = trimmed.first
            let count = marker.map { char in trimmed.prefix(while: { $0 == char }).count } ?? 0
            let length = (line as NSString).length
            if let open = fence {
                excluded.append(NSRange(location: offset, length: length))
                if marker == open.marker && count >= open.count && trimmed.allSatisfy({ $0 == open.marker }) { fence = nil }
            } else if (marker == "`" || marker == "~") && count >= 3 {
                fence = (marker!, count)
                excluded.append(NSRange(location: offset, length: length))
            }
            offset += length + 1
        }
        func ranges(_ pattern: String) -> [NSTextCheckingResult] {
            guard let regex = try? NSRegularExpression(pattern: pattern) else { return [] }
            return regex.matches(in: markdown, range: NSRange(location: 0, length: source.length))
        }
        excluded += ranges(#"(`+)[^\n]*?\1"#).map(\.range)
        var result: [Match] = []
        func append(_ match: NSTextCheckingResult, _ ref: MarkdownReferenceItem) {
            guard !excluded.contains(where: { NSIntersectionRange($0, match.range).length > 0 }),
                  !result.contains(where: { NSIntersectionRange($0.range, match.range).length > 0 }),
                  !ref.target.isEmpty else { return }
            result.append(Match(range: match.range, reference: ref))
        }
        for match in ranges(#"\[\[([^\]\n]+)\]\]"#) {
            let parts = source.substring(with: match.range(at: 1)).split(separator: "|", maxSplits: 1).map(String.init)
            let target = parts[0].trimmingCharacters(in: .whitespaces)
            append(match, MarkdownReferenceItem(type: .docWikiLink, title: parts.count > 1 ? parts[1] : target, target: documentTarget(target)))
        }
        // Ordinary Markdown links are already interactive; don't nest mention links in them.
        for match in ranges(#"!?\[([^\]]*)\]\(([^)]+)\)"#) {
            let target = source.substring(with: match.range(at: 2))
            if !source.substring(with: match.range).hasPrefix("!"), target.hasPrefix("https://") || target.hasPrefix("http://") {
                append(match, MarkdownReferenceItem(type: .externalURL, title: source.substring(with: match.range(at: 1)), target: target))
            }
            excluded.append(match.range)
        }
        for match in ranges(#"(?<![\w@])@task[-/]([a-zA-Z0-9]+(?:\.[a-zA-Z0-9]+)?)(?:\{[a-z-]+\})?(?![\w/]|\.[a-zA-Z0-9])"#) {
            let target = source.substring(with: match.range(at: 1))
            append(match, MarkdownReferenceItem(type: .taskMention, title: source.substring(with: match.range), target: target))
        }
        for match in ranges(#"(?<![\w@])(?:@docs?/|\.?/?\.known?-me/docs/)([^\s,;!?\"'(){}]+)(?:\{[a-z-]+\})?"#) {
            let target = documentTarget(source.substring(with: match.range(at: 1)))
            append(match, MarkdownReferenceItem(type: .docWikiLink, title: source.substring(with: match.range), target: target))
        }
        return result.sorted { $0.range.location < $1.range.location }
    }

    static func documentTarget(_ raw: String) -> String {
        var value = raw.trimmingCharacters(in: .whitespaces)
        while value.hasSuffix(".") || value.hasSuffix(":") { value.removeLast() }
        let parts = value.split(separator: "#", maxSplits: 1, omittingEmptySubsequences: false)
        var path = String(parts[0])
        if path.hasSuffix(".md") { path.removeLast(3) }
        return path + (parts.count > 1 ? "#" + parts[1] : "")
    }

    static func extract(from markdown: String) -> [MarkdownReferenceItem] {
        var seen = Set<String>()
        return matches(in: markdown).compactMap { match in
            seen.insert(match.reference.id).inserted ? match.reference : nil
        }
    }

    static func url(for reference: MarkdownReferenceItem) -> URL? {
        var parts = URLComponents()
        parts.scheme = "knowme-ref"
        parts.host = reference.type == .taskMention ? "task" : "doc"
        parts.queryItems = [URLQueryItem(name: "target", value: reference.target)]
        return parts.url
    }

    static func reference(from url: URL) -> MarkdownReferenceItem? {
        guard url.scheme == "knowme-ref", ["task", "doc"].contains(url.host),
              let target = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems?.first(where: { $0.name == "target" })?.value,
              !target.isEmpty else { return nil }
        return MarkdownReferenceItem(type: url.host == "task" ? .taskMention : .docWikiLink, title: target, target: target)
    }

    static func attributed(_ text: String) -> AttributedString {
        let transformed = NSMutableString(string: text)
        for match in matches(in: text).reversed() where match.reference.type != .externalURL {
            guard let url = url(for: match.reference) else { continue }
            let label = (text as NSString).substring(with: match.range).replacingOccurrences(of: "[", with: "\\[").replacingOccurrences(of: "]", with: "\\]")
            transformed.replaceCharacters(in: match.range, with: "[\(label)](\(url.absoluteString))")
        }
        return (try? AttributedString(markdown: transformed as String, options: .init(interpretedSyntax: .inlineOnlyPreservingWhitespace))) ?? AttributedString(text)
    }
}
