package storage

import (
	"os"
	"path/filepath"
	"sync"
	"testing"

	"github.com/howznguyen/knowns/internal/registry"
)

// createFakeProject creates a temp dir with a .knowns/ subfolder.
func createFakeProject(t *testing.T, parent, name string) string {
	t.Helper()
	dir := filepath.Join(parent, name)
	if err := os.MkdirAll(filepath.Join(dir, ".knowns"), 0755); err != nil {
		t.Fatal(err)
	}
	return dir
}

func TestManagerGetStore(t *testing.T) {
	tmpDir := t.TempDir()
	projDir := createFakeProject(t, tmpDir, "proj")
	store := NewStore(filepath.Join(projDir, ".knowns"))

	m := NewManager(store, nil)
	if got := m.GetStore(); got != store {
		t.Fatal("GetStore should return the initial store")
	}
}

func TestManagerSwitch(t *testing.T) {
	tmpDir := t.TempDir()
	proj1 := createFakeProject(t, tmpDir, "proj1")
	proj2 := createFakeProject(t, tmpDir, "proj2")

	regFile := filepath.Join(tmpDir, "registry.json")
	reg := registry.NewRegistryWithPath(regFile)
	reg.Load()

	store1 := NewStore(filepath.Join(proj1, ".knowns"))
	m := NewManager(store1, reg)

	// Verify initial store
	if m.GetStore().Root != store1.Root {
		t.Fatal("initial store mismatch")
	}

	// Switch to proj2
	newStore, err := m.Switch(proj2)
	if err != nil {
		t.Fatalf("Switch failed: %v", err)
	}
	if newStore.Root != filepath.Join(proj2, ".knowns") {
		t.Fatalf("new store root = %q, want %q", newStore.Root, filepath.Join(proj2, ".knowns"))
	}
	if m.GetStore().Root != newStore.Root {
		t.Fatal("GetStore should return the switched store")
	}
}

func TestManagerSwitchInvalidPath(t *testing.T) {
	tmpDir := t.TempDir()
	proj := createFakeProject(t, tmpDir, "proj")
	store := NewStore(filepath.Join(proj, ".knowns"))

	m := NewManager(store, nil)
	_, err := m.Switch(filepath.Join(tmpDir, "nonexistent"))
	if err == nil {
		t.Fatal("Switch to nonexistent path should fail")
	}
}

func TestManagerConcurrentAccess(t *testing.T) {
	tmpDir := t.TempDir()
	proj1 := createFakeProject(t, tmpDir, "proj1")
	proj2 := createFakeProject(t, tmpDir, "proj2")

	regFile := filepath.Join(tmpDir, "registry.json")
	reg := registry.NewRegistryWithPath(regFile)
	reg.Load()

	store1 := NewStore(filepath.Join(proj1, ".knowns"))
	m := NewManager(store1, reg)

	var wg sync.WaitGroup
	// 10 goroutines reading GetStore concurrently
	for i := 0; i < 10; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for j := 0; j < 100; j++ {
				s := m.GetStore()
				if s == nil {
					t.Error("GetStore returned nil")
				}
			}
		}()
	}
	// 1 goroutine switching
	wg.Add(1)
	go func() {
		defer wg.Done()
		for j := 0; j < 50; j++ {
			m.Switch(proj2)
			m.Switch(proj1)
		}
	}()
	wg.Wait()
}

func TestManagerActiveProjectRoot(t *testing.T) {
	tmpDir := t.TempDir()
	proj := createFakeProject(t, tmpDir, "myproj")
	store := NewStore(filepath.Join(proj, ".knowns"))

	m := NewManager(store, nil)
	root := m.ActiveProjectRoot()
	if root != proj {
		t.Fatalf("ActiveProjectRoot = %q, want %q", root, proj)
	}
}
