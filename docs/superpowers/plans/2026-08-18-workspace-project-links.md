# Workspace Project Links Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `knowns init` bind the current workspace to a registry project ID through `.known-me.json`, and make every CLI store resolution honor that binding with a global-active fallback.

**Architecture:** Keep the global registry as the source of project identity. Add one small workspace-link reader/writer at the existing CLI resolution boundary; linked commands construct the existing `storage.NewProjectStore`, while unlinked commands construct the same store from `registry.GetActive()`.

**Tech Stack:** Go standard library, existing `registry.Registry`, `storage.NewProjectStore`, Cobra CLI, Go tests.

**Spec:** `docs/superpowers/specs/2026-08-18-workspace-project-link-design.md`

## Global Constraints

- `.known-me.json` contains only `{"projectId":"<id>"}`.
- The global registry remains canonical for project names, IDs, and `lastUsed`.
- Link discovery walks upward from the current directory and uses the nearest link.
- A missing link falls back to the registry's active project.
- A malformed or stale link fails without active-project fallback.
- The data root remains `~/.knowns`; no repository-local `.knowns` data is created.
- Existing unscoped tasks and docs are not migrated.
- Do not modify MCP/server project switching in this change.

---

### Task 1: Resolve the workspace link in the shared CLI store resolver

**Files:**
- Modify: `internal/cli/helpers.go`
- Modify: `internal/cli/project_store_test.go`

**Interfaces:**
- Produces `findWorkspaceProjectLink(start string) (projectID, workspaceRoot string, err error)`. It returns empty ID/root with a nil error when no link exists.
- Produces `resolveProjectStore(start string) (*storage.Store, error)` with linked and active-fallback behavior.

- [x] **Step 1: Write failing resolver tests**

Replace the current global-store expectation with focused tests like:

```go
func TestResolveProjectStoreUsesWorkspaceLink(t *testing.T) {
	home, repo := t.TempDir(), t.TempDir()
	nested := filepath.Join(repo, "src", "pkg")
	if err := os.MkdirAll(nested, 0o755); err != nil {
		t.Fatal(err)
	}
	t.Setenv("HOME", home)

	reg := registry.NewRegistryWithPath(filepath.Join(home, ".knowns", "registry.json"))
	if err := reg.Load(); err != nil {
		t.Fatal(err)
	}
	project, err := reg.Create("linked")
	if err != nil {
		t.Fatal(err)
	}
	link := []byte(fmt.Sprintf("{\n  \"projectId\": \"%s\"\n}\n", project.ID))
	if err := os.WriteFile(filepath.Join(repo, ".known-me.json"), link, 0o644); err != nil {
		t.Fatal(err)
	}

	store, err := resolveProjectStore(nested)
	if err != nil {
		t.Fatal(err)
	}
	if store.ProjectID != project.ID || store.RepositoryRoot() != repo {
		t.Fatalf("store = %#v, want project %q and root %q", store, project.ID, repo)
	}
}

func TestResolveProjectStoreFallsBackToActiveProject(t *testing.T) {
	home, repo := t.TempDir(), t.TempDir()
	t.Setenv("HOME", home)
	reg := registry.NewRegistryWithPath(filepath.Join(home, ".knowns", "registry.json"))
	if err := reg.Load(); err != nil {
		t.Fatal(err)
	}
	project, err := reg.Create("active")
	if err != nil {
		t.Fatal(err)
	}

	store, err := resolveProjectStore(filepath.Join(repo, "nested"))
	if err != nil {
		t.Fatal(err)
	}
	if store.ProjectID != project.ID || store.RepositoryRoot() != "" {
		t.Fatalf("store = %#v, want active project %q and no repository root", store, project.ID)
	}
}

func TestResolveProjectStoreRejectsBadWorkspaceLink(t *testing.T) {
	home, repo := t.TempDir(), t.TempDir()
	t.Setenv("HOME", home)
	reg := registry.NewRegistryWithPath(filepath.Join(home, ".knowns", "registry.json"))
	if err := reg.Load(); err != nil {
		t.Fatal(err)
	}
	_, err := reg.Create("active")
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(repo, ".known-me.json"), []byte(`{"projectId":"missing"}`), 0o644); err != nil {
		t.Fatal(err)
	}

	store, err := resolveProjectStore(repo)
	if err == nil || store != nil || !strings.Contains(err.Error(), "missing") {
		t.Fatalf("store = %#v, err = %v, want stale-link error without fallback", store, err)
	}
}
```

Add these two cases:

