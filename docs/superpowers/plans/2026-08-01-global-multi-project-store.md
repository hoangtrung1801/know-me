# Global Multi-Project Store Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Store all Knowns records under `~/.knowns`, associate tasks and docs with an optional project ID, and support collision-safe global or project-filtered access.

**Architecture:** Keep the existing file stores, but point them at one global root and carry active project/repository context separately. Reuse the global registry as the canonical path-to-project-ID mapping, serialize `projectId` in task/doc frontmatter, and use composite `<projectId>:<localKey>` identities at every lookup, reference, index, and graph boundary.

**Tech Stack:** Go standard library, Cobra, chi, YAML frontmatter, existing SQLite/vector search implementation, existing Go and UI test tooling.

## Global Constraints

- `~/.knowns` is the only active data root; do not create or mutate repository-local `.knowns` directories.
- Tasks and docs are globally visible by default; an exact `projectId` filter excludes global and other-project records.
- `projectId` is optional; creates inherit the active project unless explicitly created as global.
- Scoped external identities use `<projectId>:<taskId-or-docPath>`; scoped physical paths use the Windows-safe `--` separator.
- Existing local `.knowns` data is left untouched and is not migrated.
- Add no dependency or database layer.

---

### Task 1: Central Project Registry and Store Context

**Files:**
- Modify: `internal/registry/registry.go`
- Modify: `internal/registry/registry_test.go`
- Modify: `internal/storage/store.go`
- Modify: `internal/storage/store_test.go`
- Modify: `internal/storage/config_store.go`
- Modify: `internal/storage/manager.go`
- Modify: `internal/storage/manager_test.go`

**Interfaces:**
- Produces: `(*registry.Registry).FindByWorkingDir(start string) *registry.Project`
- Produces: `storage.NewProjectStore(globalRoot, projectID, repositoryRoot string) *storage.Store`
- Produces: `(*storage.Store).RepositoryRoot() string`
- Produces: `storage.ProjectConfigRoot(globalRoot, projectID string) string`
- Produces: store fields `ProjectID string` and `ProjectRoot string`

- [ ] **Step 1: Write failing registry and store tests**

```go
func TestRegistryAddAndResolveWithoutLocalKnowns(t *testing.T) {
	root := t.TempDir()
	nested := filepath.Join(root, "src", "pkg")
	if err := os.MkdirAll(nested, 0o755); err != nil { t.Fatal(err) }
	r := NewRegistryWithPath(filepath.Join(t.TempDir(), "registry.json"))
	if err := r.Load(); err != nil { t.Fatal(err) }
	p, err := r.Add(root)
	if err != nil { t.Fatal(err) }
	if got := r.FindByWorkingDir(nested); got == nil || got.ID != p.ID {
		t.Fatalf("resolved project = %#v, want %q", got, p.ID)
	}
}

func TestNewProjectStoreSeparatesDataAndRepositoryRoots(t *testing.T) {
	globalRoot, repo := t.TempDir(), t.TempDir()
	store := NewProjectStore(globalRoot, "p12345", repo)
	if store.Root != globalRoot || store.ProjectID != "p12345" || store.RepositoryRoot() != repo {
		t.Fatalf("unexpected store context: %#v", store)
	}
	if got := store.Config.configPath(); got != filepath.Join(globalRoot, "projects", "p12345", "config.json") {
		t.Fatalf("config path = %q", got)
	}
}
```

- [ ] **Step 2: Run tests and verify the missing APIs fail**

Run: `go test ./internal/registry ./internal/storage -run 'TestRegistryAddAndResolveWithoutLocalKnowns|TestNewProjectStoreSeparatesDataAndRepositoryRoots' -count=1`

Expected: FAIL because path registration still requires `.knowns` and project-store context does not exist.

- [ ] **Step 3: Implement registry resolution and contextual stores**

