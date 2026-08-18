# Workspace Project Link Design

## Goal

Bind a workspace to a registered Know-Me project with a small local marker so
all CLI commands use the intended project ID while preserving the existing
global active-project behavior for older or unlinked directories.

## Decisions

- `knowns init [name]` writes `.known-me.json` in the current directory.
- The file contains only the registry ID:

  ```json
  {
    "projectId": "w7rd0b"
  }
  ```

- The global registry remains the source of truth for project names, IDs, and
  `lastUsed` state. The link never duplicates the project name.
- Resolution walks upward from the current working directory and uses the
  nearest link file. This keeps commands working from nested directories.
- A missing link falls back to the registry's active project. A malformed link
  or an ID absent from the registry is an error and never falls back silently.
- Resolving a project does not update `lastUsed`; explicit project selection and
  initialization continue to do that.
- Existing unscoped tasks and docs remain untouched. No automatic data
  migration is part of this change.

## Flows

### Initialization

1. Determine the current directory and project name using the existing `init`
   rules.
2. Create a registry project and select it as active.
3. Initialize the shared Know-Me store and the project's central config under
   `~/.knowns/projects/<projectId>/config.json`.
4. Write or replace `.known-me.json` in the current directory.
5. Print the registered project name and ID.

The registry record and project data are retained if a later filesystem write
fails; the command reports the error rather than claiming success.

### CLI resolution

All normal commands already route through `getStore` or `getStoreErr`, so the
shared resolver is the only CLI resolution point that changes:

1. Walk upward from the supplied start directory for `.known-me.json`.
2. If found, parse a non-empty `projectId`, load the registry, and verify the
   ID exists.
3. Return `storage.NewProjectStore(globalRoot, projectID, linkDirectory)`.
4. If no link is found, load `registry.GetActive()` and return a project store
   with that ID and no repository root.
5. If no active project exists, return an error instructing the user to run
   `knowns init`.

The data root remains `~/.knowns`; the link selects the project context rather
than creating repository-local `.knowns` data.

## Scope

Included:

- Link-file read/write and upward discovery.
- Shared CLI project-store resolution and active-project fallback.
- `knowns init` link creation and project initialization.
- Focused resolver/init tests and command reference documentation.

Not included:

- Adding paths or names to registry records.
- Changes to MCP/server project switching.
- Automatic migration of existing records or repository-local `.knowns` data.
- A new command for editing or repairing links.

## Verification

Focused tests will verify:

- `init` writes the exact single-field JSON link.
- A nested directory resolves the nearest workspace link.
- A valid link returns the linked project ID and workspace root.
- Missing links use the registry's active project ID.
- Malformed and stale links fail without active-project fallback.
- No active registry project returns the expected initialization error.

The relevant CLI, registry, and storage tests will run, followed by `go vet`
and `git diff --check`.