```go
func TestResolveProjectStoreRequiresActiveProject(t *testing.T) {
	home, repo := t.TempDir(), t.TempDir()
	t.Setenv("HOME", home)
	reg := registry.NewRegistryWithPath(filepath.Join(home, ".knowns", "registry.json"))
	if err := reg.Load(); err != nil {
		t.Fatal(err)
	}
	store, err := resolveProjectStore(repo)
	if err == nil || store != nil || !strings.Contains(err.Error(), "run 'knowns init'") {
		t.Fatalf("store = %#v, err = %v, want initialization error", store, err)
	}
}

func TestResolveProjectStoreRejectsMalformedWorkspaceLink(t *testing.T) {
	home, repo := t.TempDir(), t.TempDir()
	t.Setenv("HOME", home)
	if err := os.WriteFile(filepath.Join(repo, ".known-me.json"), []byte("{bad"), 0o644); err != nil {
		t.Fatal(err)
	}
	store, err := resolveProjectStore(repo)
	if err == nil || store != nil || !strings.Contains(err.Error(), ".known-me.json") {
		t.Fatalf("store = %#v, err = %v, want malformed-link error", store, err)
	}
}
```

- [x] **Step 2: Run the resolver tests to confirm the old behavior fails**

Run:

```bash
GOCACHE=/tmp/knowns-go-cache go test ./internal/cli -run 'TestResolveProjectStore' -count=1
```

Expected: the new link and fallback tests fail because the resolver currently
always returns a projectless global store.

- [x] **Step 3: Implement the minimal resolver**

In `internal/cli/helpers.go`:

1. Add a private `workspaceProjectLink` struct with a `ProjectID string`
   field tagged as JSON `projectId`.
2. Walk from `filepath.Abs(start)` toward its parent, reading the first
   `.known-me.json` encountered.
3. Return a parse/blank-ID error for a present but invalid link.
4. Load `registry.NewRegistry()`. For a link, verify the ID by scanning
   `reg.Projects`; for no link, use `reg.GetActive()`.
5. Return `storage.NewProjectStore(storage.GlobalRootPath(), id, linkRoot)`.
6. Return `no active project; run 'knowns init'` when no fallback project exists.

Do not call `SetActive` during resolution.

- [x] **Step 4: Run the resolver tests to confirm they pass**

Run:

```bash
GOCACHE=/tmp/knowns-go-cache go test ./internal/cli -run 'TestResolveProjectStore' -count=1
```

Expected: PASS.

- [x] **Step 5: Commit the resolver slice**

```bash
git add internal/cli/helpers.go internal/cli/project_store_test.go
git commit -m "feat: resolve CLI stores from workspace links"
```

### Task 2: Ensure project initialization writes project-scoped config

**Files:**
- Modify: `internal/storage/store.go`
- Modify: `internal/storage/config_store.go`
- Modify: `internal/storage/store_test.go`

**Interfaces:**
- `storage.Store.Init` continues initializing the shared root and now checks
  the actual configured config path.
- Project stores initialize `models.Project.ID` from their registry ID; global
  stores retain the existing name-derived ID.

- [x] **Step 1: Write a failing project-config regression test**

Add:

```go
func TestProjectStoreInitWritesConfigWhenGlobalConfigExists(t *testing.T) {
	globalRoot, repo := t.TempDir(), t.TempDir()
	if err := NewStore(globalRoot).Init("global"); err != nil {
		t.Fatal(err)
	}

	store := NewProjectStore(globalRoot, "p12345", repo)
	if err := store.Init("demo"); err != nil {
		t.Fatal(err)
	}

	project, err := store.Config.Load()
	if err != nil {
		t.Fatal(err)
	}
	if project.ID != "p12345" || project.Name != "demo" {
		t.Fatalf("project = %#v, want registry ID and name", project)
	}
}
```

- [x] **Step 2: Run the storage test to confirm it exposes the bug**

Run:

```bash
GOCACHE=/tmp/knowns-go-cache go test ./internal/storage -run 'TestProjectStoreInitWritesConfigWhenGlobalConfigExists' -count=1
```

Expected: FAIL because `Store.Init` currently checks `~/.knowns/config.json`
instead of the overridden project config path and derives the config ID from
the name.

- [x] **Step 3: Fix the config-path and ID initialization**

Change `Store.Init` to use `s.Config.configPath()` for its existence check and
pass `s.ProjectID` to `ConfigStore.initDefault`. Keep the name-derived ID when
the project ID is empty so global-store behavior remains compatible. Do not
change the shared directory layout.

- [x] **Step 4: Run storage tests**

Run:

```bash
GOCACHE=/tmp/knowns-go-cache go test ./internal/storage -count=1
```

Expected: PASS.

- [x] **Step 5: Commit the storage slice**

```bash
git add internal/storage/store.go internal/storage/config_store.go internal/storage/store_test.go
git commit -m "fix: initialize project-scoped config correctly"
```

### Task 3: Write the workspace link during `knowns init`

**Files:**
- Modify: `internal/cli/init.go`
- Modify: `internal/cli/init_test.go`
- Modify: `docs/en/reference/commands.md`

**Interfaces:**
- `runInit` creates the global store, registry project, project-scoped config,
  and current-directory `.known-me.json`.
- A private `writeWorkspaceProjectLink(dir, projectID string) error` writes
  the exact single-field JSON document.

