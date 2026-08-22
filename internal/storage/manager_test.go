package storage

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/hoangtrung1801/known-me/internal/registry"
)

func TestManagerGetStore(t *testing.T) {
	root := filepath.Join(t.TempDir(), ".knowns")
	store := NewStore(root)
	if got := NewManager(store, nil).GetStore(); got != store {
		t.Fatal("GetStore should return initial store")
	}
}

func TestManagerRegistry(t *testing.T) {
	r := registry.NewRegistryWithPath(filepath.Join(t.TempDir(), "registry.json"))
	if err := r.Load(); err != nil {
		t.Fatal(err)
	}
	m := NewManager(nil, r)
	p, err := r.Create("Launch")
	if err != nil || m.GetRegistry() != r || p.Name != "Launch" {
		t.Fatalf("registry = %#v, err = %v", p, err)
	}
}

func TestManagerActiveProjectRoot(t *testing.T) {
	root := t.TempDir()
	if err := os.MkdirAll(filepath.Join(root, ".knowns"), 0755); err != nil {
		t.Fatal(err)
	}
	m := NewManager(NewStore(filepath.Join(root, ".knowns")), nil)
	if got := m.ActiveProjectRoot(); got != root {
		t.Fatalf("root = %q, want %q", got, root)
	}
}

func TestManagerProjectStoreUsesRegisteredRepositoryPath(t *testing.T) {
	home := t.TempDir()
	globalRoot := filepath.Join(home, ".knowns")
	repositoryRoot := t.TempDir()
	r := registry.NewRegistryWithPath(filepath.Join(globalRoot, "registry.json"))
	if err := r.Load(); err != nil {
		t.Fatal(err)
	}
	project, err := r.Create("Launch")
	if err != nil {
		t.Fatal(err)
	}
	if err := r.SetPath(project.ID, repositoryRoot); err != nil {
		t.Fatal(err)
	}
	m := NewManager(NewProjectStore(globalRoot, project.ID, ""), r)

	store, err := m.ProjectStore(project.ID)
	if err != nil {
		t.Fatal(err)
	}
	wantRoot, err := filepath.EvalSymlinks(repositoryRoot)
	if err != nil {
		t.Fatal(err)
	}
	if got := store.RepositoryRoot(); got != wantRoot {
		t.Fatalf("repository root = %q, want %q", got, wantRoot)
	}
}

func TestManagerProjectStorePrefersRegisteredPathOverStaleActiveStore(t *testing.T) {
	home := t.TempDir()
	globalRoot := filepath.Join(home, ".knowns")
	registeredRoot, staleRoot := t.TempDir(), t.TempDir()
	r := registry.NewRegistryWithPath(filepath.Join(globalRoot, "registry.json"))
	if err := r.Load(); err != nil {
		t.Fatal(err)
	}
	project, err := r.Create("Launch")
	if err != nil {
		t.Fatal(err)
	}
	if err := r.SetPath(project.ID, registeredRoot); err != nil {
		t.Fatal(err)
	}
	m := NewManager(NewProjectStore(globalRoot, project.ID, staleRoot), r)
	store, err := m.ProjectStore(project.ID)
	if err != nil {
		t.Fatal(err)
	}
	wantRoot, _ := filepath.EvalSymlinks(registeredRoot)
	if got := store.RepositoryRoot(); got != wantRoot {
		t.Fatalf("repository root = %q, want registered root %q", got, wantRoot)
	}
}
