# Persistent App Pages Implementation Plan

> **For agentic workers:** REQUIRED-SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans) to implement this plan.

**Goal:** Keep each visited primary app page mounted while the user switches pages, stop inactive page-specific refresh work, refetch once when a page becomes active again, and restore safe UI state after a full browser reload.

**Architecture:** Add a page-workspace controller above the page components. It owns page identity, lazy page slots, active/inactive transitions, remembered nested routes, and versioned session storage. AppShell renders all visited page slots instead of one keyed page. Pages opt into lifecycle activation and persistent UI-state hooks; network results and operational state remain ephemeral.

**Tech Stack:** React 19, TypeScript, TanStack Router, Vite, sessionStorage, Playwright, Vitest where existing unit-test conventions support it.

**Spec:** docs/superpowers/specs/2026-08-27-persistent-app-pages-design.md

## Global Constraints

- Preserve the existing route URLs and backend/API contracts.
- Keep the URL as the source of truth for the currently visible page and nested route.
- Do not persist API result arrays, loading/error state, request generations, timers, stream handles, or destructive confirmation state.
- Inactive pages must not issue page-specific refresh requests or keep page-specific live streams active.
- A page must perform one authoritative refresh on first mount and one refresh when transitioning from inactive to active.
- Preserve existing loading, error, retry, empty-state, accessibility, and responsive behavior.
- Scope storage to the current browser tab and current workspace; tolerate unavailable, corrupt, stale-version, or wrong-workspace storage.
- Do not stage or modify unrelated existing image changes, artifacts, or other worktree changes.

---

## 1. Establish characterization coverage and shared test helpers

**Files:**
- Add ui/src/lib/pageWorkspaceStorage.test.ts
- Add ui/src/contexts/PageWorkspaceContext.test.tsx
- Add ui/e2e/page-workspace.spec.ts
- Modify ui/e2e/helpers.ts only if a reusable navigation or storage helper is needed.

**Test first:**
- Write storage tests for an empty envelope, round-trip encoding/decoding, version mismatch, wrong workspace, malformed JSON, and sessionStorage access throwing.
- Write lifecycle tests for unvisited to active, active to inactive, inactive to active, stable slot identity, activationId increments, and exactly one activation notification per transition.
- Write an E2E smoke test that visits two primary pages, changes a visible UI control on each, switches between them, and verifies both controls retain their values.
- Add an E2E reload test that changes safe state on at least Docs and Tasks, reloads, and verifies the state is restored.
- Run the new tests before implementation and confirm they fail for the missing modules/behavior.

**Implementation notes:**
- Use the existing Playwright server fixture and Chromium configuration.
- Select deterministic controls already exposed by the pages; do not add test-only production behavior.
- Keep tests independent of backend result ordering and use accessible labels/roles.

**Verification:** cd ui && bun test src/lib/pageWorkspaceStorage.test.ts src/contexts/PageWorkspaceContext.test.tsx; bun run test:e2e -- page-workspace.spec.ts.

---

## 2. Implement the versioned workspace-state codec

**Files:**
- Add ui/src/lib/pageWorkspaceStorage.ts
- Add or extend ui/src/lib/pageWorkspaceStorage.test.ts

**Interface:**
- Define PageId for chat, dashboard, projects, kanban, tasks, docs, graph, memory, links, memos, decisions, audit, imports, and config.
- Define a versioned PageWorkspaceSnapshot envelope containing version, workspaceKey, savedAt, routes, and pages.
- Export pure encodeSnapshot, decodeSnapshot, readSnapshot, writeSnapshot, and clearSnapshot helpers.
- Export a safe workspace-key function using the current workspace identity, preferring a stable workspace/project identifier and falling back to a stable path/name combination.
- Allow each page state value to be JSON-safe and omit entries that cannot be encoded.

**Behavior:**
- Read from sessionStorage key knowns-page-workspace:v1.
- Reject malformed JSON, unsupported versions, and snapshots for another workspace without throwing.
- Debounce responsibility belongs to the React controller; the codec itself remains synchronous and deterministic.
- If sessionStorage is unavailable or throws, return an empty snapshot and make writes no-ops.
- Never store API data or operation state through this module.

**Verification:** Run the codec unit tests, TypeScript checking, and git diff --check.

---

## 3. Build the PageWorkspace controller and lifecycle hooks

**Files:**
- Add ui/src/contexts/PageWorkspaceContext.tsx
- Add ui/src/contexts/PageWorkspaceContext.test.tsx
- Add ui/src/components/templates/PageWorkspace.tsx
- Modify ui/src/router.tsx