- [x] **Step 1: Add the failing init-link assertions**

Add this focused test alongside the existing init tests:

```go
func TestRunInitWritesWorkspaceProjectLink(t *testing.T) {
	home, projectRoot := t.TempDir(), t.TempDir()
	t.Setenv("HOME", home)
	t.Setenv("USERPROFILE", home)
	t.Chdir(projectRoot)

	if err := runInit(initCmd, []string{"Launch"}); err != nil {
		t.Fatal(err)
	}

	link := readJSONFile(t, filepath.Join(projectRoot, ".known-me.json"))
	reg := registry.NewRegistryWithPath(filepath.Join(home, ".knowns", "registry.json"))
	if err := reg.Load(); err != nil {
		t.Fatal(err)
	}
	if len(reg.Projects) != 1 || link["projectId"] != reg.Projects[0].ID {
		t.Fatalf("link = %#v, projects = %#v", link, reg.Projects)
	}
	projectStore := storage.NewProjectStore(filepath.Join(home, ".knowns"), reg.Projects[0].ID, projectRoot)
	if _, err := projectStore.Config.Load(); err != nil {
		t.Fatalf("project config: %v", err)
	}
}
```

- [x] **Step 2: Run the init test to confirm it fails**

Run:

```bash
GOCACHE=/tmp/knowns-go-cache go test ./internal/cli -run 'TestRunInitWritesWorkspaceProjectLink' -count=1
```

Expected: FAIL because `runInit` currently writes no `.known-me.json` and no
project-scoped config.

- [x] **Step 3: Implement link creation and init ordering**

In `runInit`:

1. Get the current directory before deriving the default name.
2. Preserve the existing global `storage.NewStore(...).Init(name)` call.
3. Create and select the registry project as today.
4. Initialize `storage.NewProjectStore(globalRoot, project.ID, cwd)` so the
   project config is created under `projects/<id>`.
5. Marshal `workspaceProjectLink{ProjectID: project.ID}` with indentation,
   append a newline, and write it to `cwd/.known-me.json` with mode `0644`.
6. Keep the existing registration output and error propagation.

Update the Cobra `init` long help and the command reference to describe the
global store plus workspace link rather than a current-directory `.knowns`
directory. Keep existing name validation and flags unchanged.

- [x] **Step 4: Run init and resolver tests together**

Run:

```bash
GOCACHE=/tmp/knowns-go-cache go test ./internal/cli -run 'TestRunInit|TestResolveProjectStore' -count=1
```

Expected: PASS, including the existing default-name and blank-name tests.

- [x] **Step 5: Commit the init slice**

```bash
git add internal/cli/init.go internal/cli/init_test.go docs/en/reference/commands.md
git commit -m "feat: write workspace project link during init"
```

### Task 4: Run the complete verification gate

**Files:**
- Modify: none unless a verification command identifies a feature regression.

- [x] **Step 1: Run focused package tests**

```bash
GOCACHE=/tmp/knowns-go-cache go test ./internal/cli ./internal/storage ./internal/registry -count=1
```

Expected: PASS.

- [x] **Step 2: Run static checks**

```bash
GOCACHE=/tmp/knowns-go-cache go vet ./internal/cli ./internal/storage ./internal/registry
git diff --check
```

Expected: PASS.

- [x] **Step 3: Run a binary smoke test in an isolated HOME**

```bash
SMOKE_DIR=$(mktemp -d /tmp/knowns-link-smoke.XXXXXX)
SMOKE_HOME="$SMOKE_DIR/home"
SMOKE_REPO="$SMOKE_DIR/repo"
mkdir -p "$SMOKE_REPO/src/pkg"
GOCACHE=/tmp/knowns-go-cache go build -o "$SMOKE_DIR/knowns" ./cmd/knowns
(cd "$SMOKE_REPO" && env HOME="$SMOKE_HOME" "$SMOKE_DIR/knowns" init Smoke --no-wizard --no-open)
test -f "$SMOKE_REPO/.known-me.json"
(cd "$SMOKE_REPO/src/pkg" && env HOME="$SMOKE_HOME" "$SMOKE_DIR/knowns" status --plain)
sed -n '1,20p' "$SMOKE_REPO/.known-me.json"
sed -n '1,80p' "$SMOKE_HOME/.knowns/registry.json"
```

The init command must be run with its working directory set to
`$SMOKE_REPO`; then the final status command must be run from
`$SMOKE_REPO/src/pkg`. Inspect the link and registry files and confirm the
status command uses the same six-character project ID.

- [x] **Step 4: Run the full Go suite and project validation**

```bash
GOCACHE=/tmp/knowns-go-cache go test ./...
GOCACHE=/tmp/knowns-go-cache go run ./cmd/knowns validate --plain
```

Record any pre-existing environment-only failure separately from feature
failures; do not change unrelated worktree files to make the suite green.
