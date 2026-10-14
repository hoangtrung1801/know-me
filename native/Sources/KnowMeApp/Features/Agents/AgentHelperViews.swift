import SwiftUI
import KnowMeCore

struct ChatToolCallView: View {
    let toolCall: ChatToolCallDTO
    @State private var isExpanded = false

    var body: some View {
        DisclosureGroup(isExpanded: $isExpanded) {
            VStack(alignment: .leading, spacing: 8) {
                if let input = toolCall.input, input != .null {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Input").font(.caption.weight(.semibold)).foregroundStyle(.secondary)
                        Text(formatJSON(input))
                            .font(.system(.caption, design: .monospaced))
                            .padding(8)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .background(Color.secondary.opacity(0.08))
                            .clipShape(RoundedRectangle(cornerRadius: 6))
                            .textSelection(.enabled)
                    }
                }

                if let output = toolCall.output, !output.isEmpty {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Output").font(.caption.weight(.semibold)).foregroundStyle(.secondary)
                        ScrollView(.vertical) {
                            Text(output)
                                .font(.system(.caption, design: .monospaced))
                                .padding(8)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .textSelection(.enabled)
                        }
                        .frame(maxHeight: 180)
                        .background(Color.secondary.opacity(0.08))
                        .clipShape(RoundedRectangle(cornerRadius: 6))
                    }
                }
            }
            .padding(.top, 6)
        } label: {
            HStack(spacing: 8) {
                statusIcon
                Text(toolCall.title ?? toolCall.name)
                    .font(.subheadline.weight(.medium))
                Spacer()
                Text(toolCall.name)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(10)
        .background(Color.secondary.opacity(0.05))
        .clipShape(RoundedRectangle(cornerRadius: 8))
        .overlay(
            RoundedRectangle(cornerRadius: 8)
                .stroke(Color.secondary.opacity(0.2), lineWidth: 1)
        )
    }

    @ViewBuilder
    private var statusIcon: some View {
        switch toolCall.status {
        case "loading":
            ProgressView()
                .controlSize(.mini)
        case "error":
            Image(systemName: "exclamationmark.circle.fill")
                .foregroundStyle(.red)
        default:
            Image(systemName: "checkmark.circle.fill")
                .foregroundStyle(.green)
        }
    }

    private func formatJSON(_ val: JSONValue) -> String {
        switch val {
        case .string(let s): return s
        case .object(let obj):
            let pairs = obj.map { "\($0.key): \(formatJSON($0.value))" }
            return "{\n  " + pairs.joined(separator: ",\n  ") + "\n}"
        case .array(let arr):
            return "[\n  " + arr.map { formatJSON($0) }.joined(separator: ",\n  ") + "\n]"
        default:
            return "\(val)"
        }
    }
}

struct ChatQuestionView: View {
    let questionBlock: ChatQuestionBlockDTO
    let onReply: ([[String]]) -> Void
    let onReject: () -> Void

    @State private var selectedSelections: [Int: Set<String>] = [:]

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Label("Question from Agent", systemImage: "questionmark.bubble")
                .font(.headline)
                .foregroundStyle(WorkspaceStyle.accent)