**Interface:**
- Provide PageWorkspaceProvider and PageWorkspace.
- Export usePageLifecycle(pageId) returning isActive, activationId, and isHydrated.
- Export usePersistentPageState(pageId, stateKey, initialValue, codec?) returning a React state tuple.
- Export a navigation helper or context method that resolves a page’s remembered route before navigating from a top-level sidebar item.
- Keep page slot components lazy and retain the existing Suspense fallback.

**Slot behavior:**
- Derive the active PageId from the current pathname using the existing AppShell mapping.
- Mount a page slot on first visit and retain it thereafter with a stable PageId key.
- Render inactive visited slots hidden, aria-hidden, and inert so they cannot receive focus or pointer/keyboard interaction.
- Keep only the active slot interactive.
- Record the complete current pathname, search, and hash for the outgoing page before changing active page.
- Increment activationId when a retained page becomes active again.
- Hydrate persisted UI state before exposing the page as ready; missing or invalid fields use their supplied initial values.
- Debounce snapshot writes and flush the latest route/UI snapshot during page changes and unmount when possible.
- Avoid synchronous storage work in render and avoid changing the current URL during initial hydration unless the user explicitly navigates to a page.

**Router integration:**
- Place PageWorkspaceProvider inside the router context and above AppShell.
- Preserve DocsProvider and all existing global providers.
- Keep unknown paths and auth/project guards behaving as they do today.
- Do not use a wrapper keyed by the current page; the PageId is the stable slot identity.

**Verification:** Lifecycle tests pass, the application builds, and manual inspection confirms exactly one visible interactive slot.

---

## 4. Integrate AppShell and sidebar navigation

**Files:**
- Modify ui/src/AppShell.tsx
- Modify ui/src/components/organisms/AppSidebar.tsx
- Modify ui/src/lib/navigation.ts only if the existing route helper cannot preserve query/hash.

**AppShell changes:**
- Replace the single renderPage branch and key={currentPage} wrapper with the PageWorkspace slot registry.
- Keep global task creation, search, workspace picker, task detail sheet, error boundary, and suspense behavior outside the page slots as appropriate.
- Pass existing cross-page props such as task refresh callbacks to the retained slots without introducing duplicate providers.
- Keep page-specific network loading out of AppShell unless it is genuinely global; the existing current-task source should remain globally owned.
- Preserve the current page transition styling without replaying enter animation for every retained-page activation.

**Sidebar changes:**
- Keep the existing menu labels/icons/order.
- On a top-level page click, navigate to the remembered complete route for that PageId when one exists; otherwise use the current base route.
- Keep settings/config route handling and mobile/desktop navigation parity.
- Ensure clicking the currently active item does not loop or erase nested route state.

**Verification:**
- Test all primary sidebar destinations.
- Verify Docs and Tasks return to their last nested route after moving away and back.
- Verify browser back/forward still changes the URL and active slot correctly.

---

## 5. Add lifecycle-aware refresh behavior to page data loaders

**Files:**
- Modify ui/src/pages/DashboardPage.tsx
- Modify ui/src/pages/ProjectsPage.tsx
- Modify ui/src/pages/KanbanPage.tsx
- Modify ui/src/pages/TasksPage.tsx
- Modify ui/src/pages/DocsPage.tsx
- Modify ui/src/pages/GraphPage.tsx
- Modify ui/src/pages/MemoryPage.tsx
- Modify ui/src/pages/LinksPage.tsx
- Modify ui/src/pages/MemosPage.tsx
- Modify ui/src/pages/DecisionPage.tsx
- Modify ui/src/pages/AuditPage.tsx
- Modify ui/src/pages/ImportsPage.tsx
- Modify ui/src/pages/ConfigPage.tsx
- Modify ui/src/pages/chat/useChatPage.ts
- Modify ui/src/pages/ChatPage.tsx when page-level wiring is needed.

**Common rule:**
- Call usePageLifecycle with the page’s PageId.
- Keep the existing first-load request.
- Add an effect keyed by activationId that refreshes authoritative data once for every inactive-to-active transition.
- Gate page-specific polling, refresh timers, SSE-to-page mutations, and stream subscriptions on isActive.
- When inactive, either unsubscribe or mark the page stale; do not fetch in the background.
- Preserve previous data, filters, selections, and scroll while refresh is in flight.
- Ignore stale responses from a request that started before deactivation.
- Do not reset UI state merely because a retained page is hidden or because an external prop is temporarily absent.