```go
func (r *Registry) FindByWorkingDir(start string) *Project {
	abs, err := filepath.Abs(start)
	if err != nil { return nil }
	var best *Project
	for i := range r.Projects {
		rel, err := filepath.Rel(r.Projects[i].Path, abs)
		if err != nil || rel == ".." || strings.HasPrefix(rel, ".."+string(filepath.Separator)) { continue }
		if best == nil || len(r.Projects[i].Path) > len(best.Path) { best = &r.Projects[i] }
	}
	return best
}

func ProjectConfigRoot(globalRoot, projectID string) string {
	return filepath.Join(globalRoot, "projects", projectID)
}

func NewProjectStore(globalRoot, projectID, repositoryRoot string) *Store {
	s := NewStore(globalRoot)
	s.ProjectID, s.ProjectRoot = projectID, repositoryRoot
	s.Config = &ConfigStore{root: ProjectConfigRoot(globalRoot, projectID)}
	s.Tasks.projectID, s.Docs.projectID = projectID, projectID
	return s
}
```

Change `Registry.Add` to require an existing directory, reuse an exact canonical path, and stop checking for `.knowns/config.json`. Change `Manager.Switch` to resolve/register through the registry and construct `NewProjectStore(GlobalRootPath(), p.ID, p.Path)`. Initialize shared directories at the global root and project config at `projects/<id>/config.json`, passing the registry ID into `initDefault` instead of deriving an ID from the project name.

- [ ] **Step 4: Run the package tests**

Run: `go test ./internal/registry ./internal/storage -count=1`

Expected: PASS.

- [ ] **Step 5: Commit the central context slice**

```bash
git add internal/registry internal/storage
git commit -m "feat: centralize project store context"
```

---

### Task 2: Collision-Safe Project-Scoped Tasks

**Files:**
- Create: `internal/storage/scoped_key.go`
- Create: `internal/storage/scoped_key_test.go`
- Modify: `internal/models/task.go`
- Modify: `internal/storage/task_store.go`
- Modify: `internal/storage/task_store_test.go`
- Modify: `internal/storage/task_lifecycle_transaction.go`
- Modify: `internal/storage/version_store.go`

**Interfaces:**
- Produces: `storage.ScopedKey(projectID, localKey string) string`
- Produces: `storage.SplitScopedKey(key string) (projectID, localKey string)`
- Produces: `(*storage.TaskStore).List(projectID ...string) ([]*models.Task, error)`
- Produces: `(*storage.TaskStore).CreateGlobal(task *models.Task) error`
- Produces: `models.Task.ProjectID string`

- [ ] **Step 1: Write a failing scoped-task behavior test**

```go
func TestTaskStoreScopesDuplicateIDs(t *testing.T) {
	root := t.TempDir()
	p1 := NewProjectStore(root, "p1", "/repo/one")
	p2 := NewProjectStore(root, "p2", "/repo/two")
	for _, s := range []*Store{p1, p2} {
		if err := os.MkdirAll(filepath.Join(root, "tasks"), 0o755); err != nil { t.Fatal(err) }
		if err := s.Tasks.Create(&models.Task{ID: "same01", Title: s.ProjectID, Status: "todo", Priority: "medium"}); err != nil { t.Fatal(err) }
	}
	if _, err := p1.Tasks.Get("same01"); err == nil || !strings.Contains(err.Error(), "ambiguous") { t.Fatalf("error = %v", err) }
	got, err := p1.Tasks.Get("p2:same01")
	if err != nil || got.ProjectID != "p2" { t.Fatalf("task = %#v, err = %v", got, err) }
	filtered, err := p1.Tasks.List("p1")
	if err != nil || len(filtered) != 1 || filtered[0].ProjectID != "p1" { t.Fatalf("tasks = %#v, err = %v", filtered, err) }
}
```

- [ ] **Step 2: Run the test and verify RED**

Run: `go test ./internal/storage -run TestTaskStoreScopesDuplicateIDs -count=1`

Expected: FAIL because task frontmatter has no `projectId`, duplicate IDs are deduplicated, and prefixed lookup is unsupported.

- [ ] **Step 3: Implement the minimum scoped-key and task changes**

```go
func ScopedKey(projectID, localKey string) string {
	if projectID == "" { return localKey }
	return projectID + ":" + localKey
}

func SplitScopedKey(key string) (string, string) {
	projectID, localKey, ok := strings.Cut(key, ":")
	if !ok { return "", key }
	return projectID, localKey
}
```

Add `ProjectID string \`json:"projectId,omitempty" yaml:"projectId,omitempty"\`` to `models.Task` and `taskFrontmatter`. Key the list deduplication map by `ScopedKey(task.ProjectID, task.ID)`. Write scoped files as `task-<projectId>--<id> - <title>.md`; keep the existing filename for global tasks. Make `Get`, archive/unarchive/delete, tombstones, versions, parent/subtask derivation, and lifecycle transactions resolve the same composite key before mutating. `Create` fills an empty `ProjectID` from the store context; `CreateGlobal` bypasses that default.

