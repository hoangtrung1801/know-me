# Task Project Scope UI Design

## Goal

Make project scope explicit when creating, browsing, and organizing Tasks.

## Design

The existing workspace registry supplies named project options. The task form adds a Project selector that defaults to the most recently used workspace and includes a Global option for unscoped tasks. It submits `projectId` for a project or `global: true` for Global.

Tasks and Kanban each add a Project filter with All projects as the default. Filtering is local over the globally loaded task list, so it remains immediate and does not alter existing lifecycle, board, or task interactions. Project-scoped tasks display a compact badge; global tasks display a Global badge.

## Constraints

- Reuse existing `workspaceApi`, Select, Badge, and task APIs.
- Do not add dependencies or change the existing task form layout beyond the selector.
- Preserve global visibility when no project filter is selected.
