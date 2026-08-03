# Global Memos Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add global, titleless Markdown memos with create, search, edit, and delete support in the web UI, CLI, and MCP.

**Architecture:** Store each memo as one Markdown file with YAML timestamps under the global Knowns root. A small Go service owns validation, ordering, and case-insensitive search; REST, CLI, and MCP share it. The React page calls REST and reuses existing Knowns components.

**Tech Stack:** Go 1.24, Cobra, chi, mcp-go, yaml.v3, React 19, TypeScript, TanStack Router, Tailwind, Playwright.

## Global Constraints

- Memos are global across projects and remain usable through REST, CLI, and MCP without an active project.
- Store each memo at `~/.knowns/memos/<id>.md` with UTC `createdAt` and `updatedAt` YAML frontmatter.
- The feed is newest-first and grouped by the browser's local date.
- Search is a case-insensitive substring scan of Markdown content; add no index or dependency.
- Reject blank content and unsafe IDs at the shared boundary.
- Delete is permanent and requires confirmation in the web UI.
- Tags, attachments, pinning, archiving, and semantic search remain out of scope.

---

### Task 1: Markdown storage and shared memo service

**Files:**
- Create: `internal/models/memo.go`
- Create: `internal/storage/memo_store.go`
- Create: `internal/storage/memo_store_test.go`
- Create: `internal/memos/service.go`
- Create: `internal/memos/service_test.go`

**Interfaces:**
- Consumes: `storage.atomicWrite`, `storage.splitFrontmatter`, `storage.parseISO`, `storage.formatISO`, and `util.GenerateID`.
- Produces: `models.Memo`, `models.ErrMemoNotFound`, `models.ErrInvalidMemoContent`, `storage.NewMemoStore(root)`, and `memos.NewService(root)`.
- Service methods: `Add(content string) (*models.Memo, error)`, `List(query string) ([]*models.Memo, error)`, `Update(id, content string) (*models.Memo, error)`, and `Delete(id string) error`.

- [ ] **Step 1: Write failing storage and service lifecycle tests**

Create `internal/storage/memo_store_test.go`:

```go
package storage

import (
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/hoangtrung1801/known-me/internal/models"
)

func TestMemoStoreRoundTripOrderingAndDelete(t *testing.T) {
	root := t.TempDir()
	store := NewMemoStore(root)
	first := &models.Memo{ID: "aaaaaa", Content: "# First", CreatedAt: time.Date(2026, 8, 1, 9, 0, 0, 0, time.UTC), UpdatedAt: time.Date(2026, 8, 1, 9, 0, 0, 0, time.UTC)}
	second := &models.Memo{ID: "bbbbbb", Content: "Second **memo**", CreatedAt: time.Date(2026, 8, 2, 9, 0, 0, 0, time.UTC), UpdatedAt: time.Date(2026, 8, 2, 9, 0, 0, 0, time.UTC)}
	if err := store.Save(first); err != nil { t.Fatal(err) }
	if err := store.Save(second); err != nil { t.Fatal(err) }
	data, err := os.ReadFile(filepath.Join(root, "memos", "aaaaaa.md"))
	if err != nil { t.Fatal(err) }
	if !strings.HasPrefix(string(data), "---\ncreatedAt:") || !strings.Contains(string(data), "\n# First\n") { t.Fatalf("memo file = %q", data) }
	items, err := store.List()
	if err != nil { t.Fatal(err) }
	if len(items) != 2 || items[0].ID != second.ID || items[1].ID != first.ID { t.Fatalf("ordered memos = %+v", items) }
	if _, err := store.Get("../escape"); !errors.Is(err, models.ErrMemoNotFound) { t.Fatalf("unsafe ID error = %v", err) }
	if err := store.Delete(first.ID); err != nil { t.Fatal(err) }
	if _, err := store.Get(first.ID); !errors.Is(err, models.ErrMemoNotFound) { t.Fatalf("deleted memo error = %v", err) }
}
```

