# Work Domain Delivery Report

**Date:** 14 October 2026<br>
**Task ID:** `task_cbf8ba4943fb`<br>
**Dispatch ID:** `ctx_428ef362e90e`<br>
**Owner:** Work Feature Worker<br>
**Canonical Task:** `qjhpsg` (child of `clnn6l`, macOS native workspace plan)

---

## 1. Executive Summary

Implemented the complete Work domain for the native macOS KnowMe app under Swift 6 strict concurrency on macOS 14+. The implementation is located strictly within `native/Sources/KnowMeApp/Features/Work/**` and exports `OverviewView(model:)`, `ProjectsView(model:)`, `TasksView(model:)`, and `SearchView(model:)` using `AppModel`.

All reachable web actions across the 14 Parity.json Work domain groups (`work.1` through `work.14`) were implemented with real Go server contracts: real dashboard analytics, KPI cards, work aging, and activity feed; project registry CRUD with native macOS `NSOpenPanel` folder selection; task list and board views with shared selection, sorting, filtering, reordering, and status transitions; complete task detail with description draft recovery, acceptance criteria checklist, spec link & sync, implementation notes, child subtasks, timer control (start/pause/resume/stop/manual log), version history, lifecycle archive/unarchive preview & execute, capability-gated hard delete with confirmation reason, and scoped search with navigable results.

Contract and serialization verification passed (`WORK_VERIFICATION_PASSED`) via self-contained harness `WorkFeatureVerification` with zero compiler warnings or errors in the Work domain.

---

## 2. Exported Signatures & Integration Contracts

The following views are exported by the Work feature module for consumption by the coordinator's router, toolbar, and sheets:

```swift
// Overview & Dashboard
struct OverviewView: View {
    init(model: AppModel)
}

// Workspace Registry & CRUD
struct ProjectsView: View {
    init(model: AppModel)
}

// Task Management (List, Board, Inspector, Lifecycle)
struct TasksView: View {
    init(model: AppModel)
}

// Scoped Search
struct SearchView: View {
    init(model: AppModel)
}
```

### Layout & Contextual Inspector Integration

In alignment with the coordinator's layout guidance:
- `RootView` provides the outer global navigation sidebar and toolbar.
- `TasksView` avoids duplicate global sidebars. It incorporates a contextual right-hand detail inspector panel (`TaskDetailInspector`) docked side-by-side with the List or Board views when `model.inspectorVisible` is `true`.
- Shared selection: Selecting any task in either Table/List mode or Kanban Board mode updates `store.selectedTaskID`, immediately populating the docked inspector.
- When `model.inspectorVisible` is toggled off, tasks can still be inspected via double-click or detail trigger in a focused sheet.

### Agent Task ID Handoff

In accordance with `native/CONTRACT.md`:
- Task-specific OMP views belong to the Agents domain. Work does not import unexported or in-flight agent views.
- `TaskDetailModal` and `TaskDetailInspector` display an **Agent Execution Ready** handoff banner.
- Handoff Contract: The banner exposes `task.id` and provides a 1-click transition button calling `model.navigate(.chat)`. When the coordinator wires `AgentRunView(model:taskID:)`, `store.selectedTaskID` serves as the primary parameter.

### Search Navigation Requirements

`SearchView` categorizes search hits returned by `GET /api/search` and routes clicks as follows:
- **Tasks (`type: "task"`):** Sets `store.selectedTaskID = hit.id`, dismisses search sheet (`model.showSearch = false`), and navigates to `model.navigate(.tasks)`.
- **Documents (`type: "doc"`):** Dismisses search sheet and navigates to `model.navigate(.documents)`.
- **Memories / Decisions (`type: "memory"`, `type: "decision"`):** Display title, score, and snippet. Requires coordinator to wire knowledge sub-routes or detail sheets once Knowledge views export specific memory/decision anchors.
- **Code Symbols (`type: "code"`):** Displays symbol name, signature, and relevance score. Navigation requirement: coordinator or platform handler can invoke `NSWorkspace.shared.open(...)` on the resolved source path or open within external editor.

---

## 3. Per-Action Audit and Parity Evidence (work.1 – work.14)