- [ ] **Step 4: Run task storage and lifecycle tests**

Run: `go test ./internal/storage ./internal/tasklifecycle -count=1`

Expected: PASS.

- [ ] **Step 5: Commit scoped task storage**

```bash
git add internal/models/task.go internal/storage internal/tasklifecycle
git commit -m "feat: scope tasks by optional project id"
```

---

### Task 3: Collision-Safe Project-Scoped Docs and References

**Files:**
- Modify: `internal/models/doc.go`
- Modify: `internal/storage/doc_store.go`
- Modify: `internal/storage/doc_store_test.go`
- Modify: `internal/storage/reference_resolution.go`
- Modify: `internal/storage/reference_resolution_test.go`
- Modify: `internal/references/rewrite.go`
- Modify: `internal/references/rewrite_test.go`

**Interfaces:**
- Produces: `(*storage.DocStore).List(projectID ...string) ([]*models.Doc, error)`
- Produces: `(*storage.DocStore).CreateGlobal(doc *models.Doc) error`
- Produces: `models.Doc.ProjectID string`
- Consumes: `storage.ScopedKey` and `storage.SplitScopedKey`

- [ ] **Step 1: Write a failing duplicate-doc and reference test**

```go
func TestDocStoreScopesDuplicatePaths(t *testing.T) {
	root := t.TempDir()
	p1 := NewProjectStore(root, "p1", "/repo/one")
	p2 := NewProjectStore(root, "p2", "/repo/two")
	for _, s := range []*Store{p1, p2} {
		d := &models.Doc{Path: "specs/auth", Title: s.ProjectID, Content: "body"}
		if err := s.Docs.Create(d); err != nil { t.Fatal(err) }
	}
	if _, err := p1.Docs.Get("specs/auth"); err == nil || !strings.Contains(err.Error(), "ambiguous") { t.Fatalf("error = %v", err) }
	got, err := p1.Docs.Get("p2:specs/auth")
	if err != nil || got.ProjectID != "p2" { t.Fatalf("doc = %#v, err = %v", got, err) }
	if _, err := os.Stat(filepath.Join(root, "docs", "p2--specs", "auth.md")); err != nil { t.Fatal(err) }
}
```

- [ ] **Step 2: Run the test and verify RED**

Run: `go test ./internal/storage -run TestDocStoreScopesDuplicatePaths -count=1`

Expected: FAIL because docs do not persist or resolve project scope.

- [ ] **Step 3: Implement scoped doc paths and reference resolution**

Add `ProjectID` to `models.Doc` and `docFrontmatter`. Convert a scoped logical doc path to the physical path by prefixing its first path component:

```go
func scopedDocPath(projectID, docPath string) string {
	if projectID == "" { return docPath }
	parts := strings.SplitN(docPath, "/", 2)
	parts[0] = projectID + "--" + parts[0]
	return strings.Join(parts, "/")
}
```

Keep `Doc.Path` unprefixed after parsing and use `ScopedKey(doc.ProjectID, doc.Path)` for external identity. Make unprefixed `Get`, update, rename, delete, history, and rewrite operations reject ambiguity before mutation. Resolve unprefixed task/doc references within the source record's project first, then globally only when unique; preserve explicit prefixed references exactly.

- [ ] **Step 4: Run doc and reference tests**

Run: `go test ./internal/storage ./internal/references -count=1`

Expected: PASS.

- [ ] **Step 5: Commit scoped docs and references**

```bash
git add internal/models/doc.go internal/storage internal/references
git commit -m "feat: scope docs and references by project id"
```

---

### Task 4: Initialize and Resolve Projects Without Local `.knowns`

**Files:**
- Modify: `internal/cli/helpers.go`
- Modify: `internal/cli/init.go`
- Modify: `internal/cli/init_test.go`
- Modify: `internal/cli/root.go`
- Modify: `internal/cli/browser.go`
- Modify: `internal/cli/browser_test.go`
- Modify: `internal/mcp/server.go`
- Modify: `internal/mcp/handlers/project.go`
- Create: `internal/mcp/handlers/project_test.go`
- Modify: `internal/server/routes/workspace.go`
- Modify: `internal/server/routes/workspace_test.go`

