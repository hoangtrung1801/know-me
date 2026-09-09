package server

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/hoangtrung1801/know-me/internal/registry"
	"github.com/hoangtrung1801/know-me/internal/storage"
)

// newPickerServer creates a Server in picker mode (nil store).
func newPickerServer(t *testing.T) *Server {
	t.Helper()
	s := &Server{
		store:      nil,
		sse:        NewSSEBroker(),
		shutdownCh: make(chan struct{}, 1),
	}
	reg := registry.NewRegistry()
	s.manager = storage.NewManager(nil, reg)
	s.router = s.buildRouter()
	return s
}

func TestNewServerAllowsPickerMode(t *testing.T) {
	s := NewServer(nil, "", 0, Options{})
	if s == nil || s.manager == nil || s.manager.GetStore() != nil {
		t.Fatalf("picker server = %#v", s)
	}
}

func TestNewServerCanDisableLSPAndOpenCode(t *testing.T) {
	t.Setenv("HOME", t.TempDir())
	store := storage.NewStore(storage.GlobalRootPath())
	if err := store.Init(""); err != nil {
		t.Fatal(err)
	}
	s := NewServer(store, "", 0, Options{DisableLSP: true, DisableOpenCode: true})
	if s.lspManager != nil || s.runtimeOpenCode != nil {
		t.Fatalf("lsp = %#v, opencode = %#v", s.lspManager, s.runtimeOpenCode)
	}
	if _, configured := s.openCodeConfig(); configured {
		t.Fatal("OpenCode must remain disabled")
	}
}

// newActiveServer creates a Server with a real project store.
func newActiveServer(t *testing.T) (*Server, string) {
	t.Helper()
	tmpDir := t.TempDir()
	projDir := filepath.Join(tmpDir, "my-project")
	os.MkdirAll(filepath.Join(projDir, ".know-me"), 0755)
	os.WriteFile(filepath.Join(projDir, ".know-me", "config.json"), []byte(`{"name":"my-project"}`), 0644)

	store := storage.NewStore(filepath.Join(projDir, ".know-me"))
	reg := registry.NewRegistry()
	s := &Server{
		store:       store,
		projectRoot: projDir,
		sse:         NewSSEBroker(),
		shutdownCh:  make(chan struct{}, 1),
	}
	s.manager = storage.NewManager(store, reg)
	s.router = s.buildRouter()
	return s, projDir
}

func TestStatusEndpoint_NoProject(t *testing.T) {
	t.Parallel()
	s := newPickerServer(t)

	req := httptest.NewRequest(http.MethodGet, "/api/status", nil)
	rr := httptest.NewRecorder()
	s.router.ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("GET /api/status status = %d, want 200", rr.Code)
	}

	var resp map[string]interface{}
	if err := json.Unmarshal(rr.Body.Bytes(), &resp); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if resp["active"] != false {
		t.Fatalf("active = %v, want false", resp["active"])
	}
}

func TestStatusEndpoint_ActiveProject(t *testing.T) {
	t.Parallel()
	s, projDir := newActiveServer(t)

	req := httptest.NewRequest(http.MethodGet, "/api/status", nil)
	rr := httptest.NewRecorder()
	s.router.ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("GET /api/status status = %d, want 200", rr.Code)
	}

	var resp map[string]interface{}
	if err := json.Unmarshal(rr.Body.Bytes(), &resp); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if resp["active"] != true {
		t.Fatalf("active = %v, want true", resp["active"])
	}
	if resp["projectName"] != "my-project" {
		t.Fatalf("projectName = %v, want my-project", resp["projectName"])
	}
	if resp["projectPath"] != projDir {
		t.Fatalf("projectPath = %v, want %s", resp["projectPath"], projDir)
	}
}

func TestStatusEndpoint_GlobalStoreDoesNotStartLSPDaemon(t *testing.T) {
	t.Setenv("HOME", t.TempDir())
	store := storage.NewStore(storage.GlobalRootPath())
	if err := store.Init(""); err != nil {
		t.Fatal(err)
	}
	s := &Server{store: store, sse: NewSSEBroker(), shutdownCh: make(chan struct{}, 1)}
	s.manager = storage.NewManager(store, registry.NewRegistry())
	s.router = s.buildRouter()

	rr := httptest.NewRecorder()
	s.router.ServeHTTP(rr, httptest.NewRequest(http.MethodGet, "/api/status", nil))
	if rr.Code != http.StatusOK {
		t.Fatalf("GET /api/status status = %d", rr.Code)
	}
	var resp map[string]interface{}
	if err := json.Unmarshal(rr.Body.Bytes(), &resp); err != nil || resp["active"] != true || resp["projectPath"] != "" {
		t.Fatalf("status = %s, err = %v", rr.Body, err)
	}
}

func TestProjectScopedRoutes_Return503_WhenNoStore(t *testing.T) {
	t.Parallel()
	s := newPickerServer(t)

	routes := []struct {
		method string
		path   string
	}{
		{"GET", "/api/tasks"},
		{"GET", "/api/docs"},
		{"GET", "/api/config"},
		{"GET", "/api/search?q=test"},
		{"GET", "/api/graph"},
		{"GET", "/api/memories"},
		{"GET", "/api/validate/sdd"},
		{"GET", "/api/time/status"},
	}

	for _, rt := range routes {
		req := httptest.NewRequest(rt.method, rt.path, nil)
		rr := httptest.NewRecorder()
		s.router.ServeHTTP(rr, req)

		if rr.Code != http.StatusServiceUnavailable {
			t.Errorf("%s %s: status = %d, want 503", rt.method, rt.path, rr.Code)
		}
		if !strings.Contains(rr.Body.String(), "no active project") {
			t.Errorf("%s %s: body missing 'no active project': %s", rt.method, rt.path, rr.Body.String())
		}
	}
}

func TestWorkspaceRoutes_AvailableInPickerMode(t *testing.T) {
	t.Parallel()
	s := newPickerServer(t)

	req := httptest.NewRequest(http.MethodGet, "/api/workspaces", nil)
	rr := httptest.NewRecorder()
	s.router.ServeHTTP(rr, req)

	// Should return 200 (empty list), not 503
	if rr.Code != http.StatusOK {
		t.Fatalf("GET /api/workspaces in picker mode: status = %d, want 200", rr.Code)
	}
}

func TestWorkspaceSwitchSelectsLogicalProject(t *testing.T) {
	t.Parallel()
	reg := registry.NewRegistry()
	if err := reg.Load(); err != nil {
		t.Fatal(err)
	}
	p, err := reg.Create("Project A")
	if err != nil {
		t.Fatal(err)
	}

	s := &Server{
		store:      nil,
		sse:        NewSSEBroker(),
		shutdownCh: make(chan struct{}, 1),
	}
	s.manager = storage.NewManager(nil, reg)
	s.router = s.buildRouter()

	body := strings.NewReader(`{"id":"` + p.ID + `"}`)
	req := httptest.NewRequest(http.MethodPost, "/api/workspaces/switch", body)
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()
	s.router.ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("POST /api/workspaces/switch status = %d, want 200: %s", rr.Code, rr.Body.String())
	}

	if active := reg.GetActive(); active == nil || active.ID != p.ID {
		t.Fatalf("active = %#v", active)
	}
}