Create `internal/memos/service_test.go`:

```go
package memos

import (
	"errors"
	"testing"
	"time"

	"github.com/hoangtrung1801/known-me/internal/models"
)

func TestServiceLifecycleAndSearch(t *testing.T) {
	service := NewService(t.TempDir())
	now := time.Date(2026, 8, 2, 8, 0, 0, 0, time.UTC)
	service.now = func() time.Time { return now }
	first, err := service.Add("  # Morning\n\nCoffee  ")
	if err != nil { t.Fatal(err) }
	now = now.Add(time.Hour)
	second, err := service.Add("Ship the release")
	if err != nil { t.Fatal(err) }
	found, err := service.List("COFFEE")
	if err != nil { t.Fatal(err) }
	if len(found) != 1 || found[0].ID != first.ID { t.Fatalf("search = %+v", found) }
	now = now.Add(time.Hour)
	updated, err := service.Update(first.ID, "Edited **memo**")
	if err != nil { t.Fatal(err) }
	if !updated.CreatedAt.Equal(first.CreatedAt) || !updated.UpdatedAt.Equal(now) { t.Fatalf("updated = %+v", updated) }
	if err := service.Delete(second.ID); err != nil { t.Fatal(err) }
	if _, err := service.Add(" \n\t "); !errors.Is(err, models.ErrInvalidMemoContent) { t.Fatalf("blank add error = %v", err) }
	if _, err := service.Update(first.ID, " "); !errors.Is(err, models.ErrInvalidMemoContent) { t.Fatalf("blank update error = %v", err) }
}
```

- [ ] **Step 2: Run the tests and verify they fail**

```bash
go test ./internal/storage ./internal/memos
```

Expected: FAIL because the memo model, store, and service do not exist.

- [ ] **Step 3: Add the minimal model**

Create `internal/models/memo.go`:

```go
package models

import (
	"errors"
	"time"
)

var (
	ErrMemoNotFound = errors.New("memo not found")
	ErrInvalidMemoContent = errors.New("memo content is required")
)

type Memo struct {
	ID string `json:"id"`
	Content string `json:"content"`
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
}
```

- [ ] **Step 4: Implement the Markdown store**

Create `internal/storage/memo_store.go` with `MemoStore{root string}` and these exact methods:

```go
func NewMemoStore(root string) *MemoStore
func (s *MemoStore) List() ([]*models.Memo, error)
func (s *MemoStore) Get(id string) (*models.Memo, error)
func (s *MemoStore) Save(memo *models.Memo) error
func (s *MemoStore) Delete(id string) error
```

Use `filepath.Join(root, "memos")`, accept only basename IDs without `/` or `\\`, and map invalid/missing IDs to `models.ErrMemoNotFound`. `List` reads only `.md` files and sorts by `CreatedAt` descending, then ID descending. Parse with `splitFrontmatter` and `yaml.Unmarshal` into:

```go
type memoFrontmatter struct {
	CreatedAt string `yaml:"createdAt"`
	UpdatedAt string `yaml:"updatedAt"`
}
```

Render with the existing `formatISO` and `atomicWrite`:

```go
content := fmt.Sprintf("---\ncreatedAt: %s\nupdatedAt: %s\n---\n\n%s\n",
	formatISO(memo.CreatedAt), formatISO(memo.UpdatedAt), strings.TrimSpace(memo.Content))
```

Missing frontmatter, invalid timestamps, or zero timestamps return descriptive errors rather than silently inventing metadata.

- [ ] **Step 5: Implement the shared service**

Create `internal/memos/service.go`:

```go
type Service struct {
	store *storage.MemoStore
	now func() time.Time
}

func NewService(root string) *Service {
	return &Service{store: storage.NewMemoStore(root), now: func() time.Time { return time.Now().UTC() }}
}
```

