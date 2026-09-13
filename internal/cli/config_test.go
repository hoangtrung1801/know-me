package cli

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/hoangtrung1801/know-me/internal/models"
	"github.com/hoangtrung1801/know-me/internal/search"
	"github.com/hoangtrung1801/know-me/internal/storage"
)

func TestLocalONNXModelChoicesShowDownloadStatus(t *testing.T) {
	home := t.TempDir()
	oldHome := os.Getenv("HOME")
	if err := os.Setenv("HOME", home); err != nil {
		t.Fatalf("set HOME: %v", err)
	}
	t.Cleanup(func() { _ = os.Setenv("HOME", oldHome) })

	model := findSupportedModel("gte-small")
	if model == nil {
		t.Fatal("missing gte-small model")
	}
	installedPath := filepath.Join(home, ".know-me", "models", model.HuggingFace, "onnx", "model_quantized.onnx")
	if err := os.MkdirAll(filepath.Dir(installedPath), 0755); err != nil {
		t.Fatalf("mkdir model dir: %v", err)
	}
	if err := os.WriteFile(installedPath, []byte("onnx"), 0644); err != nil {
		t.Fatalf("write model file: %v", err)
	}

	choices := localONNXModelChoices("gte-small")
	var installedLabel, missingLabel string
	for _, choice := range choices {
		switch choice.Model.ID {
		case "gte-small":
			installedLabel = choice.Label
		case "gte-base":
			missingLabel = choice.Label
		}
	}
	if !strings.Contains(installedLabel, "downloaded") || !strings.Contains(installedLabel, "current") {
		t.Fatalf("expected installed current label, got %q", installedLabel)
	}
	if !strings.Contains(missingLabel, "not downloaded") {
		t.Fatalf("expected missing label, got %q", missingLabel)
	}
}

func TestSaveLocalONNXSemanticSettingsPersistsFullConfig(t *testing.T) {
	store, project := newConfigTestProject(t)
	model := findSupportedModel("gte-small")
	if model == nil {
		t.Fatal("missing gte-small model")
	}

	if err := saveLocalONNXSemanticSettings(store, project, model); err != nil {
		t.Fatalf("save local ONNX settings: %v", err)
	}

	saved, err := store.Config.Load()
	if err != nil {
		t.Fatalf("load saved config: %v", err)
	}
	ss := saved.Settings.SemanticSearch
	if ss == nil {
		t.Fatal("expected semantic search settings")
	}
	if !ss.Enabled || ss.Provider != "local" || ss.Model != model.ID {
		t.Fatalf("unexpected semantic config: %#v", ss)
	}
	if ss.HuggingFaceID != model.HuggingFace || ss.Dimensions != model.Dimensions || ss.MaxTokens != model.MaxTokens {
		t.Fatalf("expected full model metadata, got %#v", ss)
	}
}

func TestApplyLocalONNXSelectionDeclineLeavesConfigUnchanged(t *testing.T) {
	home := t.TempDir()
	oldHome := os.Getenv("HOME")
	if err := os.Setenv("HOME", home); err != nil {
		t.Fatalf("set HOME: %v", err)
	}
	t.Cleanup(func() { _ = os.Setenv("HOME", oldHome) })

	store, project := newConfigTestProject(t)
	project.Settings.SemanticSearch = &models.SemanticSearchSettings{
		Enabled:       true,
		Provider:      "local",
		Model:         "gte-small",
		HuggingFaceID: "Xenova/gte-small",
		Dimensions:    384,
		MaxTokens:     512,
	}
	if err := store.Config.Save(project); err != nil {
		t.Fatalf("seed config: %v", err)
	}

	saved, err := applyLocalONNXSelection(store, project, "gte-base", func(*embeddingModel) (bool, error) {
		return false, nil
	})
	if err != nil {
		t.Fatalf("apply selection: %v", err)
	}
	if saved {
		t.Fatal("expected declined selection to skip save")
	}

	loaded, err := store.Config.Load()
	if err != nil {
		t.Fatalf("load config: %v", err)
	}
	if got := loaded.Settings.SemanticSearch.Model; got != "gte-small" {
		t.Fatalf("expected previous model to remain, got %q", got)
	}
}

