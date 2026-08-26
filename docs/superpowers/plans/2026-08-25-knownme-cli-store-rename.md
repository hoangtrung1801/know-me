# Knowme CLI and Store Rename Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `knownme` the installed/user-facing CLI and make `.known-me` / `~/.known-me` the only active project/global storage roots.

**Architecture:** Add a dependency-free `internal/paths` package for the CLI identity and active storage-root names. Keep `storage.GlobalRootPath` as the public storage API while delegating root calculation to that package; update direct runtime path consumers to use shared helpers. Rename the Go command directory so `go install` also produces `knownme`, then update packaging, generated command text, and active documentation without changing module, repository, domain, MCP namespace, or protocol identifiers.

**Tech Stack:** Go 1.24.2, Cobra, Go tests, npm package metadata/scripts, Make, shell/Docker packaging.

**Spec:** `docs/superpowers/specs/2026-08-25-knownme-cli-store-rename-design.md`

## Global Constraints

- The active project store is `.known-me`.
- The active global store is `~/.known-me`.
- The old `.knowns` and `~/.knowns` paths are never read or written as fallbacks.
- The installed/user-facing executable is `knownme`.
- The Go module, repository, domains, MCP/server identifiers, and unrelated environment/protocol identifiers remain unchanged.
- Preserve the existing uncommitted README/image/artifact changes.

---

### Task 1: Establish shared identity and storage-path behavior with failing tests

**Files:**
- Create: `internal/paths/paths.go`
- Create: `internal/paths/paths_test.go`
- Modify: `internal/storage/store.go`
- Modify: `internal/storage/store_test.go`
- Modify: `internal/registry/registry.go`
- Modify: `internal/registry/registry_test.go`

**Interfaces:**
- Produces `paths.CLIName`, `paths.StoreDirName`, `paths.GlobalStoreRoot()`, and `paths.ProjectStoreRoot(projectRoot string)`.
- Preserves `storage.GlobalRootPath()` as the storage package API, delegated to `paths.GlobalStoreRoot()`.

- [ ] **Step 1: Write the failing path tests**

Add tests equivalent to:

```go
func TestActiveIdentityUsesKnowmeNames(t *testing.T) {
	if paths.CLIName != "knownme" { t.Fatalf("CLIName = %q, want knownme", paths.CLIName) }
	if paths.StoreDirName != ".known-me" { t.Fatalf("StoreDirName = %q, want .known-me", paths.StoreDirName) }
}

func TestGlobalStoreRootUsesNewDirectory(t *testing.T) {
	home := t.TempDir(); t.Setenv("HOME", home)
	if got, want := paths.GlobalStoreRoot(), filepath.Join(home, ".known-me"); got != want { t.Fatalf("GlobalStoreRoot() = %q, want %q", got, want) }
}

func TestProjectStoreRootUsesNewDirectory(t *testing.T) {
	project := t.TempDir()
	if got, want := paths.ProjectStoreRoot(project), filepath.Join(project, ".known-me"); got != want { t.Fatalf("ProjectStoreRoot() = %q, want %q", got, want) }
}
```

Change the existing `storage.GlobalRootPath` expectation to `~/.known-me` and add a `FindProjectRoot` case that finds `<repo>/.known-me/config.json` but rejects an old `<repo>/.knowns/config.json`.

- [ ] **Step 2: Run the focused tests and verify the expected red failure**

Run: `GOCACHE=/tmp/knownme-gocache go test ./internal/paths ./internal/storage ./internal/registry`.

Expected: compilation/test failure because the shared path package and new root behavior do not exist yet.

- [ ] **Step 3: Implement the minimal shared helpers**

Implement `internal/paths/paths.go` with `CLIName = "knownme"`, `StoreDirName = ".known-me"`, a `GlobalStoreRoot()` helper preserving the existing `HOME`-first behavior, and `ProjectStoreRoot(projectRoot string)` returning `filepath.Join(projectRoot, StoreDirName)`. Delegate `storage.GlobalRootPath` to `paths.GlobalStoreRoot`, update `FindProjectRoot` and `RepositoryRoot`, and update the default registry path.

- [ ] **Step 4: Run the focused tests and verify green**

Run the same focused command. Expected: all tests in the three packages pass.

### Task 2: Update all active runtime consumers of the storage roots