`Add` and `Update` apply `strings.TrimSpace` and return `models.ErrInvalidMemoContent` for empty values. `Add` uses `util.GenerateID()` and one UTC timestamp for both fields. `Update` loads the existing memo, preserves `CreatedAt`, and replaces `UpdatedAt`. `List` calls the store once and, when query is non-empty, retains memos where `strings.Contains(strings.ToLower(memo.Content), strings.ToLower(strings.TrimSpace(query)))`. `Delete` delegates to the store.

- [ ] **Step 6: Format, verify, and commit**

```bash
gofmt -w internal/models/memo.go internal/storage/memo_store.go internal/storage/memo_store_test.go internal/memos/service.go internal/memos/service_test.go
go test ./internal/storage ./internal/memos
git add internal/models/memo.go internal/storage/memo_store.go internal/storage/memo_store_test.go internal/memos/service.go internal/memos/service_test.go
git commit -m "feat: add global memo storage"
```

Expected: tests PASS and only the five task files are committed.

---

### Task 2: Global REST API

**Files:**
- Create: `internal/server/routes/memos.go`
- Create: `internal/server/routes/memos_test.go`
- Modify: `internal/server/routes/router.go:129-139`

**Interfaces:**
- Consumes: `memos.Service` from Task 1 and route helpers `decodeJSON`, `respondJSON`, and `respondError`.
- Produces: `GET /memos`, `POST /memos`, `PATCH /memos/{id}`, and `DELETE /memos/{id}`.

- [ ] **Step 1: Write the failing route lifecycle test**

Create `internal/server/routes/memos_test.go`:

```go
package routes

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/hoangtrung1801/known-me/internal/memos"
	"github.com/hoangtrung1801/known-me/internal/models"
)

func TestMemoRoutesLifecycleAndSearch(t *testing.T) {
	router := chi.NewRouter()
	(&MemoRoutes{service: memos.NewService(t.TempDir())}).Register(router)
	create := httptest.NewRecorder()
	router.ServeHTTP(create, httptest.NewRequest(http.MethodPost, "/memos", bytes.NewBufferString(`{"content":"# Daily note"}`)))
	if create.Code != http.StatusCreated { t.Fatalf("create = %d: %s", create.Code, create.Body.String()) }
	var memo models.Memo
	if err := json.NewDecoder(create.Body).Decode(&memo); err != nil { t.Fatal(err) }
	search := httptest.NewRecorder()
	router.ServeHTTP(search, httptest.NewRequest(http.MethodGet, "/memos?q=DAILY", nil))
	var found []*models.Memo
	if err := json.NewDecoder(search.Body).Decode(&found); err != nil { t.Fatal(err) }
	if search.Code != http.StatusOK || len(found) != 1 { t.Fatalf("search = %d %+v", search.Code, found) }
	update := httptest.NewRecorder()
	router.ServeHTTP(update, httptest.NewRequest(http.MethodPatch, "/memos/"+memo.ID, bytes.NewBufferString(`{"content":"Edited"}`)))
	if update.Code != http.StatusOK { t.Fatalf("update = %d: %s", update.Code, update.Body.String()) }
	remove := httptest.NewRecorder()
	router.ServeHTTP(remove, httptest.NewRequest(http.MethodDelete, "/memos/"+memo.ID, nil))
	if remove.Code != http.StatusNoContent { t.Fatalf("delete = %d", remove.Code) }
	blank := httptest.NewRecorder()
	router.ServeHTTP(blank, httptest.NewRequest(http.MethodPost, "/memos", bytes.NewBufferString(`{"content":" "}`)))
	if blank.Code != http.StatusBadRequest { t.Fatalf("blank = %d", blank.Code) }
}
```

- [ ] **Step 2: Run it and verify it fails**

```bash
go test ./internal/server/routes -run MemoRoutes -count=1
```

Expected: FAIL because `MemoRoutes` is undefined.

- [ ] **Step 3: Implement handlers and global registration**

