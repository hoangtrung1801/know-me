# Persistent App Pages Design

## Goal

Make the primary Know-Me pages behave like persistent application tabs. When
the user moves between Chat, Dashboard, Projects, Kanban, Tasks, Docs, Graph,
Memories, Saved Links, Memos, Decisions, Audit, Imports, and Settings, each
visited page keeps its previous UI state. Inactive pages do not initiate
page-specific refresh work. Returning to a page triggers one authoritative
data refetch while retaining the page's user-facing state. The restorable
state also survives a full browser reload.

## Approved decisions

- Use a lazy page keep-alive cache owned by the application shell.
- Mount a page the first time it is visited, then hide it instead of
  unmounting it when the user navigates elsewhere.
- Keep only the active page interactive. Inactive slots are hidden from the
  accessibility tree and cannot receive focus or pointer input.
- Treat app navigation as page-tab navigation and remember each page's last
  full location, including nested paths, query strings, and hashes.
- Refetch page data on the first mount and on each later inactive-to-active
  transition. Do not run page-specific polling while inactive.
- Use versioned `sessionStorage` for reload persistence. The storage is scoped
  to the browser tab and the active workspace; it is not a cross-window or
  browser-restart synchronization mechanism.
- Preserve all restorable user-owned UI state, including filters, selections,
  view tabs, scroll positions, editor drafts, and safe open panels. Do not
  restore loading state, request tokens, stale errors, in-flight operations,
  or destructive confirmation dialogs.
- Keep server data and durable domain records in their existing stores and
  APIs. This change does not add a backend tab or page-state endpoint.
- Preserve the current URL as the source of truth for the page currently
  displayed. The remembered location is used when an app navigation item is
  selected again.

## Scope

### Included

- A shared page lifecycle and keep-alive module.
- Lazy mounting and hidden inactive page slots in `AppShell`.
- Last-location memory for every primary navigation item.
- Activation-aware refetching for page-owned and route-bound data loaders.
- Versioned, workspace-scoped `sessionStorage` for serializable UI state.
- Per-page state adapters/codecs for values that need conversion, such as
  sets, graph coordinates, and nested scroll positions.
- Preservation of Chat, Docs, task, editor, filter, modal, and navigation state
  during normal app navigation.
- End-to-end coverage for navigation, refetching, reload hydration, and
  inactive-page behavior.

### Not included

- Persisting API responses as a second client-side data cache.
- Background polling or live page rendering while a page is inactive.
- Cross-browser-tab synchronization.
- Persisting destructive confirmation dialogs or an operation that was in
  progress when the browser was reloaded.
- Changing backend data models, routes, SSE protocol names, or workspace
  storage.
- Eagerly mounting every page during the initial application load.

## Current state and problem

`ui/src/AppShell.tsx` derives a primary page from the router location and
returns one page from `renderPage()`. The rendered wrapper is keyed by
`currentPage`, so changing a primary page unmounts the previous page. Its
local React state, DOM state, scroll containers, editor drafts, and active
page effects are therefore lost.

The providers above the router already keep some shared state alive, including
SSE, OpenCode, Chat, time tracking, global task state, and Docs state. That
shared state is not enough to preserve page-local state. Docs, Memories,
Decisions, Chat, and task detail views also derive some behavior from the
current route, so hidden pages must not treat another page's route as their
own route transition.

The sidebar in `ui/src/components/organisms/AppSidebar.tsx` currently points
every navigation item at its base route. That means returning to Docs or
Tasks also loses a nested document/task location even if the page's component
were kept mounted.

## Architecture

### Ownership

`PageWorkspace` owns page-tab identity, lazy slot creation, active-page
transitions, remembered locations, storage hydration, and storage writes.
Page implementations continue to own their domain data and user interactions.
The workspace only supplies lifecycle and persistence interfaces; it does not
know how a task, document, memory, or chat session is fetched.

This creates one deep module at the application-shell seam. Callers learn a
small interface—page identity, active state, activation signal, and a typed
state hook—while the cache, storage envelope, validation, and transition
bookkeeping remain localized.

### Page identity

The primary page ID is a closed union covering the current navigation set:

```text
chat, dashboard, projects, kanban, tasks, docs, graph, memory,
links, memos, decisions, audit, imports, config
```

The page ID is independent from a nested route. For example, `/docs`,
`/docs/guides`, and `/docs/setup.md` all belong to `docs`; `/tasks` and
`/tasks/abc` belong to `tasks`.

### Page slot lifecycle

`PageWorkspace` keeps a registry of visited page IDs. A slot has these
states:

