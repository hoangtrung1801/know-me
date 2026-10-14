# Shared Swift interface and OMP ownership

The Codex coordinator owns `Package.swift`, `Sources/KnowMeCore`, `Sources/KnowMeApp/{App,Shared}`, tests under `KnowMeCoreTests`, packaging, this contract, and `Parity.json`. Feature workers must not edit those paths, commit/push changes, modify the web app, or mutate user records. Ask the coordinator for a shared API change.

All feature views live in the executable module and take `model: AppModel`. `AppModel` is `@MainActor @Observable`, so use `@Bindable var model: AppModel` in SwiftUI. Import `KnowMeCore` for transport types. Workers define their domain-specific typed Codable/Sendable DTOs and stores inside their owned feature directories.

## Foundation APIs

```swift
// AppModel, MainActor
model.client: APIClient?                 // read-only
model.connected: Bool
model.projects: [WorkspaceProject]       // read-only
model.selectedProject: WorkspaceProject?
model.workspace: WorkspaceRevision       // capture before an async operation
model.workspaceKey: String               // use as .task(id:) for scope resets
model.eventSequence: UInt64              // invalidate/refetch on change, debounce noisy streams
model.recentEvents: [ServerEvent]         // bounded to 100, not complete transcript history
model.drafts: DraftStore
model.errorMessage: String?
model.report(error)                      // ignores CancellationError
model.navigate(.tasks)                   // Destination enum, see AppModel.swift
await model.selectProject(idOrNil)
try await model.reloadProjects()
try await model.request(method: .GET, path: "/api/tasks", query: [:], body: nil, projectScoped: true)
try await model.decode(MyDTO.self, method: .GET, path: "/api/...", query: [:], body: nil, projectScoped: false)
```

`projectScoped: true` injects captured `projectId` into the query, and into an object body when supplied; it rejects responses after a workspace change. It does not make an endpoint support project scoping. Audit route handlers first. Global-library operations use `false`; all-project context has no `projectId`. Store snapshot mutations must also check captured revision before applying success state or clearing a draft. Cancellation does not mean a server mutation was rolled back; never retry implicitly.

`APIClient` is an actor with `nonisolated baseURL`. It provides async `request`, generic `decode`, `upload(method:path:parts:)`, `download(path:query:)`, `events()`, and `webSocket(path:query:)`. UploadPart takes name, optional filename, MIME type and Data. The returned WebSocket task is already resumed; the caller owns receive-loop cancellation and closing. Streaming and upload callers using the client directly must capture/check workspace revision themselves.

`APIClient.segment(id)` encodes one identifier; `documentPath(path)` retains folder separators. Paths passed to the client start with `/` and exclude query/fragment syntax. Use a query dictionary. `APIError` exposes status, message and optional JSON payload; keep lifecycle denial reasons visible.

`JSONValue` supports Codable/Sendable/Equatable, object/array/string/number/bool/null, `value["key"]`, `arrayValue`, `stringValue`, `boolValue`, `numberValue`, `decoded(T.self)`, and `encoded(value)`. Use typed DTOs for records; JSONValue is for extensible payloads/raw configuration.

`DraftStore` methods load/save/remove take namespace, projectID and entityID. A nil projectID means global scope. Remove recovery text only after a confirmed successful save, preserve drafts on errors/disconnect, and do not store credentials.

`WorkspaceStyle.accent`, `FeaturePendingView(title:symbol:)` and native SwiftUI controls are shared. Use accessible labels, real loading/empty/error/retry states, explicit save feedback, keyboard support, and a suitable macOS layout. Use the inspector for contextual detail rather than imitating web card grids.

## Worker exports and paths

| Owner | Editable paths | Exported views |
| --- | --- | --- |
| Work | `Features/Work/**` | `OverviewView`, `ProjectsView`, `TasksView`, `SearchView` |
| Knowledge | `Features/Knowledge/**` | `DocumentsView`, `LinksView`, `MemosView` |
| Agents | `Features/Agents/**` | `ChatView`, `AgentRunView` |
| Operations | `Features/Operations/**` | `SettingsView`, `AuditView` |

Each exported view uses `init(model: AppModel)` except an additional task-specific initializer for AgentRunView as needed, reported to the coordinator. Workers can create corresponding test sources in their feature directory as plain source fixtures or request a dedicated test target from the coordinator. Do not add test imports to the app target. Report verification and parity changes in `native/reports/<domain>.md`; do not concurrently edit the central parity ledger.

The coordinator wires routes/search/sheets/inspectors and runs final integration after settlement. Agents expose task plan/diff review as an exported view; Work must not import a yet-unavailable agent view. Provide task ID handoff requirements in the report. Raw JSON debugging is supplementary, not a substitute for native feature interfaces. If backend behavior blocks a workflow, report the source evidence and the minimal proposed fix.
