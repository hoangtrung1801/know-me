package cli

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/howznguyen/knowns/internal/registry"
	"github.com/howznguyen/knowns/internal/storage"
)

func TestResolveProjectStoreUsesRegistryWithoutLocalKnowns(t *testing.T) {
	home, repo := t.TempDir(), t.TempDir()
	t.Setenv("HOME", home)
	r := registry.NewRegistry()
	if err := r.Load(); err != nil {
		t.Fatal(err)
	}
	p, err := r.Add(repo)
	if err != nil {
		t.Fatal(err)
	}
	store, err := resolveProjectStore(filepath.Join(repo, "subdir"))
	if err != nil || store.ProjectID != p.ID || store.RepositoryRoot() != repo {
		t.Fatalf("store = %#v, err = %v", store, err)
	}
	if _, err := os.Stat(filepath.Join(repo, ".knowns")); !os.IsNotExist(err) {
		t.Fatalf("unexpected local .knowns: %v", err)
	}
	if store.Root != storage.GlobalRootPath() {
		t.Fatalf("store root = %q, want %q", store.Root, storage.GlobalRootPath())
	}
}

func TestProjectStoreInitWritesCentralConfig(t *testing.T) {
	globalRoot, repo := t.TempDir(), t.TempDir()
	store := storage.NewProjectStore(globalRoot, "p12345", repo)
	if err := store.Init("demo"); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(globalRoot, "projects", "p12345", "config.json")); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(repo, ".knowns")); !os.IsNotExist(err) {
		t.Fatalf("unexpected repository-local store: %v", err)
	}
}