```text
unvisited -> active -> inactive -> active
                         \-> discarded on workspace/session reset
```

Unvisited pages have no React tree. The first navigation to a page creates its
slot and performs its normal initial load. An inactive slot remains mounted
inside a hidden wrapper. The wrapper applies `hidden`, `aria-hidden="true"`,
and `inert`; the active slot removes those restrictions. Only the active slot
is exposed to screen readers and keyboard navigation.

The current `key={currentPage}` remount behavior is removed. Slots use the
stable page ID as their key. Nested navigation within one page does not create
a second page slot.

### Lifecycle interface

The workspace exposes a small hook for page implementations:

```text
usePageLifecycle(pageId) -> {
  isActive: boolean,
  activationId: number,
  isHydrated: boolean,
}
```

`activationId` changes once for each transition into the active state. A page
uses it as the dependency for its authoritative loader. Initial loading is
also driven by the same contract, so each page has one source for initial and
activation refresh behavior.

The persistence hook has a typed shape equivalent to:

```text
usePersistentPageState(pageId, stateKey, initialValue, codec?)
  -> [value, setValue]
```

The default codec handles JSON-safe values. A page supplies a codec when its
state is represented by a `Set`, a graph viewport, or another non-JSON value.
The hook hydrates once, writes changes with a short debounce, and ignores
storage failures without interrupting the page.

### Route memory

The workspace tracks the latest route belonging to each page. Before a
navigation changes the active page, it records the current pathname, search,
and hash under the current page ID. A sidebar navigation action calls the
workspace navigation helper, which uses the remembered route when present and
the base route otherwise.

Route-aware pages apply route effects only when their page ID is active. The
Docs provider is placed under the workspace provider so it can follow this
rule without creating a second Docs data store. Its shared document data may
remain available globally, but route selection, folder selection, and editor
reset logic are active-page concerns. Memories, Decisions, and Chat apply the
same active-page guard to route-derived view changes.

## Persistent state contract

### Storage envelope

The storage adapter owns one versioned envelope under a dedicated key:

```text
{
  version: 1,
  workspaceKey: string,
  savedAt: number,
  routes: { [pageId]: { pathname, search, hash } },
  pages: { [pageId]: { [stateKey]: JSON value } }
}
```

The workspace key is derived from the active project identity available to the
frontend. A workspace change invalidates the old envelope before the existing
workspace reload path runs. An invalid JSON value, unknown page ID, unknown
state key, wrong version, or wrong workspace is ignored without blocking app
startup.

Writes are debounced so typing in a draft or search box does not synchronously
write for every keystroke. A quota or security error is swallowed after the
current in-memory state has been updated. The next reload simply starts with
defaults for values that could not be stored.

### State inventory

The page adapters cover these user-owned values:

| Page | Restored UI state |
| --- | --- |
| Dashboard | analysis period, assignee filter, label filter |
| Projects | create form draft and safe dialog state |
| Kanban | project scope, safe panel state, page scroll position |
| Tasks | view mode, project scope, lifecycle filter, selected task route, safe panel state |
| Docs | remembered doc/folder route, search, spec filter, wide mode, edit mode, metadata/content draft, safe history/preview state, scroll positions |
| Imports | selected import route/state, add-import draft, safe add-panel state |
| Graph | search, node filters, selected node, fullscreen state, graph viewport |
| Memories | current sub-view route, query, selected item(s), safe create/edit draft state |
| Links | search, add-link draft, edit selection and draft |
| Memos | search, new memo draft, edit selection and draft |
| Decisions | current sub-view route, query, selected decision, safe create/edit draft state |
| Audit | selected tab, tool/result filters, expanded safe details |
| Chat | remembered session route, sidebar search, composer draft, safe timeline/sidebar state, model/variant selection where not already covered by existing preference storage |
| Settings | selected settings section and safe editable form drafts |

API result arrays, loading flags, errors, busy/submitting flags, request
generations, timers, streaming transport handles, and destructive confirmation
dialogs are not part of the persisted contract. The keep-alive tree still
preserves safe open dialogs and non-serializable DOM state during normal
navigation; reload hydration restores their serializable equivalents only.

Selections are restored by ID or route and reconciled after the refetch. If an
entity was deleted or is no longer valid for the refreshed view, its selection
is cleared while unrelated filters and drafts remain intact.

## Activation and data flow

### Navigation to another page

1. The workspace records the current page's complete location and flushes any
   pending state snapshot scheduled for that page.