Create `internal/server/routes/memos.go` with `MemoRoutes{service *memos.Service}` and:

```go
func (mr *MemoRoutes) Register(r chi.Router) {
	r.Get("/memos", mr.list)
	r.Post("/memos", mr.create)
	r.Patch("/memos/{id}", mr.update)
	r.Delete("/memos/{id}", mr.delete)
}
```

`list` passes `r.URL.Query().Get("q")`. Create/update decode `{ Content string `json:"content"` }`. Return `200` for list/update, `201` for create, and `204` with no body for delete. Map errors exactly:

```go
func memoError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, models.ErrInvalidMemoContent):
		respondError(w, http.StatusBadRequest, err.Error())
	case errors.Is(err, models.ErrMemoNotFound):
		respondError(w, http.StatusNotFound, err.Error())
	default:
		respondError(w, http.StatusInternalServerError, err.Error())
	}
}
```

In `internal/server/routes/router.go`, import `internal/memos` and register outside `requireStore`, beside Saved Links:

```go
(&MemoRoutes{service: memos.NewService(storage.GlobalRootPath())}).Register(r)
```

- [ ] **Step 4: Format, verify, and commit**

```bash
gofmt -w internal/server/routes/memos.go internal/server/routes/memos_test.go internal/server/routes/router.go
go test ./internal/server/routes -run 'MemoRoutes|LinkRoutes' -count=1
git add internal/server/routes/memos.go internal/server/routes/memos_test.go internal/server/routes/router.go
git commit -m "feat: expose global memo API"
```

Expected: tests PASS.

---

### Task 3: Memo tab, navigation, and browser workflow

**Files:**
- Modify: `ui/src/api/client.ts:2743-2783`
- Create: `ui/src/pages/MemosPage.tsx`
- Modify: `ui/src/router.tsx:90-105,148-171`
- Modify: `ui/src/AppShell.tsx:48-53,62-81,145-168,360-370`
- Modify: `ui/src/components/organisms/AppSidebar.tsx:1-108`
- Modify: `ui/src/components/molecules/AppBreadcrumb.tsx:10-25`
- Create: `ui/e2e/memos.spec.ts`

**Interfaces:**
- Consumes: Task 2 REST endpoints, `PageShell`, `PageHeader`, `PageContent`, `PageLoading`, `Textarea`, `Button`, `Dialog`, `useDebouncedValue`, and `MDRender`.
- Produces: `Memo` TypeScript interface and `memoApi.list/add/update/delete`.
- Produces: `/memos` route, `memos` page key, and a sidebar item labeled `Memos`.

- [ ] **Step 1: Write the failing browser lifecycle test**

Create `ui/e2e/memos.spec.ts`:

```ts
import { test, expect } from "@playwright/test";
import { startServer, type TestServer } from "./helpers";

let server: TestServer;
test.beforeAll(async () => { server = await startServer(); });
test.afterAll(() => { server?.cleanup(); });

test("memos can be added, searched, edited, and deleted", async ({ page }) => {
	await page.goto(`${server.baseURL}/memos`);
	await page.getByLabel("New memo").fill("# Morning\n\nCoffee note");
	await page.getByRole("button", { name: "Add memo" }).click();
	await expect(page.getByRole("heading", { name: "Today" })).toBeVisible();
	await expect(page.getByRole("heading", { name: "Morning" })).toBeVisible();
	await page.getByLabel("Search memos").fill("coffee");
	await expect(page.getByRole("article").filter({ hasText: "Coffee note" })).toBeVisible();
	const card = page.getByRole("article").first();
	await card.getByRole("button", { name: "Edit memo" }).click();
	await card.getByLabel("Edit memo").fill("Edited **memo**");
	await card.getByRole("button", { name: "Save memo" }).click();
	await expect(card.getByText("Edited memo")).toBeVisible();
	await page.getByLabel("Search memos").fill("");
	await card.getByRole("button", { name: "Delete memo" }).click();
	await page.getByRole("button", { name: "Delete permanently" }).click();
	await expect(page.getByText("No memos yet")).toBeVisible();
});
```

