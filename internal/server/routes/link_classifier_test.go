package routes

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/hoangtrung1801/known-me/internal/storage"
)

func TestLinkClassifierSettingsGetNeverReturnsAPIKey(t *testing.T) {
	settings := storage.NewLinkClassifierSettingsStoreWithPath(filepath.Join(t.TempDir(), "classifier.json"))
	if err := settings.Save(storage.LinkClassifierConfig{APIBase: "https://api.example/v1", APIKey: "secret", Model: "tagger"}); err != nil {
		t.Fatal(err)
	}
	router := chi.NewRouter()
	(&LinkClassifierRoutes{store: settings}).Register(router)
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, "/link-classifier", nil))
	if strings.Contains(recorder.Body.String(), "secret") || strings.Contains(recorder.Body.String(), "apiKey") {
		t.Fatalf("unsafe response: %s", recorder.Body.String())
	}
	var response linkClassifierResponse
	if err := json.NewDecoder(recorder.Body).Decode(&response); err != nil {
		t.Fatal(err)
	}
	if !response.Configured || response.APIBase == "" || response.Model == "" {
		t.Fatalf("response = %#v", response)
	}
}
