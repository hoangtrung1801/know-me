import SwiftUI
import KnowMeCore

/// Exported Audit view providing full parity with MCP audit activity inspection,
/// event filtering, argument exploration, and aggregate statistics.
struct AuditView: View {
    @Bindable var model: AppModel
    @State private var store: AuditStore

    init(model: AppModel) {
        self.model = model
        self._store = State(initialValue: AuditStore(model: model))
    }

    var body: some View {
        VStack(spacing: 0) {
            // Header Bar
            headerBar
            Divider()

            // Main Content Area
            if store.selectedTab == .recent {
                recentTabContent
            } else {
                statsTabContent
            }
        }
        .task(id: model.workspaceKey) {
            await store.refresh()
        }
    }

    // MARK: - Header Bar

    private var headerBar: some View {
        HStack(alignment: .center, spacing: 16) {
            VStack(alignment: .leading, spacing: 2) {
                Text("MCP Audit Trail")
                    .font(.title2.weight(.semibold))
                Text("Review MCP tool invocations, execution times, argument summaries, and statistics.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            Spacer()

            Picker("View", selection: $store.selectedTab) {
                ForEach(AuditTab.allCases) { tab in
                    Label(tab.rawValue, systemImage: tab.symbol).tag(tab)
                }
            }
            .pickerStyle(.segmented)
            .frame(width: 260)
            .onChange(of: store.selectedTab) { _, _ in
                Task { await store.refresh() }
            }

            Button {
                Task { await store.refresh() }
            } label: {
                if store.isLoading {
                    ProgressView().controlSize(.small)
                } else {
                    Image(systemName: "arrow.clockwise")
                }
            }
            .buttonStyle(.borderless)
            .help("Refresh audit data")
            .disabled(store.isLoading)
        }
        .padding(.horizontal, 24)
        .padding(.vertical, 14)
        .background(.background)
    }

    // MARK: - Recent Activity Tab

    private var recentTabContent: some View {
        VStack(spacing: 0) {
            // Filter Bar
            HStack(spacing: 12) {
                Image(systemName: "line.3.horizontal.decrease.circle")
                    .foregroundStyle(.secondary)

                Picker("Tool", selection: $store.toolFilter) {
                    Text("All Tools").tag("")
                    ForEach(store.availableTools, id: \.self) { tool in
                        Text(tool).tag(tool)
                    }
                }
                .frame(width: 150)
                .onChange(of: store.toolFilter) { _, _ in
                    Task { await store.fetchRecent() }
                }

                Picker("Result", selection: $store.resultFilter) {
                    Text("All Results").tag("")
                    Text("Success").tag("success")
                    Text("Error").tag("error")
                    Text("Denied").tag("denied")
                }
                .frame(width: 130)
                .onChange(of: store.resultFilter) { _, _ in
                    Task { await store.fetchRecent() }
                }

                Picker("Limit", selection: $store.limit) {
                    Text("50 events").tag(50)
                    Text("100 events").tag(100)
                    Text("250 events").tag(250)
                    Text("500 events (Max)").tag(500)
                }
                .frame(width: 140)
                .onChange(of: store.limit) { _, _ in
                    Task { await store.fetchRecent() }
                }

                Spacer()

                Text("\(store.events.count) events loaded")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            .padding(.horizontal, 24)
            .padding(.vertical, 10)
            .background(Color.secondary.opacity(0.04))

            Divider()

            // Events List or Empty/Error State
            if store.isLoading && store.events.isEmpty {
                ProgressView("Loading audit events…")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if let error = store.errorMessage, store.events.isEmpty {
                ContentUnavailableView {
                    Label("Audit activity unavailable", systemImage: "exclamationmark.triangle")
                } description: {
                    Text(error)
                } actions: {
                    Button("Retry", systemImage: "arrow.clockwise") {
                        Task { await store.fetchRecent() }
                    }
                }
            } else if store.events.isEmpty {
                ContentUnavailableView(
                    "No Audit Events Found",
                    systemImage: "clock.badge.xmark",
                    description: Text("No MCP tool events match the selected filters.")
                )
            } else {
                List {
                    ForEach(store.events) { event in
                        AuditEventRow(
                            event: event,
                            isExpanded: store.expandedEventIDs.contains(event.id),
                            onToggle: { store.toggleExpanded(event.id) }
                        )
                        .listRowInsets(EdgeInsets(top: 6, leading: 16, bottom: 6, trailing: 16))
                    }
                }
                .listStyle(.inset)
            }
        }
    }

    // MARK: - Statistics Tab

    private var statsTabContent: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                if store.isLoading && store.stats == nil {
                    ProgressView("Calculating audit statistics…")
                        .frame(maxWidth: .infinity, alignment: .center)
                        .padding(.vertical, 40)
                } else if let error = store.errorMessage, store.stats == nil {
                    ContentUnavailableView {
                        Label("Audit statistics unavailable", systemImage: "exclamationmark.triangle")
                    } description: {
                        Text(error)
                    } actions: {
                        Button("Retry", systemImage: "arrow.clockwise") {
                            Task { await store.fetchStats() }
                        }
                    }
                } else if let stats = store.stats {
                    statsSummaryCards(stats)
                    resultsBreakdown(stats)
                    actionClassesBreakdown(stats)
                    toolsBreakdown(stats)
                }
            }
            .padding(24)
        }
    }

    private func statsSummaryCards(_ stats: AuditStats) -> some View {
        HStack(spacing: 16) {
            MetricCard(
                title: "Total Calls",
                value: "\(stats.totalCalls)",
                detail: "\(stats.dryRunCount) dry-run, \(stats.executeCount) executed",
                icon: "terminal"
            )

            let successCount = stats.byResult["success"] ?? 0
            let rate = stats.totalCalls > 0 ? Int(round(Double(successCount) / Double(stats.totalCalls) * 100)) : 0
            MetricCard(
                title: "Success Rate",
                value: "\(rate)%",
                detail: "\(successCount) of \(stats.totalCalls) calls succeeded",
                icon: "checkmark.seal",
                tint: .green
            )

            MetricCard(
                title: "Dry-Run Invocations",
                value: "\(stats.dryRunCount)",
                detail: "Preview calls without writing disk mutations",
                icon: "eye",
                tint: .blue
            )
        }
    }

    private func resultsBreakdown(_ stats: AuditStats) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Breakdown by Result")
                .font(.headline)

            HStack(spacing: 12) {
                ForEach(stats.byResult.sorted(by: { $0.value > $1.value }), id: \.key) { result, count in
                    HStack(spacing: 8) {
                        Circle()
                            .fill(resultColor(result))
                            .frame(width: 8, height: 8)
                        Text(result.capitalized)
                            .font(.subheadline)
                        Text("\(count)")
                            .font(.subheadline.weight(.semibold))
                    }
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)
                    .background(resultColor(result).opacity(0.1))
                    .clipShape(RoundedRectangle(cornerRadius: 8))
                }
            }
        }
    }

    private func actionClassesBreakdown(_ stats: AuditStats) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Breakdown by Action Class")
                .font(.headline)

            HStack(spacing: 8) {
                ForEach(stats.byActionClass.sorted(by: { $0.value > $1.value }), id: \.key) { cls, count in
                    HStack(spacing: 6) {
                        Text(cls)
                            .font(.subheadline)
                            .foregroundStyle(classColor(cls))
                        Text("\(count)")
                            .font(.caption.weight(.bold))
                            .foregroundStyle(.secondary)
                    }
                    .padding(.horizontal, 10)
                    .padding(.vertical, 6)
                    .background(Color.secondary.opacity(0.1))
                    .clipShape(RoundedRectangle(cornerRadius: 6))
                }
            }
        }
    }

    private func toolsBreakdown(_ stats: AuditStats) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Invocations by Tool")
                .font(.headline)

            let sortedTools = stats.byTool.sorted(by: { $0.value > $1.value })
            let maxCount = Double(sortedTools.first?.value ?? 1)

            VStack(spacing: 8) {
                ForEach(sortedTools, id: \.key) { tool, count in
                    VStack(alignment: .leading, spacing: 4) {
                        HStack {
                            Text(tool)
                                .font(.system(.subheadline, design: .monospaced))
                            Spacer()
                            if let results = stats.byToolResult[tool] {
                                HStack(spacing: 6) {
                                    ForEach(results.sorted(by: { $0.key < $1.key }), id: \.key) { r, c in
                                        Text("\(r):\(c)")
                                            .font(.caption2)
                                            .foregroundStyle(resultColor(r))
                                    }
                                }
                            }
                            Text("\(count)")
                                .font(.subheadline.weight(.semibold))
                                .frame(width: 40, alignment: .trailing)
                        }

                        GeometryReader { geo in
                            ZStack(alignment: .leading) {
                                RoundedRectangle(cornerRadius: 4)
                                    .fill(Color.secondary.opacity(0.12))
                                    .frame(height: 8)

                                RoundedRectangle(cornerRadius: 4)
                                    .fill(WorkspaceStyle.accent)
                                    .frame(width: max(geo.size.width * CGFloat(Double(count) / maxCount), 4), height: 8)
                            }
                        }
                        .frame(height: 8)
                    }
                    .padding(.vertical, 4)
                }
            }
            .padding(16)
            .background(Color.secondary.opacity(0.04))
            .clipShape(RoundedRectangle(cornerRadius: 10))
        }
    }

    private func resultColor(_ result: String) -> Color {
        switch result.lowercased() {
        case "success": return .green
        case "error": return .red
        case "denied": return .orange
        default: return .gray
        }
    }

    private func classColor(_ cls: String) -> Color {
        switch cls.lowercased() {
        case "read": return .blue
        case "write": return .orange
        case "delete": return .red
        case "generate": return .purple
        case "admin": return .primary
        default: return .secondary
        }
    }
}