| ID | Action | Status | Contract / Endpoints | Web Source | Native Implementation Files |
|---|---|---|---|---|---|
| `work.1` | Task list and detail | `implemented` | `GET /api/tasks`, `GET /api/tasks/{id}` | `ui/src/pages/TasksPage.tsx`, `TaskDetailSheet.tsx` | `TasksView.swift`, `WorkStore.swift`, `Models.swift` |
| `work.2` | Task creation and editing | `implemented` | `POST /api/tasks`, `PUT /api/tasks/{id}` | `TasksPage.tsx`, `TaskDetailSheet.tsx` | `TasksView.swift`, `WorkStore.swift`, `Models.swift` |
| `work.3` | List filters grouping and sorting | `implemented` | Client-side & query filters (`projectId`, `includeHistorical`) | `TasksPage.tsx`, `KanbanPage.tsx` | `TasksView.swift`, `WorkStore.swift` |
| `work.4` | Board status moves and ordering | `implemented` | `PUT /api/tasks/{id}`, `POST /api/tasks/reorder` | `KanbanPage.tsx`, `kanbanSort.ts` | `TasksView.swift`, `WorkStore.swift`, `Models.swift` |
| `work.5` | Acceptance criteria and spec fulfillment | `implemented` | `PUT /api/tasks/{id}`, `POST /api/tasks/sync-spec-acs` | `TaskAcceptanceCriteria.tsx`, `client.ts` | `TasksView.swift`, `WorkStore.swift`, `Models.swift` |
| `work.6` | Task hierarchy and relationships | `implemented` | `parent`, `subtasks` fields in Task DTO | `TaskSidebar.tsx`, `TaskDetailSheet.tsx` | `TasksView.swift`, `Models.swift` |
| `work.7` | History and changes | `implemented` | `GET /api/tasks/{id}/history` | `TaskHistoryPanel.tsx`, `client.ts` | `TasksView.swift`, `WorkStore.swift`, `Models.swift` |
| `work.8` | Archive and unarchive preview execute | `implemented` | `POST /api/tasks/{id}/archive`, `POST /api/tasks/{id}/unarchive` | `TaskLifecycleDialog.tsx`, `TaskDetailSheet.tsx` | `TasksView.swift`, `WorkStore.swift`, `Models.swift` |
| `work.9` | Batch lifecycle actions | `implemented` | `POST /api/tasks/batch-archive`, `POST /api/tasks/batch-unarchive` | `TasksPage.tsx`, `KanbanPage.tsx` | `TasksView.swift`, `WorkStore.swift`, `Models.swift` |
| `work.10` | Capability-gated hard delete | `implemented` | `POST /api/tasks/{id}/hard-delete` | `TaskHardDeleteDialog.tsx`, `TaskDetailSheet.tsx` | `TasksView.swift`, `WorkStore.swift`, `Models.swift` |
| `work.11` | Timer start pause resume stop manual entry | `implemented` | `GET /api/time/status`, `POST /api/time/start`, `POST /api/time/stop`, `POST /api/time/pause`, `POST /api/time/resume`, `POST /api/time/add` | `useTimeTracker.ts`, `TimeTrackingLogs.tsx`, `DashboardPage.tsx` | `TasksView.swift`, `OverviewView.swift`, `WorkStore.swift`, `Models.swift` |
| `work.12` | Dashboard real activity and navigation | `implemented` | `GET /api/tasks`, `GET /api/activities`, `GET /api/time/status` | `DashboardPage.tsx`, `analytics.ts` | `OverviewView.swift`, `WorkStore.swift`, `Models.swift` |
| `work.13` | Project registry CRUD and selection | `implemented` | `GET /api/workspaces`, `POST /api/workspaces`, `PATCH /api/workspaces/{id}`, `DELETE /api/workspaces/{id}`, `POST /api/workspaces/switch` | `ProjectsPage.tsx`, `client.ts` | `ProjectsView.swift`, `WorkStore.swift`, `Models.swift` |
| `work.14` | Search filters scope fallback and result navigation | `implemented` | `GET /api/search` (`q`, `limit`, `type`, `mode`, `projectId`) | `SearchCommandDialog.tsx`, `client.ts` | `SearchView.swift`, `WorkStore.swift`, `Models.swift` |

---

## 4. Verification Evidence

### 4.1. Swift 6 Strict Concurrency Compilation

Ran Swift compiler on Work files against the built `KnowMeCore` target:

