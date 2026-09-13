package routes

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/hoangtrung1801/know-me/internal/storage"
)

func TestRemovedEndpointsReturn404(t *testing.T) {
	tempDir := t.TempDir()
	store := storage.NewStore(tempDir)
	router := chi.NewRouter()
	router.Route("/api", func(r chi.Router) {
		SetupRoutesWithCapabilities(r, store, nil, tempDir, nil, TaskRouteCapabilities{})
	})

	removedEndpoints := []struct {
		method string
		path   string
	}{
		{"GET", "/api/decisions"},
		{"POST", "/api/decisions"},
		{"GET", "/api/decisions/123"},
		{"GET", "/api/memories"},
		{"POST", "/api/memories"},
		{"GET", "/api/imports"},
		{"POST", "/api/imports"},
		{"GET", "/api/graph"},
		{"GET", "/api/lsp/languages"},
		{"GET", "/api/embedding-models"},
	}

	for _, ep := range removedEndpoints {
		req := httptest.NewRequest(ep.method, ep.path, nil)
		rr := httptest.NewRecorder()
		router.ServeHTTP(rr, req)

		if rr.Code != http.StatusNotFound {
			t.Errorf("%s %s: got status %d, want 404", ep.method, ep.path, rr.Code)
		}
	}
}