**Files:**
- Modify: `internal/cli/root.go`, `setup.go`, `init.go`, `import_cmd.go`, `model.go`, `runtime.go`, `runtime_memory.go`, `sync.go`, `update.go`
- Modify: `internal/doctor/search_checks.go`, `internal/search/embedding_native.go`, `init.go`, `onnx_runtime.go`, `semantic_runtime.go`
- Modify: `internal/server/routes/embedding_models.go`, `internal/server/routes/imports.go`, `internal/server/server.go`, `internal/mcp/server.go`, `internal/services/status.go`
- Modify: `internal/tunnel/cloudflared/daemon.go`, `internal/runtimequeue/runtimequeue.go`, `internal/lspdaemon/paths.go`, `internal/lspdaemon/server.go`
- Modify: `internal/lsp/dependency_adapter.go`, `internal/lsp/plugin_adapter.go`, `internal/lsp/adapters/helpers.go`, `internal/lsp/manager.go`, `internal/lsp/status.go`, `internal/lsp/runtime_error.go`
- Modify: `internal/storage/audit_store.go`, `internal/storage/embedding_settings_store.go`, `internal/storage/user_prefs_store.go`
- Modify: affected fixtures in `internal/cli/*_test.go`, `internal/storage/*_test.go`, `internal/lsp/*_test.go`, `internal/lspdaemon/*_test.go`, `internal/runtimequeue/*_test.go`, `internal/server/**/*_test.go`, and `internal/services/*_test.go`

**Interfaces:**
- Consumes `paths.GlobalStoreRoot()` and `paths.ProjectStoreRoot(...)` from Task 1.
- Produces no active runtime path containing `.knowns`; old paths remain absent by design.

- [ ] **Step 1: Update tests before production paths**

Change path fixtures and expectations to `.known-me` or the shared helpers, including global registries, settings, model/cache paths, project fixtures, LSP state, runtime queues, imports, and server stores.

- [ ] **Step 2: Run focused affected tests and verify red**

Run: `GOCACHE=/tmp/knownme-gocache go test ./internal/cli ./internal/lsp ./internal/lspdaemon ./internal/runtimequeue ./internal/search ./internal/server/... ./internal/storage ./internal/services`.

Expected: failures identify production code still looking for `.knowns` while updated fixtures use `.known-me`.

- [ ] **Step 3: Replace active runtime path construction**

Use `paths.ProjectStoreRoot` for repository-local paths and `paths.GlobalStoreRoot` for machine-level paths. Replace direct global path construction for registries, caches, models, runtime state, logs, preferences, settings, audit files, LSP state, and service state. Update path-segment filters and project-root discovery to recognize `.known-me` only.

- [ ] **Step 4: Update active-path comments and error messages**

Change references describing the active store to `.known-me` / `~/.known-me`. Change only copyable CLI command names to `knownme`; retain internal identifiers such as `KnownsVersion`, `RuntimeSourceKnowns`, `KNOWNS_*` environment variables, and MCP keys.

- [ ] **Step 5: Run the affected tests and verify green**

Run the same focused command. Expected: all affected package tests pass with no old-path fallback behavior.

### Task 3: Rename the CLI executable and packaging/build surfaces

**Files:**
- Create: `cmd/knownme/main.go`
- Delete: `cmd/knowns/main.go`
- Modify: `Makefile`, `.air.toml`, `npm/knowns/package.json`, `npm/knowns/install.js`, `npm/knowns/bin/knowns.js`
- Modify: all six `npm/knowns-*/package.json` platform manifests
- Modify: `scripts/install-deb.sh`, `scripts/install-deb.test.sh`, `tests/runtime-docker/Dockerfile`, `tests/runtime-docker/project_stress.zsh`
- Modify: active README and architecture/build documentation

**Interfaces:**
- `go build`, `go install`, npm shims, release binaries, and Debian installation produce/invoke `knownme`.
- NPM package names, `@knowns/*` platform package names, release archive names, module path, repository URL, and MCP config key remain unchanged unless they directly name the installed binary.

- [ ] **Step 1: Add the CLI identity regression test**

Create `internal/cli/root_test.go` asserting `rootCmd.Use` begins with `knownme`, the custom help footer contains `knownme [command] --help`, and quick-start output contains `knownme init` rather than `knowns init`.

- [ ] **Step 2: Run the CLI test and verify red**

Run: `GOCACHE=/tmp/knownme-gocache go test ./internal/cli -run 'TestRoot|Test.*Help' -count=1`.

Expected: failure because the root command still identifies itself as `knowns`.

- [ ] **Step 3: Rename the Go command package and update build targets**

