# Projects Tab Design

## Goal

Provide a read-only Projects tab that shows every saved workspace project.

## Scope

- Add a Projects item to the application sidebar.
- Add a `/projects` route and page.
- Reuse `workspaceApi.list()` for project data.
- Show each project's name, path, ID, and last-used time.
- Include loading and empty states.

## Out of Scope

- Creating, switching, editing, or removing projects from this page.
- Backend or data-model changes.

## Design

The Projects page fetches the saved workspace registry with the existing API and renders a read-only list using the current page-shell styling. The sidebar item navigates to `/projects`, and AppShell renders the page for that route. A failed request is shown as an inline error so the rest of the application remains usable.

## Verification

Build the frontend production bundle. The page must render project metadata and present a clear empty state when the registry has no entries.
