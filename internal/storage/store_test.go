package storage

import (
	"os"
	"path/filepath"
	"testing"
)

func TestGlobalRootPathPrefersHOMEOverride(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)

	got := GlobalRootPath()
	want := filepath.Join(home, ".knowns")
	if got != want {
		t.Fatalf("GlobalRootPath() = %q, want %q", got, want)
	}
}

func TestSemanticDBWritableOpensExistingIndex(t *testing.T) {
	root := filepath.Join(t.TempDir(), ".knowns")
	if err := os.MkdirAll(filepath.Join(root, ".search"), 0o755); err != nil {
		t.Fatalf("mkdir search dir: %v", err)
	}
	indexPath := filepath.Join(root, ".search", "index.db")
	if err := os.WriteFile(indexPath, []byte{}, 0o644); err != nil {
		t.Fatalf("create index file: %v", err)
	}

	store := NewStore(root)
	db := store.SemanticDBWritable()
	if db == nil {
		t.Fatal("expected writable semantic db")
	}
	defer db.Close()

	if _, err := db.Exec("CREATE TABLE IF NOT EXISTS test_writes (id INTEGER PRIMARY KEY)"); err != nil {
		t.Fatalf("expected writable db exec to succeed: %v", err)
	}
}

func TestNewProjectStoreSeparatesDataAndRepositoryRoots(t *testing.T) {
	globalRoot, repo := t.TempDir(), t.TempDir()
	store := NewProjectStore(globalRoot, "p12345", repo)
	if store.Root != globalRoot || store.ProjectID != "p12345" || store.RepositoryRoot() != repo {
		t.Fatalf("unexpected store context: %#v", store)
	}
	if got := store.Config.configPath(); got != filepath.Join(globalRoot, "projects", "p12345", "config.json") {
		t.Fatalf("config path = %q", got)
	}
}

func TestProjectStoreInitWritesConfigWhenGlobalConfigExists(t *testing.T) {
	globalRoot, repo := t.TempDir(), t.TempDir()
	if err := NewStore(globalRoot).Init("global"); err != nil {
		t.Fatal(err)
	}

	store := NewProjectStore(globalRoot, "p12345", repo)
	if err := store.Init("demo"); err != nil {
		t.Fatal(err)
	}

	project, err := store.Config.Load()
	if err != nil {
		t.Fatal(err)
	}
	if project.ID != "p12345" || project.Name != "demo" {
		t.Fatalf("project = %#v, want registry ID and name", project)
	}
}

func TestGlobalStoreHasNoRepositoryRoot(t *testing.T) {
	t.Setenv("HOME", t.TempDir())
	if got := NewStore(GlobalRootPath()).RepositoryRoot(); got != "" {
		t.Fatalf("repository root = %q, want empty", got)
	}
}