**Page-specific work:**
- Dashboard: refresh dashboard aggregates and remote activity on activation; retain period, assignee, and label controls.
- Projects: refresh projects on activation; retain create form and safe dialog state.
- Kanban: refresh project-scoped board data through its existing task source on activation; retain scope, safe panel, and scroll state.
- Tasks: refresh the active task view on activation; retain view mode, project/lifecycle filters, selected task, nested route, and safe panel state. Prevent externalSelectedTask synchronization from clearing a retained selection while the page is inactive.
- Docs: refresh the document/folder index on activation and preserve route, search, spec filter, selected document, wide mode, editor metadata/content drafts, history/preview controls, and scroll. Keep autosave semantics unchanged.
- Imports: refresh import records on activation and stop import-event subscriptions while inactive; retain selection, add draft, and safe add-panel state.
- Graph: refresh graph data on activation and gate event-triggered graph reloads while inactive; retain search, filters, selected node, fullscreen, and viewport.
- Memory: refresh the active memory view on activation; retain subview, query, selected IDs, and safe create/edit state.
- Links: refresh links on activation; retain search, selection, edit/add drafts, and tags.
- Memos: refresh the current memo query on activation; retain query, new/edit drafts, and selection.
- Decisions: refresh the active decision view on activation; retain subview, query, selection, and safe create/edit state.
- Audit: refresh the active audit tab on activation; retain tab, filters, tool/result view, and safe expansion state.
- Chat: retain selected session, URL route, timeline/right-sidebar state, composer draft, model/variant controls, and safe modal state. On activation refresh sessions and reconnect only the active session’s live activity. Mark inactive session activity stale without consuming new events.
- Config: refresh externally sourced settings/status on activation while retaining the active category and safe editable drafts. Do not restore or persist in-flight/destructive operation state.

**Verification:** For each loader, use focused tests or existing page tests to show first mount and activation refresh once, inactive SSE/timer paths make no request, and prior UI state remains visible while a refresh is pending.

---

## 6. Wire persistent UI state without persisting server or operation state

**Files:**
- Modify the page files in Section 5.
- Modify ui/src/pages/chat/useChatPage.ts and ui/src/pages/chat/storage.ts only where the new hook must coexist with existing session storage.
- Add focused tests beside page-specific hooks/components where the repository already has test coverage.

**State mapping:**
- Use stable state keys such as filters, route, selection, layout, scroll, and drafts; do not use React component instance names as keys.
- Store only serializable, safe UI state. Normalize missing values and validate enum-like values before applying them.
- Keep existing per-feature storage compatibility where it already exists, such as Docs per-document scroll and Chat session model/pending-question storage.
- Avoid duplicate ownership: a value must have one authoritative persistence path, with PageWorkspace coordinating the snapshot rather than competing with feature-specific stores.
- Persist debounced draft edits and layout/filter changes; do not persist transient loading indicators or one-time notifications.
- Persist route state through the workspace route map as well as the URL transition recorder, so reload can restore the last route after the user returns to that page.

**Verification:** Reload tests cover representative state from every state category: filters, nested routes, selection, layout, scroll, and non-destructive drafts. Corrupt storage falls back cleanly.

---

## 7. Add end-to-end coverage for all primary destinations

**Files:**
- Add ui/e2e/page-workspace.spec.ts
- Modify ui/e2e/helpers.ts only for shared selectors/navigation utilities.

**Scenarios:**
- Visit each primary destination: Chat, Dashboard, Projects, Kanban, Tasks, Docs, Graph, Memory, Links, Memos, Decisions, Audit, Imports, and Config.
- Confirm a visited page remains mounted and its representative control state survives a switch to another page and back.
- Confirm Docs, Tasks, Chat, Memory, and Decisions restore nested route/query/selection state.
- Confirm a page’s loader runs on first mount and once on reactivation, while inactive page-specific requests do not continue.
- Confirm switching pages does not interrupt global task creation, search, workspace selection, or task detail overlays.
- Confirm reload restores safe UI state and route memory in the same browser tab/workspace.
- Confirm a workspace change does not restore state from the previous workspace.
- Confirm malformed and stale session snapshots do not prevent app startup.
- Confirm hidden slots are not focusable and do not expose duplicate interactive controls to assistive technology.

**Verification:** cd ui && bun run test:e2e -- page-workspace.spec.ts.

---

## 8. Validate the complete change and review the diff

**Commands:**
- cd ui && bun run build
- cd ui && bun test
- cd ui && bun run test:e2e -- page-workspace.spec.ts
- Run any focused tests added in the preceding sections.
- git diff --check
- git status --short

**Review checklist:**
- Confirm the diff contains only the planned UI/context/test files plus the implementation plan.
- Confirm no backend/API files changed.
- Confirm no unrelated image, artifact, or user worktree changes were staged.
- Inspect the rendered active/inactive DOM for hidden, aria-hidden, inert, and focus behavior.
- Test storage disabled, malformed, wrong-workspace, and reload paths.
- Test browser back/forward and direct deep links.
- Run the final verification skill before claiming completion and report the commands and outcomes.