func TestApplyLocalONNXSelectionDownloadsMissingModelBeforeSave(t *testing.T) {
	home := t.TempDir()
	oldHome := os.Getenv("HOME")
	if err := os.Setenv("HOME", home); err != nil {
		t.Fatalf("set HOME: %v", err)
	}
	t.Cleanup(func() { _ = os.Setenv("HOME", oldHome) })

	store, project := newConfigTestProject(t)
	oldSetup := runSemanticSetupForSettings
	var downloaded string
	runSemanticSetupForSettings = func(modelID string, force ...bool) error {
		downloaded = modelID
		return nil
	}
	t.Cleanup(func() { runSemanticSetupForSettings = oldSetup })

	saved, err := applyLocalONNXSelection(store, project, "gte-base", func(*embeddingModel) (bool, error) {
		return true, nil
	})
	if err != nil {
		t.Fatalf("apply selection: %v", err)
	}
	if !saved {
		t.Fatal("expected approved selection to save")
	}
	if downloaded != "gte-base" {
		t.Fatalf("expected download for gte-base, got %q", downloaded)
	}

	loaded, err := store.Config.Load()
	if err != nil {
		t.Fatalf("load config: %v", err)
	}
	if got := loaded.Settings.SemanticSearch.Model; got != "gte-base" {
		t.Fatalf("expected selected model, got %q", got)
	}
	if loaded.Settings.SemanticSearch.Dimensions != 768 {
		t.Fatalf("expected gte-base dimensions, got %d", loaded.Settings.SemanticSearch.Dimensions)
	}
}

func TestValidateConfigSetLocalONNXOnMacOSIntel(t *testing.T) {
	unsupported := search.LocalONNXCapabilityForPlatform("darwin", "amd64", "")
	project := &models.Project{}

	if err := validateConfigSetLocalONNX(project, "settings.semanticSearch.enabled", true, unsupported); err == nil || !strings.Contains(err.Error(), "Ollama") {
		t.Fatalf("enabling default local provider error = %v, want actionable guidance", err)
	}

	project.Settings.SemanticSearch = &models.SemanticSearchSettings{
		Enabled:  true,
		Provider: "ollama",
	}
	if err := validateConfigSetLocalONNX(project, "settings.semanticSearch.provider", "local", unsupported); err == nil {
		t.Fatal("switching an enabled project to local ONNX should fail")
	}
	if err := validateConfigSetLocalONNX(project, "settings.semanticSearch.provider", "api", unsupported); err != nil {
		t.Fatalf("API provider should remain writable: %v", err)
	}

	project.Settings.SemanticSearch.Enabled = false
	if err := validateConfigSetLocalONNX(project, "settings.semanticSearch.provider", "local", unsupported); err != nil {
		t.Fatalf("disabled legacy local configuration should remain writable: %v", err)
	}
}

func TestProviderSettingsForAPIAndOllamaRemainMinimal(t *testing.T) {
	for _, provider := range []string{"api", "ollama"} {
		ss := &models.SemanticSearchSettings{Enabled: true, Provider: provider, Model: "embed-model"}
		if ss.HuggingFaceID != "" || ss.Dimensions != 0 || ss.MaxTokens != 0 {
			t.Fatalf("expected %s provider config to remain provider/model only, got %#v", provider, ss)
		}
	}
}

func TestResolveServerURLPrecedence(t *testing.T) {
	tempHome := t.TempDir()
	t.Setenv("HOME", tempHome)
	t.Setenv("KNOWME_SERVER_URL", "")
	t.Chdir(t.TempDir())

	store, project := newConfigTestProject(t)

	// Case 1: All empty -> local mode ("")
	url, err := ResolveServerURL(nil, store)
	if err != nil || url != "" {
		t.Fatalf("expected empty url, got %q, err: %v", url, err)
	}
	project.Settings.ServerURL = "http://remote-config:8080"
	if err := store.Config.Save(project); err != nil {
		t.Fatalf("save config: %v", err)
	}
	url, err = ResolveServerURL(nil, store)
	if err != nil || url != "http://remote-config:8080" {
		t.Fatalf("expected config url, got %q, err: %v", url, err)
	}

	// Case 3: KNOWME_SERVER_URL env var overrides config
	t.Setenv("KNOWME_SERVER_URL", "https://env-server.example.com/")
	url, err = ResolveServerURL(nil, store)
	if err != nil || url != "https://env-server.example.com" {
		t.Fatalf("expected env url (trimmed), got %q, err: %v", url, err)
	}

	// Case 4: CLI flag overrides env var and config
	cmd := rootCmd
	if err := cmd.PersistentFlags().Set("server-url", "http://flag-server:9000/"); err != nil {
		t.Fatalf("set flag: %v", err)
	}
	defer cmd.PersistentFlags().Set("server-url", "")

	url, err = ResolveServerURL(cmd, store)
	if err != nil || url != "http://flag-server:9000" {
		t.Fatalf("expected flag url, got %q, err: %v", url, err)
	}

	// Case 5: Invalid URL fails validation
	if err := cmd.PersistentFlags().Set("server-url", "ftp://invalid-proto"); err != nil {
		t.Fatalf("set flag: %v", err)
	}
	_, err = ResolveServerURL(cmd, store)
	if err == nil {
		t.Fatal("expected validation error for ftp://, got nil")
	}
}

