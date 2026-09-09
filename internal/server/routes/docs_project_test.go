package routes

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/hoangtrung1801/know-me/internal/models"
	"github.com/hoangtrung1801/know-me/internal/storage"
)

func TestDocRoutesUpdateMovesDocumentBetweenProjectAndGlobal(t *testing.T) {
	store := storage.NewStore(filepath.Join(t.TempDir(), ".know-me"))
	if err := store.Init("doc-project-test"); err != nil {
		t.Fatalf("init store: %v", err)
	}
	if err := store.Docs.CreateGlobal(&models.Doc{Path: "guide", Title: "Guide", Tags: []string{}}); err != nil {
		t.Fatalf("create global doc: %v", err)
	}

	router := chi.NewRouter()
	(&DocRoutes{store: store, sse: &fakeBroadcaster{}}).Register(router)

	updateDocProject(t, router, "guide", "alpha")
	if doc, err := store.Docs.Get("alpha:guide"); err != nil || doc.ProjectID != "alpha" {
		t.Fatalf("project doc = %#v, err = %v; want project alpha", doc, err)
	}

	updateDocProject(t, router, "alpha:guide", "")
	if doc, err := store.Docs.Get("guide"); err != nil || doc.ProjectID != "" {
		t.Fatalf("global doc = %#v, err = %v; want global project", doc, err)
	}
}

func updateDocProject(t *testing.T, router http.Handler, path, projectID string) {
	t.Helper()
	body, err := json.Marshal(map[string]string{"projectId": projectID})
	if err != nil {
		t.Fatalf("encode request: %v", err)
	}
	req := httptest.NewRequest(http.MethodPut, "/docs/"+path, bytes.NewReader(body))
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("PUT /docs/%s status = %d, want %d: %s", path, w.Code, http.StatusOK, w.Body.String())
	}
}
