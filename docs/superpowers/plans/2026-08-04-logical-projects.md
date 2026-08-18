# Logical Projects Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Store and select projects by ID and name while making creation pathless and canonicalizing runtime paths.

**Architecture:** The registry keeps runtime paths for CLI/MCP compatibility but canonicalizes them and deduplicates aliases. Workspace creation becomes name-only; existing switching remains. Existing task and document `projectId` fields remain unchanged.

**Tech Stack:** Go, chi, React, TypeScript.

## Global Constraints

- Do not delete project directories or repository data.
- Do not add dependencies.
- Preserve existing project IDs during registry migration.
- Use regression tests before production edits.

---

### Task 1: Make registry projects logical records

**Files:**
- Modify: `internal/registry/registry.go`
- Modify: `internal/registry/registry_test.go`

**Interfaces:**
- Produces: canonicalized `Project.Path` and `Create(name, path string)` with an empty path allowed.
- Preserves: `Add`, `FindByPath`, `FindByWorkingDir`, and `Scan` for runtime repository discovery.

- [ ] **Step 1: Write failing legacy-migration and same-name tests**

```go
func TestRegistryLoadDropsLegacyPathsAndCollapsesAliases(t *testing.T) {
	file := filepath.Join(t.TempDir(), "registry.json")
	os.WriteFile(file, []byte(`[{"id":"one","name":"One","path":"/same"},{"id":"two","name":"Two","path":"/same"}]`), 0644)
	r := NewRegistryWithPath(file)
	if err := r.Load(); err != nil { t.Fatal(err) }
	if len(r.Projects) != 1 || r.Projects[0].ID != "two" { t.Fatalf("projects = %#v", r.Projects) }
}

func TestRegistryCreateAllowsRepeatedNames(t *testing.T) {
	r := NewRegistryWithPath(filepath.Join(t.TempDir(), "registry.json")); _ = r.Load()
	a, _ := r.Create("Launch"); b, _ := r.Create("Launch")
	if a.ID == b.ID || len(r.Projects) != 2 { t.Fatal("projects were deduplicated") }
}
```

- [ ] **Step 2: Run red test**

Run: `go test ./internal/registry`

Expected: FAIL because registry remains path-backed.

- [ ] **Step 3: Implement the minimum migration**

```go
type Project struct { ID string `json:"id"`; Name string `json:"name"`; LastUsed time.Time `json:"lastUsed"` }
func (r *Registry) Create(name string) (*Project, error) { /* trim name, append generated-ID record, save */ }
```

Decode the legacy `path` only while loading, retain the last identical non-empty path record, then save records without a path.

- [ ] **Step 4: Run green test**

Run: `go test ./internal/registry`

Expected: PASS.

### Task 2: Make workspace project creation pathless

**Files:**
- Modify: `internal/server/routes/workspace.go`
- Modify: `internal/server/routes/workspace_test.go`
- Modify: `internal/storage/manager.go`
- Modify: `internal/server/routes/router.go`
- Modify: `internal/server/server_picker_test.go`

**Interfaces:**
- Consumes: `Registry.Create(name string)` and `Registry.Remove(id string)`.
- Produces: `GET /workspaces`, `POST /workspaces` with `{ "name": "..." }`, and `DELETE /workspaces/{id}`.
- Preserves: runtime switch/scan APIs.

- [ ] **Step 1: Write failing name-only route test**

```go
func TestWorkspaceCreateCreatesLogicalProject(t *testing.T) {
	r, _, manager, _ := setupWorkspaceTest(t)
	req := httptest.NewRequest(http.MethodPost, "/workspaces", strings.NewReader(`{"name":"Launch"}`))
	w := httptest.NewRecorder(); r.ServeHTTP(w, req)
	if w.Code != http.StatusCreated || len(manager.GetRegistry().Projects) != 2 { t.Fatal(w.Body.String()) }
}
```

- [ ] **Step 2: Run red test**

Run: `go test ./internal/server/routes ./internal/server`

Expected: FAIL because setup and routes use paths.

- [ ] **Step 3: Implement reduced routes**

