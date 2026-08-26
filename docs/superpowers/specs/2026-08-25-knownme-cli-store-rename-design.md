# Knowme CLI and Store Rename Design

## Goal

Rename the installed Know-Me CLI from `knowns` to `knownme` and change the
active project and global storage roots to `.known-me` and `~/.known-me`.

## Scope

### CLI identity

- The installed executable and user-facing command are `knownme`.
- CLI usage text, help output, quick-start examples, generated setup guidance,
  update/remediation commands, build targets, and package binary artifacts use
  `knownme` when they invoke the CLI.
- The Go module path, repository path, product domains, MCP/server identifiers,
  and internal protocol/environment identifiers remain unchanged unless they
  directly identify the executable or active storage root.

### Storage identity

- Repository-local active storage uses `.known-me`.
- Machine-level active storage uses `~/.known-me`.
- Derived state under the global root, including the registry, caches, model
  data, runtime state, and service state, follows the new global root.
- Project-root discovery and runtime integrations look for `.known-me`.
- The old `.knowns` and `~/.knowns` paths are not read, written, migrated, or
  used as fallback paths. Users migrate existing data manually.

### Documentation and tests

- Documentation describing the active CLI or storage layout is updated to the
  new names.
- Tests assert the new executable and storage identities.
- Existing unrelated working-tree changes are preserved.

## Non-goals

- No data migration command or automatic migration behavior.
- No compatibility alias for the `knowns` executable.
- No rename of the Go module, GitHub repository, product domains, MCP tool
  namespace, or protocol/environment identifiers that are not CLI/storage
  paths.
- No unrelated refactoring or redesign of storage schemas.

## Implementation approach

Central storage path helpers will define the active local and global directory
names so runtime code does not drift back to string literals. The CLI package
and build/install metadata will use `knownme` as the executable identity.
Existing generated guidance and remediation strings will be updated where they
are commands users can copy and run. Tests will first establish the expected
new behavior, then the smallest production changes will make them pass.

## Error handling and compatibility

Missing `.known-me` or `~/.known-me` data is treated as missing active data;
the application will not silently inspect the old locations. Existing
initialization, project resolution, and store validation errors remain
otherwise unchanged.

## Validation

Focused tests will cover:

- CLI root usage and generated command text
- project-root discovery using `.known-me`
- global root and registry/cache path construction using `~/.known-me`
- build/install output naming as `knownme`
- absence of old-path fallback behavior

The focused Go tests, the full Go test suite, and the normal build/package
checks are the completion gate.
