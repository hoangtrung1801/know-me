package cli

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/hoangtrung1801/known-me/internal/registry"
	"github.com/hoangtrung1801/known-me/internal/storage"
)

func TestResolveProjectStoreUsesWorkspaceLink(t *testing.T) {
	home, repo := t.TempDir(), t.TempDir()
	nested := filepath.Join(repo, "src", "pkg")
	if err := os.MkdirAll(nested, 0o755); err != nil {
		t.Fatal(err)
	}
	t.Setenv("HOME", home)

	reg := registry.NewRegistryWithPath(filepath.Join(home, ".knowns", "registry.json"))
	if err := reg.Load(); err != nil {
		t.Fatal(err)
	}
	project, err := reg.Create("linked")
	if err != nil {
		t.Fatal(err)
	}
	link := []byte(fmt.Sprintf("{\n  \"projectId\": \"%s\"\n}\n", project.ID))
	if err := os.WriteFile(filepath.Join(repo, ".known-me.json"), link, 0o644); err != nil {
		t.Fatal(err)
	}

	store, err := resolveProjectStore(nested)
	if err != nil {
		t.Fatal(err)
	}
	if store.ProjectID != project.ID || store.RepositoryRoot() != repo {
		t.Fatalf("store = %#v, want project %q and root %q", store, project.ID, repo)
	}
}

func TestResolveProjectStoreFallsBackToActiveProject(t *testing.T) {
	home, repo := t.TempDir(), t.TempDir()
	t.Setenv("HOME", home)
	reg := registry.NewRegistryWithPath(filepath.Join(home, ".knowns", "registry.json"))
	if err := reg.Load(); err != nil {
		t.Fatal(err)
	}
	project, err := reg.Create("active")
	if err != nil {
		t.Fatal(err)
	}

	store, err := resolveProjectStore(filepath.Join(repo, "nested"))
	if err != nil {
		t.Fatal(err)
	}
	if store.ProjectID != project.ID || store.RepositoryRoot() != "" {
		t.Fatalf("store = %#v, want active project %q and no repository root", store, project.ID)
	}
}

func TestResolveProjectStoreRejectsBadWorkspaceLink(t *testing.T) {
	home, repo := t.TempDir(), t.TempDir()
	t.Setenv("HOME", home)
	reg := registry.NewRegistryWithPath(filepath.Join(home, ".knowns", "registry.json"))
	if err := reg.Load(); err != nil {
		t.Fatal(err)
	}
	if _, err := reg.Create("active"); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(repo, ".known-me.json"), []byte(`{"projectId":"missing"}`), 0o644); err != nil {
		t.Fatal(err)
	}

	store, err := resolveProjectStore(repo)
	if err == nil || store != nil || !strings.Contains(err.Error(), "missing") {
		t.Fatalf("store = %#v, err = %v, want stale-link error without fallback", store, err)
	}
}

func TestResolveProjectStoreRequiresActiveProject(t *testing.T) {
	home, repo := t.TempDir(), t.TempDir()
	t.Setenv("HOME", home)
	reg := registry.NewRegistryWithPath(filepath.Join(home, ".knowns", "registry.json"))
	if err := reg.Load(); err != nil {
		t.Fatal(err)
	}
	store, err := resolveProjectStore(repo)
	if err == nil || store != nil || !strings.Contains(err.Error(), "run 'knowns init'") {
		t.Fatalf("store = %#v, err = %v, want initialization error", store, err)
	}
}

func TestResolveProjectStoreRejectsMalformedWorkspaceLink(t *testing.T) {
	home, repo := t.TempDir(), t.TempDir()
	t.Setenv("HOME", home)
	if err := os.WriteFile(filepath.Join(repo, ".known-me.json"), []byte("{bad"), 0o644); err != nil {
		t.Fatal(err)
	}
	store, err := resolveProjectStore(repo)
	if err == nil || store != nil || !strings.Contains(err.Error(), ".known-me.json") {
		t.Fatalf("store = %#v, err = %v, want malformed-link error", store, err)
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