2. The router navigates to the target page's remembered location or base route.
3. The workspace marks the previous slot inactive and the target slot active.
4. The target receives a new `activationId`.
5. The target invokes its existing loader once and keeps its previous UI state
   and visible data while the request is pending.

### Data refresh

Each page keeps its current domain loader and connects it to activation. The
loader must be idempotent and must not reset user-owned state. Existing
abort/generation guards remain in place where requests can race.

Pages that currently use shared providers follow the same contract:

- AppShell refreshes the shared task snapshot when Kanban or Tasks activates.
- Docs refreshes its document inventory and linked-task data when Docs
  activates.
- Chat refreshes sessions/messages and reconciles pending activity when Chat
  activates.
- Graph, Memories, Links, Memos, Decisions, Audit, Imports, Projects, and
  Settings rerun their current page loaders when activated.

SSE remains the live transport for global events. An event affecting an
inactive page marks that page's data stale rather than starting a page fetch.
The next activation consumes the stale marker through the normal loader. An
active page may continue to respond immediately to its existing SSE events.

### Reload

On application startup, the storage adapter validates and hydrates the route
map and page snapshots. The browser URL remains authoritative for the initial
active page. When the user visits another page, its prior snapshot is applied
before its first render and its data is refetched. No API response is treated
as durable browser state.

## Error and recovery behavior

- A failed activation refetch leaves the previous data, filters, selections,
  scroll positions, and drafts intact.
- The page displays its existing error treatment plus a retry action. Retry
  requests the same activation loader and does not reset the page snapshot.
- Initial-load errors retain current empty/default UI state and can be retried
  without invalidating storage.
- A stale or corrupt storage envelope is discarded field-by-field where
  possible; the page falls back to its existing defaults and still loads.
- If the storage API is unavailable or over quota, navigation and in-memory
  keep-alive behavior continue normally.
- Workspace switching clears the page workspace registry and its scoped
  storage before the existing full reload, preventing one project's drafts or
  selections from appearing in another project.
- Hidden pages do not show errors or toasts caused solely by their dormant
  state. Any error discovered during activation is shown when that page is
  visible.

## Performance and accessibility

- Pages mount only after first visit, avoiding an initial cost for unused
  destinations.
- Hidden pages do not poll, initiate activation refreshes, or retain active
  focus. Their existing cleanup paths remain available for application
  shutdown.
- The workspace may retain memory for visited page trees. This is an
  intentional trade-off for preserving DOM and React state; a future explicit
  cache-eviction policy is outside this change.
- Inactive wrappers use `hidden`, `aria-hidden`, and `inert`; focus is returned
  to the activating navigation control after a failed route change.
- The active page remains the only visible page for end-to-end selectors and
  assistive technology. Existing page semantics and keyboard behavior remain
  unchanged inside the active slot.

## Implementation boundaries

Expected frontend changes are localized to:

- `ui/src/router.tsx` for provider placement and workspace scoping.
- `ui/src/AppShell.tsx` for the page workspace, slot rendering, route memory,
  and shared task activation refresh.
- `ui/src/components/organisms/AppSidebar.tsx` for workspace-aware navigation.
- New workspace lifecycle and storage modules under `ui/src/contexts`,
  `ui/src/components/templates`, and/or `ui/src/lib` following existing
  project conventions.
- Existing primary page modules and route-bound contexts to register their
  activation loaders and persistent UI state.
- New end-to-end tests under `ui/e2e` plus pure storage/lifecycle tests if the
  existing frontend test setup supports them.

No Go or API changes are required.

## Verification matrix

The implementation is complete only when the following checks pass:

1. Starting from an empty app, visiting pages mounts only the pages visited;
   returning to each visited page preserves its local state.
2. Navigation covers every primary sidebar item, including Settings, without
   losing the state of the previous page.
3. Docs restores a nested document/folder route, editor mode, draft, filter,
   and scroll position.
4. Tasks and Kanban restore view/filter/project state and task selection.
5. Memories and Decisions restore their nested sub-view, query, and selected
   item state.
6. Chat restores the active session, composer draft, sidebar/timeline state,
   and visible activity after leaving and returning.
7. Each page makes one refetch on reactivation, and network instrumentation
   shows no page-specific fetches while it is inactive.
8. Refresh failures preserve the previous page state and expose retry.
9. A browser reload restores stored UI state and then refetches current data.
10. Corrupt, old-version, wrong-workspace, and unavailable storage fall back
    without a blank screen or uncaught exception.
11. Workspace switching cannot reuse another workspace's page state.
12. Inactive pages are not visible, focusable, or interactive.
13. `npm run build` and the existing Playwright suite pass, including the new
    persistence coverage.