```go
func (wr *WorkspaceRoutes) Register(r chi.Router) {
	r.Get("/workspaces", wr.list)
	r.Post("/workspaces", wr.create)
	r.Delete("/workspaces/{id}", wr.remove)
}
```

Make `create` decode only `Name` and call `Registry.Create(name, "")`; retain filesystem-backed switch/scan handlers.

- [ ] **Step 4: Run green test**

Run: `go test ./internal/server/routes ./internal/server`

Expected: PASS.

### Task 3: Remove path requirement from project management UI

**Files:**
- Modify: `ui/src/api/client.ts`
- Modify: `ui/src/pages/ProjectsPage.tsx`
- Modify: `ui/src/AppShell.tsx`
- Modify: `ui/src/components/organisms/AppSidebar.tsx`
- Preserve: `ui/src/components/organisms/WorkspacePicker.tsx` for runtime switching.

**Interfaces:**
- Produces: `workspaceApi.create({ name })` and name/ID-only project cards.
- Preserves: `workspaceApi.list`, `workspaceApi.remove`, and `useWorkspaceProjects`.

- [ ] **Step 1: Write failing workspace-client assertion**

```ts
const project = await workspaceApi.create({ name: "Launch" });
expect(project).toMatchObject({ name: "Launch" });
expect("path" in project).toBe(false);
```

- [ ] **Step 2: Run red type check**

Run: `cd ui && npm run typecheck`

Expected: FAIL after the type assertion is added because the path property still exists.

- [ ] **Step 3: Implement minimal UI removal**

```ts
export interface WorkspaceProject { id: string; name: string; lastUsed: string; }
async create(project: { name: string }): Promise<WorkspaceProject> { /* existing POST */ }
```

Remove the project path input and path display from ProjectsPage. Keep WorkspacePicker and task/document project selectors intact.

- [ ] **Step 4: Run green UI checks**

Run: `cd ui && npm run typecheck && npm run build`

Expected: PASS.

### Task 4: Verify CLI and MCP canonical runtime resolution

**Files:**
- Modify: `internal/cli/helpers.go`
- Modify: `internal/cli/project_store_test.go`
- Modify: `internal/mcp/handlers/project.go`
- Modify: `internal/mcp/handlers/project_test.go`

**Interfaces:**
- Produces: canonical path resolution through existing registry runtime APIs.

- [ ] **Step 1: Write failing local-store resolution test**

```go
func TestResolveProjectStoreUsesLocalStoreWithoutRegistry(t *testing.T) {
	root := t.TempDir(); os.MkdirAll(filepath.Join(root, ".knowns"), 0755)
	store, err := resolveProjectStore(root)
	if err != nil || store.Root != filepath.Join(root, ".knowns") { t.Fatal(err) }
}
```

- [ ] **Step 2: Run red test**

Run: `go test ./internal/cli ./internal/mcp/handlers`

Expected: FAIL because resolution requires a registry path record.

- [ ] **Step 3: Implement local runtime resolution**

```go
func resolveProjectStore(start string) (*storage.Store, error) {
	root := filepath.Join(start, ".knowns")
	if _, err := os.Stat(filepath.Join(root, "config.json")); err == nil { return storage.NewStore(root), nil }
	return nil, fmt.Errorf("no Know-Me project found from %s", start)
}
```

Keep MCP `detect` and `set` on the runtime registry path APIs; verify symlink aliases resolve to one project ID.

- [ ] **Step 4: Run green test**

Run: `go test ./internal/cli ./internal/mcp/handlers`

Expected: PASS.

### Task 5: Verify the full removal

**Files:**
- Modify: none unless verification finds a direct regression.

- [ ] **Step 1: Run Go tests**

Run: `go test ./...`

Expected: PASS.

- [ ] **Step 2: Run UI checks**

Run: `cd ui && npm run typecheck && npm run build`

Expected: PASS.

- [ ] **Step 3: Confirm no path-backed logical-project code remains**

Run: `rg -n "FindByPath|FindByWorkingDir|workspaceApi\.(switchProject|switchByPath|scan|autoScan|browse)|WorkspacePicker" internal/registry internal/server/routes ui/src`

Expected: no matches.