- [ ] **Step 2: Build and verify the browser test fails at `/memos`**

```bash
make all
cd ui && bun exec playwright test e2e/memos.spec.ts
```

Expected: FAIL because the route and New memo field are absent.

- [ ] **Step 3: Add the typed REST client**

Append to `ui/src/api/client.ts`:

```ts
export interface Memo {
	id: string;
	content: string;
	createdAt: string;
	updatedAt: string;
}

async function memoMutation(path: string, method: "POST" | "PATCH", content: string): Promise<Memo> {
	const res = await apiFetch(`${API_BASE}${path}`, {
		method,
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ content }),
	});
	if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Failed to save memo");
	return res.json();
}

export const memoApi = {
	async list(query = ""): Promise<Memo[]> {
		const params = new URLSearchParams();
		if (query.trim()) params.set("q", query.trim());
		const res = await apiFetch(`${API_BASE}/api/memos${params.size ? `?${params}` : ""}`);
		if (!res.ok) throw new Error("Failed to fetch memos");
		return res.json();
	},
	add(content: string) { return memoMutation("/api/memos", "POST", content); },
	update(id: string, content: string) { return memoMutation(`/api/memos/${encodeURIComponent(id)}`, "PATCH", content); },
	async delete(id: string): Promise<void> {
		const res = await apiFetch(`${API_BASE}/api/memos/${encodeURIComponent(id)}`, { method: "DELETE" });
		if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Failed to delete memo");
	},
};
```

- [ ] **Step 4: Wire navigation and allow the global page without a project**

Add `memosRoute` at `/memos` to `ui/src/router.tsx`. In `AppShell.tsx`, lazy-load `MemosPage`, map `/memos` to page key `memos`, add document title `Memos`, and render it in the page switch.

Permit this one global page to render when project detection reports no active project:

```tsx
const globalPageWithoutProject = currentPage === "memos";

{projectActive === false && !globalPageWithoutProject && (
	<WelcomePage onProjectSelected={() => window.location.reload()} />
)}
{(projectActive === true || globalPageWithoutProject) && (
	<SidebarProvider open={sidebarOpen} onOpenChange={handleSidebarOpenChange}>
		{/* existing app shell */}
	</SidebarProvider>
)}
```

Add `NotebookPen` to the Lucide imports and `{ id: "memos", label: "Memos", icon: NotebookPen, to: "/memos" }` beside Saved Links in `AppSidebar.tsx`. Add `memos: "Memos"` to `AppBreadcrumb.tsx`.

- [ ] **Step 5: Implement the self-contained Memo page**

Create `ui/src/pages/MemosPage.tsx`. Use `useDebouncedValue(query, 250)` before `memoApi.list`. Keep add/edit/delete state local and replace the changed item in memory rather than reloading after every mutation.

Use these local-date helpers:

```tsx
function dayKey(date: Date) {
	return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function dayLabel(value: string) {
	const date = new Date(value);
	const today = new Date();
	const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
	if (dayKey(date) === dayKey(today)) return "Today";
	if (dayKey(date) === dayKey(yesterday)) return "Yesterday";
	return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(date);
}

function groupMemos(items: Memo[]) {
	const groups: Array<{ label: string; items: Memo[] }> = [];
	for (const memo of items) {
		const label = dayLabel(memo.createdAt);
		const current = groups.at(-1);
		if (current?.label === label) current.items.push(memo);
		else groups.push({ label, items: [memo] });
	}
	return groups;
}
```

Required markup and behavior:

- `Textarea aria-label="New memo"` plus Add memo; clear only after success.
- Search input with `aria-label="Search memos"`.
- One heading per date group and one `<article>` per memo.
- Read mode uses `<MDRender markdown={memo.content} />` and local-time metadata.
- Edit memo switches only that article to `Textarea aria-label="Edit memo"`, Save memo, and Cancel.
- Delete memo opens the existing `Dialog`; confirmation text is `Delete permanently`.
- Add/Save remain disabled for whitespace-only content.
- Initial failure uses `PageError`; mutation failures keep existing data and show `role="alert"`.
- Empty copy is `No memos yet`; filtered empty copy is `No matching memos`.

- [ ] **Step 6: Build, run the browser test, and commit**

```bash
cd ui && bun run build
cd .. && make build
cd ui && bun exec playwright test e2e/memos.spec.ts
cd ..
git add ui/src/api/client.ts ui/src/pages/MemosPage.tsx ui/src/router.tsx ui/src/AppShell.tsx ui/src/components/organisms/AppSidebar.tsx ui/src/components/molecules/AppBreadcrumb.tsx ui/e2e/memos.spec.ts
git commit -m "feat: add global memos tab"
```

Expected: TypeScript build and browser test PASS.

---

### Task 4: Web and REST integration verification

**Files:**
- Verify only; no new files expected.

**Interfaces:**
- Consumes: storage, REST, and web slices from Tasks 1-3.
- Produces: evidence that the REST-backed page, production UI, embedded binary, and browser workflow pass together.

- [ ] **Step 1: Run all Go tests**

```bash
go test ./...
```

Expected: PASS.

- [ ] **Step 2: Build the UI and embedded binary**

```bash
make all
```

Expected: `ui/dist` and `bin/knowns` build successfully.

- [ ] **Step 3: Run the focused browser workflow**

```bash
cd ui && bun exec playwright test e2e/memos.spec.ts
```

Expected: PASS.

- [ ] **Step 4: Confirm no dependencies or unrelated files entered the commits**

```bash
git status --short
git diff --stat HEAD~3..HEAD
```

Expected: only storage, REST, web, and approved design/plan files appear; `go.mod`, `go.sum`, and UI lockfiles remain unchanged.

---

### Task 5: CLI memo commands

**Files:**
- Create: `internal/cli/memo.go`
- Create: `internal/cli/memo_test.go`

**Interfaces:**
- Consumes: `memos.NewService(storage.GlobalRootPath())` and Task 1 service methods.
- Produces: `knowns memo add <content>`, `knowns memo list [--search query]`, `knowns memo update <id> <content>`, and `knowns memo delete <id>`.

- [ ] **Step 1: Write the failing CLI lifecycle test**

Create `internal/cli/memo_test.go`:

```go
package cli

import (
	"bytes"
	"encoding/json"
	"testing"

	"github.com/hoangtrung1801/known-me/internal/memos"
	"github.com/hoangtrung1801/known-me/internal/models"
)

func runMemoCommand(t *testing.T, service *memos.Service, args ...string) string {
	t.Helper()
	cmd := newMemoCmd(service)
	cmd.PersistentFlags().Bool("json", false, "JSON output")
	var output bytes.Buffer
	cmd.SetOut(&output)
	cmd.SetArgs(args)
	if err := cmd.Execute(); err != nil { t.Fatal(err) }
	return output.String()
}

func TestMemoCommandLifecycle(t *testing.T) {
	service := memos.NewService(t.TempDir())
	var created models.Memo
	if err := json.Unmarshal([]byte(runMemoCommand(t, service, "add", "# CLI memo", "--json")), &created); err != nil { t.Fatal(err) }
	var found []*models.Memo
	if err := json.Unmarshal([]byte(runMemoCommand(t, service, "list", "--search", "cli", "--json")), &found); err != nil { t.Fatal(err) }
	if len(found) != 1 || found[0].ID != created.ID { t.Fatalf("found = %+v", found) }
	var updated models.Memo
	if err := json.Unmarshal([]byte(runMemoCommand(t, service, "update", created.ID, "Edited", "--json")), &updated); err != nil { t.Fatal(err) }
	if updated.Content != "Edited" { t.Fatalf("updated = %+v", updated) }
	runMemoCommand(t, service, "delete", created.ID)
	if items, _ := service.List(""); len(items) != 0 { t.Fatalf("remaining = %+v", items) }
}
```