            ForEach(Array(questionBlock.prompts.enumerated()), id: \.offset) { index, prompt in
                VStack(alignment: .leading, spacing: 8) {
                    if let header = prompt.header, !header.isEmpty {
                        Text(header).font(.subheadline.weight(.semibold))
                    }
                    Text(prompt.question).font(.body)

                    VStack(alignment: .leading, spacing: 6) {
                        ForEach(prompt.options, id: \.label) { option in
                            let isSelected = selectedSelections[index]?.contains(option.label) ?? false
                            Button {
                                toggleOption(promptIndex: index, label: option.label, multiple: prompt.multiple ?? false)
                            } label: {
                                HStack(alignment: .top, spacing: 8) {
                                    Image(systemName: isSelected ? "checkmark.square.fill" : "square")
                                        .foregroundStyle(isSelected ? WorkspaceStyle.accent : .secondary)
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(option.label).font(.subheadline)
                                        if let desc = option.description {
                                            Text(desc).font(.caption).foregroundStyle(.secondary)
                                        }
                                    }
                                }
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
                .padding(10)
                .background(Color.secondary.opacity(0.04))
                .clipShape(RoundedRectangle(cornerRadius: 6))
            }

            HStack(spacing: 12) {
                Button("Submit Answer") {
                    let answers = questionBlock.prompts.indices.map { idx in
                        Array(selectedSelections[idx] ?? [])
                    }
                    onReply(answers)
                }
                .buttonStyle(.borderedProminent)
                .tint(WorkspaceStyle.accent)

                Button("Reject", role: .destructive) {
                    onReject()
                }
                .buttonStyle(.bordered)
            }
        }
        .padding(14)
        .background(WorkspaceStyle.accent.opacity(0.08))
        .clipShape(RoundedRectangle(cornerRadius: 10))
        .overlay(
            RoundedRectangle(cornerRadius: 10)
                .stroke(WorkspaceStyle.accent.opacity(0.3), lineWidth: 1)
        )
    }

    private func toggleOption(promptIndex: Int, label: String, multiple: Bool) {
        var current = selectedSelections[promptIndex] ?? []
        if multiple {
            if current.contains(label) { current.remove(label) }
            else { current.insert(label) }
        } else {
            current = [label]
        }
        selectedSelections[promptIndex] = current
    }
}

struct DiffViewer: View {
    let diff: String?
    let dirtyFiles: [String]

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            if !dirtyFiles.isEmpty {
                VStack(alignment: .leading, spacing: 6) {
                    Text("Modified Files (\(dirtyFiles.count))")
                        .font(.headline)
                    ForEach(dirtyFiles, id: \.self) { file in
                        HStack(spacing: 6) {
                            Image(systemName: "doc")
                                .foregroundStyle(.secondary)
                            Text(file)
                                .font(.system(.caption, design: .monospaced))
                                .textSelection(.enabled)
                        }
                    }
                }
                .padding(12)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(Color.secondary.opacity(0.05))
                .clipShape(RoundedRectangle(cornerRadius: 8))
            }

            if let diff, !diff.isEmpty {
                VStack(alignment: .leading, spacing: 6) {
                    Text("Unified Diff")
                        .font(.headline)
                    ScrollView([.horizontal, .vertical]) {
                        VStack(alignment: .leading, spacing: 2) {
                            ForEach(Array(diff.components(separatedBy: "\n").enumerated()), id: \.offset) { _, line in
                                diffLineView(line)
                            }
                        }
                        .padding(10)
                        .frame(maxWidth: .infinity, alignment: .leading)
                    }
                    .frame(minHeight: 200, maxHeight: 400)
                    .background(Color(NSColor.textBackgroundColor))
                    .clipShape(RoundedRectangle(cornerRadius: 8))
                    .overlay(
                        RoundedRectangle(cornerRadius: 8)
                            .stroke(Color.secondary.opacity(0.2), lineWidth: 1)
                    )
                }
            } else {
                Text("No changes or diff not yet computed.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
        }
    }

    @ViewBuilder
    private func diffLineView(_ line: String) -> some View {
        let (fg, bg): (Color, Color) = {
            if line.hasPrefix("+") && !line.hasPrefix("+++") {
                return (Color.green, Color.green.opacity(0.12))
            } else if line.hasPrefix("-") && !line.hasPrefix("---") {
                return (Color.red, Color.red.opacity(0.12))
            } else if line.hasPrefix("@@") {
                return (Color.blue, Color.blue.opacity(0.12))
            } else {
                return (Color.primary, Color.clear)
            }
        }()

        Text(line)
            .font(.system(.caption, design: .monospaced))
            .foregroundStyle(fg)
            .padding(.horizontal, 4)
            .padding(.vertical, 1)
            .background(bg)
            .textSelection(.enabled)
    }
}