```sh
swiftc -typecheck \
  -swift-version 6 \
  -strict-concurrency=complete \
  -target arm64-apple-macos14.0 \
  -I native/.build/arm64-apple-macosx/debug/Modules \
  native/Sources/KnowMeApp/Shared/AppModel.swift \
  native/Sources/KnowMeApp/Shared/WorkspaceViews.swift \
  native/Sources/KnowMeApp/Features/Work/*.swift
```

**Result:** Passed with 0 errors and 0 warnings.

### 4.2. Runtime Contract & Serialization Test Suite

Executed the built verification binary (`WorkFeatureVerification.runVerification()`) linking `KnowMeCore` object files:

```sh
swiftc \
  -swift-version 6 \
  -strict-concurrency=complete \
  -target arm64-apple-macos14.0 \
  -I native/.build/arm64-apple-macosx/debug/Modules \
  native/.build/arm64-apple-macosx/debug/KnowMeCore.build/*.o \
  native/Sources/KnowMeApp/Shared/AppModel.swift \
  native/Sources/KnowMeApp/Shared/WorkspaceViews.swift \
  native/Sources/KnowMeApp/Features/Work/*.swift \
  -e 'WorkFeatureVerification.runVerification(); print("WORK_VERIFICATION_PASSED")' \
  -o /tmp/work_verify && /tmp/work_verify
```

**Result:**
```text
WORK_VERIFICATION_PASSED
```

Tested scenarios:
1. `TaskItem` JSON decoding from real server shape, nil/empty array normalization, AC completion percentage calculation, lifecycle state derivation.
2. `ActiveTimerItem` elapsed time calculation for live timers and paused timers with `totalPausedMs`.
3. `LifecycleResponse` and `LifecycleItemResult` decoding with eligibility reasons (`active_timer`, `unfinished_descendant`) and warnings.
4. `TaskVersionHistoryResponse` and `TaskChangeItem` decoding with snapshot diffs.
5. `ActivityFeedResponse` decoding denormalized task activity history.
6. `SearchResponsePayload` decoding across multi-entity result sets.

---

## 5. Concurrent Source Build Findings

When executing package-wide `swift build --package-path native`, the build failed due to errors in unowned feature directories:
1. **Duplicate declaration:** `Features/Knowledge/KnowledgeTypes.swift:285` and `Features/Operations/OperationsDTOs.swift:210` both declare `public struct LinkClassifierSettings`, causing ambiguous lookup errors in `SettingsStore.swift` and `LinkStore.swift`.
2. **Missing Color constant:** `Features/Agents/ChatView.swift:319` references `.amber` which does not exist on `ShapeStyle`.
3. **Invalid optional binding:** `Features/Agents/AgentStore.swift:341, 372, 382, 389` attempts `guard let ... = json["key"].stringValue` where `stringValue` returns non-optional `String`, and `let ... = json["message"]` where subscript returns non-optional `JSONValue`.
4. **Actor isolation violation:** `Features/Agents/AgentService.swift:152` invokes actor-isolated `APIClient.webSocket` synchronously from a `@MainActor` context.

As instructed by the coordinator contract, Work files were strictly isolated, kept internal, and did not edit other feature paths.

---

## 6. Backend Change Proposals & Scope Findings

1. **Activity Feed Project Scoping (`GET /api/activities`):**
   - *Finding:* `internal/server/routes/activities.go` currently reads `ListRecentActivities(limit, typeFilter)` without taking a `projectId` parameter. As a result, the activity feed reflects all tasks across the global store regardless of selected workspace.
   - *Proposal:* Add `projectId := r.URL.Query().Get("projectId")` to `ActivityRoutes.list` and pass it to `ListRecentActivities` for consistent workspace scoping.

2. **Task Reorder Scoping (`POST /api/tasks/reorder`):**
   - *Finding:* `internal/server/routes/tasks.go` resolves tasks by query `projectId`, but batch ordering is an integer index.
   - *Proposal:* Ensure `order` sequence is evaluated per-project so reordering tasks in one workspace does not interleave with another workspace's manual order.

3. **Search Sub-store Project Scoping (`GET /api/search`):**
   - *Finding:* In `internal/search/`, task search filters by `projectId`, but memory and decision sub-stores do not filter by project ID.
   - *Proposal:* Propagate `opts.ProjectID` to memory/decision indexing stores or clearly label those results as global in search payload metadata.
