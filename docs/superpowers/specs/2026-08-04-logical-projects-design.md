# Logical Projects Design

## Goal

Keep project IDs and names as the user-facing identity while canonicalizing filesystem paths used by runtime project resolution. This removes duplicate entries caused by alternate paths to the same directory without breaking CLI/MCP access to the active repository.

## Scope

- A registry project contains `id`, `name`, optional runtime `path`, and `lastUsed`; paths are canonicalized with symlinks resolved.
- Existing registry files are migrated on load: equivalent canonical paths are collapsed, keeping the last entry. Pathless entries remain distinct.
- The projects API creates projects from a name only; existing runtime switching/scanning remains available for repository-backed projects.
- The Projects UI creates and displays projects by name/ID without requiring or showing a path.
- Task and document project scopes continue to use the existing project IDs.
- MCP and CLI project-root discovery/switching remain repository-runtime concerns and use canonical paths.

## Data Flow

Creating a project writes one pathless registry record. Task creation fetches that list and associates the selected record's ID with the task. Runtime discovery may still register a repository path. Deleting a project removes only its registry record; it never deletes a repository or other files.

## Error Handling

Project creation rejects a blank name. Removing an unknown ID returns the existing not-found response. Path-only endpoints are removed rather than silently accepting ignored path input.

## Tests

- Registry load migrates legacy path-backed entries and collapses duplicated legacy paths.
- Registry creation produces logical projects without path-based deduplication.
- Workspace routes create/list/remove logical projects and reject the former path requirements.
- UI type checking/build confirms the removed path API has no remaining callers.