**Interfaces:**
- Produces: `cli.resolveStore(start string) (*storage.Store, error)`
- Consumes: registry working-directory resolution and `storage.NewProjectStore`

- [ ] **Step 1: Write failing CLI/MCP project-resolution tests**

```go
func TestResolveStoreUsesRegistryWithoutLocalKnowns(t *testing.T) {
	home, repo := t.TempDir(), t.TempDir()
	t.Setenv("HOME", home)
	r := registry.NewRegistry()
	if err := r.Load(); err != nil { t.Fatal(err) }
	p, err := r.Add(repo)
	if err != nil { t.Fatal(err) }
	store := storage.NewProjectStore(storage.GlobalRootPath(), p.ID, repo)
	if err := store.Init(filepath.Base(repo)); err != nil { t.Fatal(err) }
	got, err := resolveStore(filepath.Join(repo, "subdir"))
	if err != nil || got.ProjectID != p.ID || got.RepositoryRoot() != repo { t.Fatalf("store = %#v, err = %v", got, err) }
}
```

Also change the existing init test to assert that `<repo>/.knowns` does not exist and `~/.knowns/projects/<projectId>/config.json` does exist.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `go test ./internal/cli ./internal/mcp/handlers ./internal/server/routes -run 'ResolveStoreUsesRegistryWithoutLocalKnowns|Init.*Global|Project.*WithoutLocalKnowns|Workspace.*Central' -count=1`

Expected: FAIL because all three entry points still discover repository-local `.knowns`.

- [ ] **Step 3: Replace local-marker discovery**

```go
func resolveStore(start string) (*storage.Store, error) {
	r := registry.NewRegistry()
	if err := r.Load(); err != nil { return nil, err }
	p := r.FindByWorkingDir(start)
	if p == nil { return nil, fmt.Errorf("no registered Knowns project found from %s; run 'knowns init'", start) }
	return storage.NewProjectStore(storage.GlobalRootPath(), p.ID, p.Path), nil
}
```

Make `knowns init` register the repository first, construct a project store, and initialize its central config. Remove the steps that create `.knowns`, regenerate `.knowns/.gitignore`, or infer readiness from a local marker. Keep repository guidance/setup files and code/LSP configuration anchored to the repository root. MCP `project.set`, browser project switching, workspace browse/list, and server manager switching must validate registry entries plus central configs instead of local `.knowns/config.json`. Auto-scan may list already registered projects under a requested directory but must not invent projects from arbitrary folders.

- [ ] **Step 4: Run CLI, MCP project, and workspace tests**

Run: `go test ./internal/cli ./internal/mcp/... ./internal/server/... -count=1`

Expected: PASS.

- [ ] **Step 5: Commit global project initialization**

```bash
git add internal/cli internal/mcp internal/server/routes/workspace.go internal/server/routes/workspace_test.go
git commit -m "feat: resolve projects from global registry"
```

---

### Task 5: Expose Global Creation, Project Filters, and Composite IDs

**Files:**
- Modify: `internal/cli/task.go`
- Modify: `internal/cli/doc.go`
- Modify: `internal/cli/search.go`
- Modify: `internal/cli/task_lifecycle_test.go`
- Modify: `internal/cli/doc_test.go`
- Modify: `internal/mcp/handlers/task.go`
- Modify: `internal/mcp/handlers/doc.go`
- Modify: `internal/mcp/handlers/search.go`
- Modify: `internal/mcp/handlers/mutation_response_test.go`
- Modify: `internal/server/routes/tasks.go`
- Modify: `internal/server/routes/docs.go`
- Modify: `internal/server/routes/tasks_lifecycle_test.go`
- Modify: `internal/server/routes/docs_history_test.go`
- Modify: `ui/src/models/task.ts`
- Modify: `ui/src/api/client.ts`
- Modify: `ui/src/contexts/DocsContext.tsx`

**Interfaces:**
- CLI create flag: `--global`
- CLI list/search flag: `--project-id <id>`
- MCP create argument: `global: boolean`
- MCP list/search/retrieve argument: `projectId: string`
- HTTP create field/query: `global=true`
- HTTP list/search query: `projectId=<id>`

- [ ] **Step 1: Write failing entry-point tests**

