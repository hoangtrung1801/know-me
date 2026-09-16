package routes

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/hoangtrung1801/know-me/internal/registry"
	"github.com/hoangtrung1801/know-me/internal/storage"
)

type fakeBroadcaster struct{ events []SSEEvent }

func (b *fakeBroadcaster) Broadcast(e SSEEvent) { b.events = append(b.events, e) }

func setupWorkspaceTest(t *testing.T) (*chi.Mux, *storage.Manager) {
	t.Helper()
	t.Setenv("HOME", t.TempDir())
	r := registry.NewRegistryWithPath(filepath.Join(t.TempDir(), "registry.json"))
	if err := r.Load(); err != nil {
		t.Fatal(err)
	}
	if _, err := r.Create("Existing"); err != nil {
		t.Fatal(err)
	}
	m := storage.NewManager(nil, r)
	router := chi.NewRouter()
	(&WorkspaceRoutes{manager: m}).Register(router)
	return router, m
}

func TestWorkspaceList(t *testing.T) {
	r, _ := setupWorkspaceTest(t)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/workspaces", nil))
	if w.Code != http.StatusOK {
		t.Fatalf("status = %d", w.Code)
	}
	var projects []registry.Project
	if err := json.Unmarshal(w.Body.Bytes(), &projects); err != nil || len(projects) != 1 {
		t.Fatalf("projects = %s", w.Body.String())
	}
}

func TestWorkspaceCreateLogicalProject(t *testing.T) {
	r, m := setupWorkspaceTest(t)
	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/workspaces", bytes.NewBufferString(`{"name":"Launch"}`))
	r.ServeHTTP(w, req)
	if w.Code != http.StatusCreated || len(m.GetRegistry().Projects) != 2 {
		t.Fatalf("status = %d, body = %s", w.Code, w.Body.String())
	}
}

func TestWorkspaceCreateInitializesProjectConfig(t *testing.T) {
	r, m := setupWorkspaceTest(t)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest(http.MethodPost, "/workspaces", bytes.NewBufferString(`{"name":"Launch"}`)))
	if w.Code != http.StatusCreated {
		t.Fatalf("status = %d, body = %s", w.Code, w.Body.String())
	}

	var project registry.Project
	if err := json.Unmarshal(w.Body.Bytes(), &project); err != nil {
		t.Fatalf("decode project: %v", err)
	}
	store, err := m.ProjectStore(project.ID)
	if err != nil {
		t.Fatalf("project store: %v", err)
	}
	if _, err := store.Config.Load(); err != nil {
		t.Fatalf("load project config: %v", err)
	}
}

func TestWorkspaceCreateRejectsBlankName(t *testing.T) {
	r, _ := setupWorkspaceTest(t)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest(http.MethodPost, "/workspaces", bytes.NewBufferString(`{"name":" "}`)))
	if w.Code != http.StatusBadRequest {
		t.Fatalf("status = %d", w.Code)
	}
}

func TestWorkspaceRemove(t *testing.T) {
	r, m := setupWorkspaceTest(t)
	p := m.GetRegistry().Projects[0]
	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest(http.MethodDelete, "/workspaces/"+p.ID, nil))
	if w.Code != http.StatusNoContent || len(m.GetRegistry().Projects) != 0 {
		t.Fatalf("status = %d", w.Code)
	}
}

func TestWorkspaceCreateWithPathAndGetUpdate(t *testing.T) {
	r, m := setupWorkspaceTest(t)
	wsDir := t.TempDir()

	// Create with path
	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/workspaces", bytes.NewBufferString(`{"name":"My Code","path":"`+wsDir+`"}`))
	r.ServeHTTP(w, req)
	if w.Code != http.StatusCreated {
		t.Fatalf("status = %d, body = %s", w.Code, w.Body.String())
	}

	var created registry.Project
	if err := json.Unmarshal(w.Body.Bytes(), &created); err != nil {
		t.Fatal(err)
	}
	if created.Path == "" {
		t.Fatalf("expected created.Path to be set, got empty")
	}

	// GET /workspaces/{id}
	w = httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/workspaces/"+created.ID, nil))
	if w.Code != http.StatusOK {
		t.Fatalf("get status = %d", w.Code)
	}

	// PATCH /workspaces/{id}
	newWsDir := t.TempDir()
	w = httptest.NewRecorder()
	patchReq := httptest.NewRequest(http.MethodPatch, "/workspaces/"+created.ID, bytes.NewBufferString(`{"name":"Updated Name","path":"`+newWsDir+`"}`))
	r.ServeHTTP(w, patchReq)
	if w.Code != http.StatusOK {
		t.Fatalf("patch status = %d body = %s", w.Code, w.Body.String())
	}
	var updated registry.Project
	if err := json.Unmarshal(w.Body.Bytes(), &updated); err != nil {
		t.Fatal(err)
	}
	if updated.Name != "Updated Name" {
		t.Fatalf("updated.Name = %q, want 'Updated Name'", updated.Name)
	}
	_ = m
}
