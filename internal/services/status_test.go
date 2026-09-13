package services

import (
	"os"
	"path/filepath"
	"reflect"
	"testing"

	"github.com/hoangtrung1801/know-me/internal/agents/opencode"
	"github.com/hoangtrung1801/know-me/internal/models"
	"github.com/hoangtrung1801/know-me/internal/search"
	"github.com/hoangtrung1801/know-me/internal/storage"
)

func TestSortServiceStatusesRunningFirst(t *testing.T) {
	statuses := []ServiceStatus{
		{Name: "Zeta", Status: "stopped"},
		{Name: "TypeScript", Status: "running"},
		{Name: "Alpha", Status: "disabled"},
		{Name: "Go", Status: "running"},
		{Name: "Beta", Status: "error"},
	}

	sortServiceStatuses(statuses)

	got := make([]string, 0, len(statuses))
	for _, service := range statuses {
		got = append(got, service.Status+":"+service.Name)
	}
	want := []string{
		"running:Go",
		"running:TypeScript",
		"disabled:Alpha",
		"error:Beta",
		"stopped:Zeta",
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("ordered statuses = %v, want %v", got, want)
	}
}

func TestDetectOpenCodeReadOnlyPreservesStalePIDFile(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)
	t.Setenv("USERPROFILE", home)
	config := opencode.DefaultConfig()
	daemon := opencode.NewDaemon(config.Host, config.Port)
	if err := os.MkdirAll(filepath.Dir(daemon.PIDFile), 0o755); err != nil {
		t.Fatalf("create PID directory: %v", err)
	}
	if err := os.WriteFile(daemon.PIDFile, []byte("99999999"), 0o644); err != nil {
		t.Fatalf("write stale PID: %v", err)
	}

	status := detectOpenCode(nil, false)[0]
	if status.Status != "stopped" {
		t.Fatalf("read-only status = %q, want stopped", status.Status)
	}
	if _, err := os.Stat(daemon.PIDFile); err != nil {
		t.Fatalf("read-only detection removed stale PID: %v", err)
	}

	_ = detectOpenCode(nil, true)
	if _, err := os.Stat(daemon.PIDFile); !os.IsNotExist(err) {
		t.Fatalf("cleanup detection left stale PID, stat error = %v", err)
	}
}

func TestDetectEmbeddingReportsRuntimeDisabled(t *testing.T) {
	t.Setenv("HOME", t.TempDir())
	t.Setenv("KNOWNS_SEMANTIC_RUNTIME_DISABLED", "1")
	search.DefaultSemanticRuntime().Close()
	t.Cleanup(search.DefaultSemanticRuntime().Close)
	store := newStatusSemanticStore(t)

	service := detectEmbedding(store)[0]
	if service.Status != "disabled" {
		t.Fatalf("status = %q, want disabled", service.Status)
	}
	if service.Details["runtime_enabled"] != "false" {
		t.Fatalf("runtime_enabled = %q, want false", service.Details["runtime_enabled"])
	}
	if service.Details["runtime_disabled_by"] != "KNOWNS_SEMANTIC_RUNTIME_DISABLED" {
		t.Fatalf("runtime_disabled_by = %q", service.Details["runtime_disabled_by"])
	}
}


func newStatusSemanticStore(t *testing.T) *storage.Store {
	t.Helper()
	root := filepath.Join(t.TempDir(), ".know-me")
	store := storage.NewStore(root)
	project := &models.Project{
		Name: "status-test",
		ID:   "status-test",
		Settings: models.ProjectSettings{
			SemanticSearch: &models.SemanticSearchSettings{
				Enabled:    true,
				Provider:   "local",
				Model:      "gte-small",
				Dimensions: 384,
			},
		},
	}
	if err := store.Config.Save(project); err != nil {
		t.Fatalf("save project config: %v", err)
	}
	return store
}