// MARK: - Audit Event Row

private struct AuditEventRow: View {
    let event: AuditEvent
    let isExpanded: Bool
    let onToggle: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Button(action: onToggle) {
                HStack(spacing: 12) {
                    Image(systemName: isExpanded ? "chevron.down" : "chevron.right")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                        .frame(width: 12)

                    Image(systemName: resultIcon(event.result))
                        .foregroundStyle(resultColor(event.result))

                    let toolTitle = event.action.map { "\(event.toolName).\($0)" } ?? event.toolName
                    Text(toolTitle)
                        .font(.system(.body, design: .monospaced).weight(.medium))

                    Text(event.result)
                        .font(.caption)
                        .foregroundStyle(resultColor(event.result))

                    Text(event.actionClass)
                        .font(.caption)
                        .foregroundStyle(classColor(event.actionClass))
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(Color.secondary.opacity(0.1))
                        .clipShape(Capsule())

                    if event.dryRun == true {
                        Text("dry-run")
                            .font(.caption2)
                            .foregroundStyle(.blue)
                            .padding(.horizontal, 6)
                            .padding(.vertical, 2)
                            .background(Color.blue.opacity(0.1))
                            .clipShape(Capsule())
                    }

                    Spacer()

                    Text("\(event.durationMs)ms")
                        .font(.system(.caption, design: .monospaced))
                        .foregroundStyle(.secondary)

                    Text(formatTimestamp(event.timestamp))
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            .buttonStyle(.plain)

            if isExpanded {
                VStack(alignment: .leading, spacing: 8) {
                    if let error = event.errorMessage, !error.isEmpty {
                        HStack(alignment: .top, spacing: 6) {
                            Text("Error:").font(.caption.weight(.semibold)).foregroundStyle(.red)
                            Text(error).font(.caption).foregroundStyle(.red)
                        }
                    }

                    if let root = event.projectRoot, !root.isEmpty {
                        HStack(alignment: .top, spacing: 6) {
                            Text("Project Root:").font(.caption.weight(.semibold)).foregroundStyle(.secondary)
                            Text(root).font(.system(.caption, design: .monospaced)).textSelection(.enabled)
                        }
                    }

                    if let refs = event.entityRefs, !refs.isEmpty {
                        HStack(alignment: .top, spacing: 6) {
                            Text("Entities:").font(.caption.weight(.semibold)).foregroundStyle(.secondary)
                            Text(refs.joined(separator: ", ")).font(.caption)
                        }
                    }

                    if let args = event.argumentSummary, !args.isEmpty {
                        VStack(alignment: .leading, spacing: 4) {
                            Text("Arguments:").font(.caption.weight(.semibold)).foregroundStyle(.secondary)
                            ForEach(args.sorted(by: { $0.key < $1.key }), id: \.key) { k, v in
                                HStack(alignment: .top, spacing: 6) {
                                    Text("\(k):").font(.system(.caption2, design: .monospaced)).foregroundStyle(.secondary)
                                    Text(v).font(.system(.caption2, design: .monospaced)).textSelection(.enabled)
                                }
                            }
                        }
                        .padding(8)
                        .background(Color.secondary.opacity(0.06))
                        .clipShape(RoundedRectangle(cornerRadius: 6))
                    }
                }
                .padding(.leading, 24)
                .padding(.top, 4)
            }
        }
        .padding(.vertical, 4)
    }