```go
func TestTaskListProjectFilterAndGlobalCreate(t *testing.T) {
	store := storage.NewProjectStore(t.TempDir(), "p1", t.TempDir())
	if err := store.Tasks.Create(&models.Task{ID: "scoped", Title: "scoped", Status: "todo", Priority: "medium"}); err != nil { t.Fatal(err) }
	if err := store.Tasks.CreateGlobal(&models.Task{ID: "global", Title: "global", Status: "todo", Priority: "medium"}); err != nil { t.Fatal(err) }
	got, err := store.Tasks.List("p1")
	if err != nil || len(got) != 1 || got[0].ID != "scoped" { t.Fatalf("tasks = %#v, err = %v", got, err) }
}
```

Add handler tests asserting that omitted filters return both records, `projectId=p1` returns only the scoped record, `global=true` leaves `projectId` empty, and mutation summaries return composite IDs for scoped records.

- [ ] **Step 2: Run focused handler tests and verify RED**

Run: `go test ./internal/cli ./internal/mcp/handlers ./internal/server/routes -run 'ProjectFilter|GlobalCreate|Composite' -count=1`

Expected: FAIL because flags/arguments/query parsing and project metadata are missing.

- [ ] **Step 3: Wire the existing stores through each boundary**

Use one consistent pattern:

```go
projectID, _ := cmd.Flags().GetString("project-id")
tasks, err := store.Tasks.List(projectID)

global, _ := cmd.Flags().GetBool("global")
if global {
	err = store.Tasks.CreateGlobal(task)
} else {
	err = store.Tasks.Create(task)
}
```

Return `projectId` and the composite key in task/doc JSON responses while retaining local `id`/`path` fields. Add `projectId?: string` and `key: string` to UI task/doc API types so existing rendering remains compatible and duplicate React/action keys can use `key`.

- [ ] **Step 4: Run boundary and UI type checks**

Run: `go test ./internal/cli ./internal/mcp/... ./internal/server/... -count=1`

Run: `npm run build` from `ui`

Expected: all commands exit 0.

- [ ] **Step 5: Commit entry-point support**

```bash
git add internal/cli internal/mcp internal/server/routes ui/src/models/task.ts ui/src/api/client.ts
git commit -m "feat: expose project-scoped task and doc access"
```

---

### Task 6: Scope Search, Retrieval, and Graph Data

**Files:**
- Modify: `internal/models/search.go`
- Modify: `internal/search/types.go`
- Modify: `internal/search/chunker.go`
- Modify: `internal/search/index.go`
- Modify: `internal/search/engine.go`
- Modify: `internal/search/lexical_backend.go`
- Modify: `internal/search/search_test.go`
- Modify: `internal/server/routes/graph.go`
- Modify: `internal/server/routes/graph_test.go`
- Modify: `internal/storage/structural_edges.go`
- Modify: `internal/storage/structural_traversal.go`
- Modify: `internal/storage/structural_traversal_test.go`

**Interfaces:**
- Produces: `search.SearchOptions.ProjectID string`
- Produces: `models.RetrievalOptions.ProjectID string`
- Produces: `search.Chunk.ProjectID string`
- Produces: `models.SearchResult.ProjectID string`
- Graph query: `GET /api/graph?projectId=<id>`

- [ ] **Step 1: Write failing search and graph isolation tests**

```go
func TestGraphFiltersProjectAndDropsOutsideEdges(t *testing.T) {
	store := storage.NewStore(t.TempDir())
	createTask(t, store, &models.Task{ID: "one", ProjectID: "p1", Parent: "p2:two"})
	createTask(t, store, &models.Task{ID: "two", ProjectID: "p2"})
	rr := graphRequest(t, store, "?projectId=p1")
	var body struct { Nodes []GraphNode `json:"nodes"`; Edges []GraphEdge `json:"edges"` }
	if err := json.NewDecoder(rr.Body).Decode(&body); err != nil { t.Fatal(err) }
	if len(body.Nodes) != 1 || body.Nodes[0].ID != "task:p1:one" || len(body.Edges) != 0 {
		t.Fatalf("graph = %#v", body)
	}
}
```

Add a search test that indexes two same-local-ID tasks from different projects, verifies distinct chunk IDs, verifies global results contain both composite IDs, and verifies `SearchOptions{ProjectID: "p1"}` returns only `p1`.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `go test ./internal/search ./internal/server/routes ./internal/storage -run 'Project|Scoped|OutsideEdges' -count=1`

