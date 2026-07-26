package routes

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/howznguyen/knowns/internal/registry"
	"github.com/howznguyen/knowns/internal/storage"
)

// fakeBroadcaster records broadcast calls for assertions.
type fakeBroadcaster struct {
	events []SSEEvent
}

func (fb *fakeBroadcaster) Broadcast(e SSEEvent) {
	fb.events = append(fb.events, e)
}

// setupWorkspaceTest creates a test environment with registry, manager, and router.
func setupWorkspaceTest(t *testing.T) (*chi.Mux, *fakeBroadcaster, *storage.Manager, string) {
	t.Helper()
	tmpDir := t.TempDir()

	// Create a fake project with .knowns/config.json
	projDir := filepath.Join(tmpDir, "test-project")
	os.MkdirAll(filepath.Join(projDir, ".knowns"), 0755)
	os.WriteFile(filepath.Join(projDir, ".knowns", "config.json"), []byte(`{"name":"test-project"}`), 0644)

	regFile := filepath.Join(tmpDir, "registry.json")
	reg := registry.NewRegistryWithPath(regFile)
	reg.Load()
	reg.Add(projDir)

	store := storage.NewStore(filepath.Join(projDir, ".knowns"))
	mgr := storage.NewManager(store, reg)
	sse := &fakeBroadcaster{}

	r := chi.NewRouter()
	wr := &WorkspaceRoutes{manager: mgr, sse: sse}
	wr.Register(r)

	return r, sse, mgr, tmpDir
}

func TestWorkspaceList(t *testing.T) {
	r, _, _, _ := setupWorkspaceTest(t)

	req := httptest.NewRequest("GET", "/workspaces", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("GET /workspaces status = %d, want 200", w.Code)
	}

	var projects []registry.Project
	if err := json.Unmarshal(w.Body.Bytes(), &projects); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if len(projects) != 1 {
		t.Fatalf("expected 1 project, got %d", len(projects))
	}
	if projects[0].Name != "test-project" {
		t.Fatalf("project name = %q, want %q", projects[0].Name, "test-project")
	}
}

func TestWorkspaceSwitch(t *testing.T) {
	r, sse, mgr, tmpDir := setupWorkspaceTest(t)

	// Create a second project
	proj2 := filepath.Join(tmpDir, "proj2")
	os.MkdirAll(filepath.Join(proj2, ".knowns"), 0755)
	os.WriteFile(filepath.Join(proj2, ".knowns", "config.json"), []byte(`{"name":"proj2"}`), 0644)
	reg := mgr.GetRegistry()
	p2, _ := reg.Add(proj2)

	body, _ := json.Marshal(map[string]string{"id": p2.ID})
	req := httptest.NewRequest("POST", "/workspaces/switch", bytes.NewReader(body))
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("POST /workspaces/switch status = %d, want 200", w.Code)
	}

	// Verify store was switched
	if mgr.GetStore().Root != filepath.Join(proj2, ".knowns") {
		t.Fatalf("store root = %q, want %q", mgr.GetStore().Root, filepath.Join(proj2, ".knowns"))
	}

	// Verify SSE refresh event was broadcast
	if len(sse.events) != 1 {
		t.Fatalf("expected 1 SSE event, got %d", len(sse.events))
	}
	if sse.events[0].Type != "refresh" {
		t.Fatalf("SSE event type = %q, want %q", sse.events[0].Type, "refresh")
	}
}

func TestWorkspaceScan(t *testing.T) {
	r, _, _, tmpDir := setupWorkspaceTest(t)

	// Create a scan directory with 2 projects
	scanDir := filepath.Join(tmpDir, "scan-parent")
	os.MkdirAll(filepath.Join(scanDir, "repo-a", ".knowns"), 0755)
	os.WriteFile(filepath.Join(scanDir, "repo-a", ".knowns", "config.json"), []byte(`{"name":"repo-a"}`), 0644)
	os.MkdirAll(filepath.Join(scanDir, "repo-b", ".knowns"), 0755)
	os.WriteFile(filepath.Join(scanDir, "repo-b", ".knowns", "config.json"), []byte(`{"name":"repo-b"}`), 0644)

	body, _ := json.Marshal(map[string][]string{"dirs": {scanDir}})
	req := httptest.NewRequest("POST", "/workspaces/scan", bytes.NewReader(body))
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("POST /workspaces/scan status = %d, want 200", w.Code)
	}

	var added []registry.Project
	if err := json.Unmarshal(w.Body.Bytes(), &added); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if len(added) != 2 {
		t.Fatalf("expected 2 discovered projects, got %d", len(added))
	}
}

func TestWorkspaceDelete(t *testing.T) {
	r, _, mgr, _ := setupWorkspaceTest(t)

	reg := mgr.GetRegistry()
	if len(reg.Projects) == 0 {
		t.Fatal("expected at least 1 project in registry")
	}
	id := reg.Projects[0].ID

	req := httptest.NewRequest("DELETE", "/workspaces/"+id, nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusNoContent {
		t.Fatalf("DELETE /workspaces/%s status = %d, want 204", id, w.Code)
	}

	// Verify removed
	if len(reg.Projects) != 0 {
		t.Fatalf("expected 0 projects after delete, got %d", len(reg.Projects))
	}
}