- [ ] **Step 2: Run it and verify it fails**

```bash
go test ./internal/cli -run MemoCommand -count=1
```

Expected: FAIL because `newMemoCmd` is undefined.

- [ ] **Step 3: Implement the Cobra command**

Create `internal/cli/memo.go` with `newMemoCmd(service *memos.Service)`. When service is nil, use `memos.NewService(storage.GlobalRootPath())`. Use `cobra.ExactArgs(1)` for add, `cobra.NoArgs` for list, `cobra.ExactArgs(2)` for update, and `cobra.ExactArgs(1)` for delete. Add `--search` to list. Use full JSON objects under `--json`; plain output is compact:

```go
func writeMemoOutput(cmd *cobra.Command, memo *models.Memo) error {
	if isJSON(cmd) { return json.NewEncoder(cmd.OutOrStdout()).Encode(memo) }
	fmt.Fprintf(cmd.OutOrStdout(), "%s\t%s\n", memo.ID, strings.ReplaceAll(memo.Content, "\n", " "))
	return nil
}
```

List JSON-encodes the slice; plain list calls `writeMemoOutput` for each item. Delete prints `deleted <id>` in plain mode and `{ "id": id, "deleted": true }` in JSON mode. Register globally:

```go
func init() { rootCmd.AddCommand(newMemoCmd(nil)) }
```

- [ ] **Step 4: Format, verify, and commit**

```bash
gofmt -w internal/cli/memo.go internal/cli/memo_test.go
go test ./internal/cli -run MemoCommand -count=1
git add internal/cli/memo.go internal/cli/memo_test.go
git commit -m "feat: add memo CLI"
```

Expected: tests PASS.

---

### Task 6: MCP memo tool and permission classification

**Files:**
- Create: `internal/mcp/handlers/memo.go`
- Create: `internal/mcp/handlers/memo_test.go`
- Modify: `internal/mcp/server.go:477`
- Modify: `internal/permissions/registry.go:21-32,95-98,124-134`
- Modify: `internal/permissions/registry_test.go`

**Interfaces:**
- Consumes: Task 1's service and existing `toolRegistrar`, `jsonResult`, `errResult`, and `stringArg` helpers.
- Produces: MCP tool `memo` with `add`, `list`, `update`, and `delete`; list accepts `query`.
- Produces: permission target `TargetMemo = "memo"`; delete is high-risk.

- [ ] **Step 1: Write failing handler and permission tests**

Create `internal/mcp/handlers/memo_test.go`:

```go
package handlers

import (
	"encoding/json"
	"testing"

	"github.com/hoangtrung1801/known-me/internal/memos"
	"github.com/hoangtrung1801/known-me/internal/models"
	"github.com/mark3labs/mcp-go/mcp"
)

func TestMemoHandlersLifecycle(t *testing.T) {
	service := memos.NewService(t.TempDir())
	added, err := handleMemoAdd(service, mcp.CallToolRequest{Params: mcp.CallToolParams{Arguments: map[string]any{"content": "# MCP memo"}}})
	if err != nil { t.Fatal(err) }
	var memo models.Memo
	if err := json.Unmarshal([]byte(added.Content[0].(mcp.TextContent).Text), &memo); err != nil { t.Fatal(err) }
	listed, err := handleMemoList(service, mcp.CallToolRequest{Params: mcp.CallToolParams{Arguments: map[string]any{"query": "mcp"}}})
	if err != nil { t.Fatal(err) }
	var found []*models.Memo
	if err := json.Unmarshal([]byte(listed.Content[0].(mcp.TextContent).Text), &found); err != nil { t.Fatal(err) }
	if len(found) != 1 || found[0].ID != memo.ID { t.Fatalf("found = %+v", found) }
	if _, err := handleMemoDelete(service, mcp.CallToolRequest{Params: mcp.CallToolParams{Arguments: map[string]any{"id": memo.ID}}}); err != nil { t.Fatal(err) }
}
```