Expected: FAIL because search and graph currently key records by local task ID/doc path.

- [ ] **Step 3: Add project metadata and composite keys end to end**

```go
type SearchOptions struct {
	Query             string
	Type              string
	Mode              string
	Status            string
	Priority          string
	Assignee          string
	Label             string
	Tag               string
	Limit             int
	IncludeHistorical bool
	Purpose           SearchPurpose
	ProjectID         string
	taskVisibility    taskVisibility
	taskSnapshot      *taskSearchSnapshot
}

func matchesProject(recordProjectID, filter string) bool {
	return filter == "" || recordProjectID == filter
}
```

Put `ProjectID` on chunks, search results, retrieval candidates, context metadata, and citations. Bump `ChunkVersion` once so existing global indices rebuild. Use composite task/doc keys in chunk IDs, vector delete/update operations, lexical maps, deduplication, reference expansion, and structural edges. Graph node IDs must be composite; when filtered, build the retained-node set first and emit only edges whose endpoints are both retained.

- [ ] **Step 4: Run search, graph, and structural tests**

Run: `go test ./internal/search ./internal/server/routes ./internal/storage -count=1`

Expected: PASS.

- [ ] **Step 5: Commit scoped discovery**

```bash
git add internal/models/search.go internal/search internal/server/routes/graph.go internal/server/routes/graph_test.go internal/storage
git commit -m "feat: scope search and graph records by project"
```

---

### Task 7: Preserve Repository-Root Consumers and Complete Documentation

**Files:**
- Modify: `internal/mcp/handlers/code.go`
- Modify: `internal/cli/model.go`
- Modify: `internal/cli/runtime_memory.go`
- Modify: `internal/server/server.go`
- Modify: `internal/runtimememory/runtimememory.go`
- Modify: `internal/readiness/readiness.go`
- Modify: `tests/e2e_cli_test.go`
- Modify: `tests/e2e_mcp_test.go`
- Modify: `README.md`
- Modify: `ARCHITECTURE.md`
- Modify: `docs/en/getting-started/first-project.md`
- Modify: `docs/en/reference/configuration.md`
- Modify: `docs/en/reference/commands.md`

**Interfaces:**
- Consumes: `(*storage.Store).RepositoryRoot()` wherever code currently derives a repository path from `store.Root`.

- [ ] **Step 1: Write a failing repository-root regression test**

```go
func TestProjectStoreCodeRootIsRepositoryNotGlobalStore(t *testing.T) {
	globalRoot, repo := t.TempDir(), t.TempDir()
	store := storage.NewProjectStore(globalRoot, "p1", repo)
	if got := projectRoot(store); got != repo {
		t.Fatalf("projectRoot = %q, want %q", got, repo)
	}
}
```

Extend CLI/MCP end-to-end tests to set a temporary `HOME`, initialize two repositories, create same-local-ID scoped fixtures plus one global fixture, list globally, filter by each project ID, and confirm neither repository gets a `.knowns` directory.

- [ ] **Step 2: Run the regression and end-to-end tests to verify RED**

Run: `go test ./internal/mcp/handlers ./tests -run 'ProjectStoreCodeRoot|GlobalMultiProject' -count=1`

Expected: FAIL because repository consumers still derive `filepath.Dir(store.Root)` and the end-to-end behavior is absent.

- [ ] **Step 3: Replace root derivation and update user documentation**

Replace every project-path derivation from `store.Root` with `store.RepositoryRoot()`. Keep global data paths using `store.Root`. Update English primary documentation to show the central layout, registry-based initialization, optional `projectId`, `--global`, `--project-id`, composite identities, and the explicit absence of automatic migration. Do not manually edit `.knowns/docs`; translated documentation can follow after the English behavior stabilizes.

- [ ] **Step 4: Run complete verification**

Run `gofmt -w` on every changed `.go` file listed in Tasks 1–7.

Run: `go test ./... -count=1`

Run: `go vet ./...`

Run: `npm run build` from `ui`

Run: `git diff --check`

Expected: all commands exit 0 with no test failures, vet findings, build errors, or whitespace errors.

- [ ] **Step 5: Commit the integration and docs slice**

```bash
git add internal tests README.md ARCHITECTURE.md docs/en ui
git commit -m "feat: complete global multi-project storage"
```
