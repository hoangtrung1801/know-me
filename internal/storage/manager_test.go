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
