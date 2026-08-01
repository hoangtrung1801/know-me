# Global Multi-Project Store Design

## Goal

Move Knowns-managed data from repository-local `.knowns` directories into one machine-level `~/.knowns` store that can hold records for multiple projects. Tasks and docs remain globally visible by default and may optionally belong to a project.

## Storage Layout

`~/.knowns` is the only active data root:

```text
~/.knowns/
├── registry.json
├── projects/
│   └── <projectId>/config.json
├── tasks/
├── docs/
├── archive/
├── versions/
├── templates/
├── imports/
├── memory/
├── decisions/
└── .search/
```

The global registry maps each canonical repository path to one stable project ID, display name, and last-used timestamp. The existing registry-generated ID is canonical; project names are display-only. Project-specific settings move to `projects/<projectId>/config.json`.

Existing repository-local `.knowns` directories are left untouched and are not read or migrated automatically.

## Record Identity

Task and doc frontmatter gains an optional `projectId` field. Records without it are global.

Scoped identities use a project prefix wherever collisions matter:

- Task: `<projectId>:<taskId>`
- Doc: `<projectId>:<docPath>`
- Reference: `@task/<projectId>:<taskId>` or `@doc/<projectId>:<docPath>`
- Graph node: `task:<projectId>:<taskId>` or `doc:<projectId>:<docPath>`

Physical paths use a Windows-safe `--` separator so two projects may reuse the same task ID or doc path:

- Scoped task: `tasks/task-<projectId>--<taskId> - <title>.md`
- Scoped doc: `docs/<projectId>--<docPath>.md`
- Global task/doc: the current unprefixed path

The authoritative project association remains the frontmatter field; the physical prefix prevents collisions and makes direct file inspection useful.

An unprefixed read or mutation succeeds only when exactly one record matches. Zero matches returns not found; multiple matches returns an ambiguity error listing the required prefixed identities. Mutations perform identity resolution before writing or deleting anything.

## Project Resolution

`knowns init` registers the current repository and creates its central config. Re-running initialization for the same canonical path reuses the existing project. A different path receives a different registry-generated project ID.

Commands resolve the active project by canonicalizing the current working directory, walking upward, and choosing the longest matching registered repository path. This keeps commands working from repository subdirectories without a local marker.

The store carries three distinct values:

- Global storage root: `~/.knowns`
- Active project ID: optional registry ID
- Active repository root: optional filesystem path used by code intelligence, LSP, runtime hooks, and agent integrations

Code-related operations use the repository root. Task, doc, search, retrieval, and graph operations use the global storage root.

## Creation and Queries

Creating a task or doc while an active registered project is resolved assigns that project's ID automatically. Passing `--global` creates an unscoped record. Programmatic APIs expose the same explicit global/scoped choice.

Lists are global by default. CLI, MCP, and HTTP entry points accept an optional exact `projectId` filter. A filtered result contains only records whose `projectId` equals the requested value; unscoped records are excluded.

The graph is derived from the globally stored records. Its default response includes all projects and global records. A project-filtered graph retains only matching nodes and edges whose source and target both remain in the filtered node set.

Search and retrieval index `projectId` as metadata and apply the same exact filter without changing default global visibility.

## Components Changed

- Registry: becomes the source of project identity and repository-path resolution; validation checks the repository path and central project config rather than a local `.knowns/config.json`.
- Store: points at the global root and carries optional active project/repository context.
- Task and doc models/stores: serialize `projectId`, create composite physical/logical identities, detect ambiguity, and filter by exact project ID.
- CLI/MCP/HTTP: assign active project IDs on create, add explicit global creation, accept optional project filters, and preserve prefixed identities in responses.
- Graph/references/search: use composite identities and project metadata so collisions do not merge unrelated records.
- Code/LSP/runtime integrations: use the active repository root rather than deriving it from the store root.

No database, new dependency, migration framework, or compatibility shim is added.

## Errors and Safety

- An unknown project ID is rejected before querying or creating records.
- An invalid or missing repository path cannot be registered.
- Duplicate registration of the same canonical path reuses its existing project.
- Ambiguous unprefixed task/doc keys are rejected before mutation.
- Project filtering is exact; it never silently includes unscoped or other-project records.
- Existing local `.knowns` content is never deleted or overwritten.

## Verification

Focused tests cover:

- Global root and active repository resolution from nested working directories
- Stable registry identity and duplicate-path reuse
- Optional `projectId` YAML/JSON round-trips
- Automatic scoped creation and explicit global creation
- Composite task/doc lookup, filename collision avoidance, and ambiguity errors
- Exact filtering across store, CLI, MCP, HTTP, search/retrieval, and graph paths
- Graph node identity and removal of cross-scope edges in filtered responses
- Code/LSP/runtime operations continuing to use the repository root

The full Go test suite and CLI end-to-end suite are the completion gate.