Move the entry point from `cmd/knowns/main.go` to `cmd/knownme/main.go`. Set `BINARY := knownme`, update every Makefile and development-config target that builds or runs `./cmd/knowns`, and update build examples. This makes `go install ./cmd/knownme` produce the new executable.

- [ ] **Step 4: Update Cobra identity and copyable command strings**

Set the root command `Use` and all help/quick-start/footer strings to `knownme`. Update update notifications, install detection/remediation commands, runtime hooks, LSP guidance, doctor guidance, and generated setup commands when they invoke the executable. Keep MCP server keys and internal names unchanged.

- [ ] **Step 5: Update npm and installer binary names**

Make the npm package expose `knownme`, resolve/stage/download `knownme` and `knownme.exe`, write platform metadata with `main: "knownme"`, and update the Debian installer/test archive member and destination to `knownme`. Keep `kn` only if it remains an intentional separate alias.

- [ ] **Step 6: Run CLI, npm, and installer tests**

Run: `GOCACHE=/tmp/knownme-gocache go test ./internal/cli ./internal/runtimeinstall ./internal/util ./internal/doctor ./internal/lsp ./internal/lspdaemon -count=1`; `node --test npm/knowns/install.test.js npm/knowns/knowns-bin.test.js`; and `bash scripts/install-deb.test.sh`.

Expected: all tests pass and no test expects the installed binary to be named `knowns`.

### Task 4: Sweep active documentation and generated guidance

**Files:**
- Modify: active README, guide, reference, integration, architecture, Docker, shell, JSON, YAML, and TOML files found by the scoped search below.
- Do not modify: historical design specs/plans, search benchmark fixture identifiers, repository/module/domain identifiers, MCP keys, or unrelated user changes.

**Interfaces:**
- Users copying documented commands get `knownme`.
- Users reading active storage documentation see `.known-me` and `~/.known-me`.

- [ ] **Step 1: Run a scoped active-reference inventory**

Run: `rg -n --hidden -g '!*.png' -g '!*.jpg' -g '!*.gif' -g '!docs/superpowers/specs/**' -g '!docs/superpowers/plans/**' -g '!internal/search/testdata/**' -e 'knowns (init|task|doc|memory|decision|search|retrieve|validate|browser|setup|sync|update|doctor|lsp|model|runtime|provider|config|settings|mcp)' -e '\.knowns' .`.

- [ ] **Step 2: Update only active CLI/storage references**

Change copyable commands and active storage layout references. Leave product URLs, repository URLs, package scopes, MCP namespaces, protocol identifiers, historical documents, and fixture IDs unchanged.

- [ ] **Step 3: Verify no active path or command regressed**

Run the two scoped `rg` checks from Step 1, narrowed to `cmd`, `internal`, active documentation, packaging, and test scripts. Expected: no active runtime path construction or copyable user command still points to the old name; remaining `knowns` matches are intentional technical identifiers or historical content.

### Task 5: Full verification and handoff

**Files:**
- Modify: none unless verification finds a directly related failure.

- [ ] **Step 1: Run formatting and package verification**

Run: `gofmt -w internal/paths internal/storage internal/registry internal/cli internal/runtimeinstall internal/runtimememory internal/runtimequeue internal/search internal/server internal/services internal/lsp internal/lspdaemon internal/doctor internal/util internal/tunnel`; then `GOCACHE=/tmp/knownme-gocache go test ./internal/paths ./internal/storage ./internal/registry ./internal/cli ./internal/runtimeinstall ./internal/runtimememory ./internal/runtimequeue ./internal/search ./internal/server/... ./internal/services ./internal/lsp/... ./internal/lspdaemon ./internal/doctor ./internal/util ./internal/tunnel -count=1`; then `git diff --check`.

- [ ] **Step 2: Run the full Go test suite**

Run: `GOCACHE=/tmp/knownme-gocache go test ./... -count=1`. Expected: exit code 0 with no failing packages.

- [ ] **Step 3: Build the renamed CLI**

Run: `GOCACHE=/tmp/knownme-gocache go build -o /tmp/knownme-cli ./cmd/knownme`. Expected: exit code 0 and `/tmp/knownme-cli` exists.

- [ ] **Step 4: Review the final diff and report environment limits**

Run `git status --short`, `git diff --stat`, and `git diff --check`. Confirm the diff excludes pre-existing README/image/artifact changes. If `.git/index.lock` remains unwritable, report that the code is verified but cannot be committed here.