    private func formatTimestamp(_ raw: String) -> String {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = formatter.date(from: raw) {
            let display = DateFormatter()
            display.dateStyle = .short
            display.timeStyle = .medium
            return display.string(from: date)
        }
        return raw
    }

    private func resultIcon(_ result: String) -> String {
        switch result.lowercased() {
        case "success": return "checkmark.circle.fill"
        case "error": return "xmark.circle.fill"
        case "denied": return "shield.slash.fill"
        default: return "questionmark.circle"
        }
    }

    private func resultColor(_ result: String) -> Color {
        switch result.lowercased() {
        case "success": return .green
        case "error": return .red
        case "denied": return .orange
        default: return .gray
        }
    }

    private func classColor(_ cls: String) -> Color {
        switch cls.lowercased() {
        case "read": return .blue
        case "write": return .orange
        case "delete": return .red
        case "generate": return .purple
        case "admin": return .primary
        default: return .secondary
        }
    }
}

// MARK: - Metric Card

private struct MetricCard: View {
    let title: String
    let value: String
    let detail: String
    let icon: String
    var tint: Color = WorkspaceStyle.accent

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text(title)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                Spacer()
                Image(systemName: icon)
                    .foregroundStyle(tint)
            }
            Text(value)
                .font(.system(.title, design: .rounded).weight(.bold))
                .foregroundStyle(tint)
            Text(detail)
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.secondary.opacity(0.06))
        .clipShape(RoundedRectangle(cornerRadius: 10))
    }
}