Add `TestMemoActionsAreClassified` to `internal/permissions/registry_test.go`, expecting add/update as `CapWrite/RiskMedium`, list as `CapRead/RiskLow`, and delete as `CapDelete/RiskHigh`, all targeting `TargetMemo`.

- [ ] **Step 2: Run focused tests and verify they fail**

```bash
go test ./internal/mcp/handlers ./internal/permissions -run Memo -count=1
```

Expected: FAIL because the handlers and `TargetMemo` do not exist.

- [ ] **Step 3: Implement and register the MCP tool**

Create `internal/mcp/handlers/memo.go` with a `memo` tool whose required `action` enum is `add,list,update,delete`; optional schema fields are `id`, `content`, and `query`. Dispatch to `handleMemoAdd`, `handleMemoList`, `handleMemoUpdate`, and `handleMemoDelete`. Require `content` for add, `id` plus `content` for update, and `id` for delete. Return `jsonResult` for add/list/update and `mcp.NewToolResultText("deleted")` for delete.

Register four exact help entries: `memo.add`, `memo.list`, `memo.update`, and `memo.delete`. In `internal/mcp/server.go`, register:

```go
handlers.RegisterMemoTool(s, memos.NewService(storage.GlobalRootPath()))
```

In `internal/permissions/registry.go`, add:

```go
TargetMemo = "memo"

"memo.add":    {Capability: CapWrite, Target: TargetMemo, Risk: RiskMedium},
"memo.list":   {Capability: CapRead, Target: TargetMemo, Risk: RiskLow},
"memo.update": {Capability: CapWrite, Target: TargetMemo, Risk: RiskMedium},
"memo.delete": {Capability: CapDelete, Target: TargetMemo, Risk: RiskHigh},
```

Add `"memo": {Capability: CapRead, Target: TargetMemo, Risk: RiskLow}` to `toolFallback`.

- [ ] **Step 4: Format, verify, and commit**

```bash
gofmt -w internal/mcp/handlers/memo.go internal/mcp/handlers/memo_test.go internal/mcp/server.go internal/permissions/registry.go internal/permissions/registry_test.go
go test ./internal/mcp/... ./internal/permissions -run 'Memo|Help' -count=1
git add internal/mcp/handlers/memo.go internal/mcp/handlers/memo_test.go internal/mcp/server.go internal/permissions/registry.go internal/permissions/registry_test.go
git commit -m "feat: add memo MCP tool"
```

Expected: tests PASS.

---

### Task 7: Final cross-interface verification

**Files:**
- Verify only; no new files expected.

**Interfaces:**
- Consumes: all implementation slices from Tasks 1-6.
- Produces: final evidence that storage, REST, CLI, MCP, UI, permissions, and the embedded application work together.

- [ ] **Step 1: Run the complete Go suite**

```bash
go test ./...
```

Expected: PASS.

- [ ] **Step 2: Build the production UI and embedded binary**

```bash
make all
```

Expected: PASS with no dependency or lockfile changes.

- [ ] **Step 3: Run the memo browser workflow against the final binary**

```bash
cd ui && bun exec playwright test e2e/memos.spec.ts
```

Expected: PASS.

- [ ] **Step 4: Inspect final scope**

```bash
git status --short
git diff --stat HEAD~5..HEAD
```

Expected: only memo implementation files plus the approved design/plan docs appear. Preserve the user's pre-existing `.knowns/config.json`, `.agents.example/`, `.knowns/docs/architecture/auth-architecture.md`, and `KNOWNS.md` changes without staging or editing them.
