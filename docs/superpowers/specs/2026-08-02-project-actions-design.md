# Project Actions Design

## Goal

Allow users to add an existing initialized project to the shared registry and remove a project registry entry from the Projects tab.

## Scope

- Add a Projects-page dialog that accepts an absolute path to an existing Knowns project.
- Add `POST /api/workspaces` to register that path without switching the active workspace.
- Add a confirmation dialog before removing a registry entry.
- Reuse `DELETE /api/workspaces/{id}` for removal.
- Refresh the project list after either action and display operation errors inline.

## Safety

Removing a project affects only `~/.knowns/registry.json`. It never deletes the project directory, its files, or its Knowns data.

## Out of Scope

- Creating a new project folder.
- Editing project identifiers, names, or paths.
- Changing the active workspace.

## Verification

Add route-level API coverage for adding an existing project and retain removal coverage. Add UI navigation coverage for the Projects page, then run the frontend build and relevant Go tests.