func TestRemoteStatusRoutingAgainstStubServer(t *testing.T) {
	receivedAuth := ""
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/status" {
			http.NotFound(w, r)
			return
		}
		receivedAuth = r.Header.Get("Authorization")
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{
			"active": true,
			"projectName": "remote-stub-proj",
			"projectPath": "/remote/path",
			"version": "1.7.0"
		}`))
	}))
	defer ts.Close()

	t.Setenv("KNOWME_TOKEN", "secret-test-token")
	cmd := rootCmd
	if err := cmd.PersistentFlags().Set("server-url", ts.URL); err != nil {
		t.Fatalf("set flag: %v", err)
	}
	defer cmd.PersistentFlags().Set("server-url", "")

	err := fetchAndRenderRemoteStatus(cmd, ts.URL)
	if err != nil {
		t.Fatalf("fetchAndRenderRemoteStatus failed: %v", err)
	}

	if receivedAuth != "Bearer secret-test-token" {
		t.Fatalf("expected Bearer secret-test-token, got %q", receivedAuth)
	}
}

func TestRemoteTaskListDoesNotAccessLocalStore(t *testing.T) {
	receivedPath := ""
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		receivedPath = r.URL.Path
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`[
			{"id":"task-remote-1","title":"Remote Task 1","status":"todo","priority":"high"}
		]`))
	}))
	defer ts.Close()

	// Run task list pointing to remote server
	cmd := rootCmd
	if err := cmd.PersistentFlags().Set("server-url", ts.URL); err != nil {
		t.Fatalf("set flag: %v", err)
	}
	defer cmd.PersistentFlags().Set("server-url", "")

	err := runTaskList(cmd, nil)
	if err != nil {
		t.Fatalf("runTaskList remote failed: %v", err)
	}

	if receivedPath != "/api/tasks" {
		t.Fatalf("expected request to /api/tasks, got %q", receivedPath)
	}
}

func TestRemoteMemoAndLinkRoutingAgainstStubServer(t *testing.T) {
	receivedMemoPath := ""
	receivedLinkPath := ""
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch r.URL.Path {
		case "/api/memos":
			receivedMemoPath = r.URL.Path
			w.Write([]byte(`[
				{"id":"memo-1","content":"Test remote memo","createdAt":"2026-09-13T00:00:00Z","updatedAt":"2026-09-13T00:00:00Z"}
			]`))
		case "/api/links":
			receivedLinkPath = r.URL.Path
			w.Write([]byte(`[
				{"id":"link-1","url":"https://example.com","title":"Example Title","createdAt":"2026-09-13T00:00:00Z","updatedAt":"2026-09-13T00:00:00Z"}
			]`))
		default:
			http.NotFound(w, r)
		}
	}))
	defer ts.Close()

	cmd := rootCmd
	if err := cmd.PersistentFlags().Set("server-url", ts.URL); err != nil {
		t.Fatalf("set flag: %v", err)
	}
	defer cmd.PersistentFlags().Set("server-url", "")

	// Test memo list
	memoListCmd, _, err := rootCmd.Find([]string{"memo", "list"})
	if err != nil {
		t.Fatalf("find memo list cmd: %v", err)
	}
	if err := memoListCmd.RunE(memoListCmd, nil); err != nil {
		t.Fatalf("run memo list failed: %v", err)
	}
	if receivedMemoPath != "/api/memos" {
		t.Fatalf("expected request to /api/memos, got %q", receivedMemoPath)
	}

	linkListCmd, _, err := rootCmd.Find([]string{"link", "list"})
	if err != nil {
		t.Fatalf("find link list cmd: %v", err)
	}
	if err := linkListCmd.RunE(linkListCmd, nil); err != nil {
		t.Fatalf("run link list failed: %v", err)
	}
	if receivedLinkPath != "/api/links" {
		t.Fatalf("expected request to /api/links, got %q", receivedLinkPath)
	}
}

func newConfigTestProject(t *testing.T) (*storage.Store, *models.Project) {
	t.Helper()
	root := filepath.Join(t.TempDir(), ".know-me")
	store := storage.NewStore(root)
	if err := store.Init("config-test"); err != nil {
		t.Fatalf("init store: %v", err)
	}
	project, err := store.Config.Load()
	if err != nil {
		t.Fatalf("load project: %v", err)
	}
	return store, project
}
