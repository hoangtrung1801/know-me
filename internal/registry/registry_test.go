package registry

import (
	"os"
	"path/filepath"
	"testing"
	"time"
)

// helper creates a temp dir with a .knowns/config.json to simulate an initialized project.
func createFakeProject(t *testing.T, parent, name string) string {
	t.Helper()
	dir := filepath.Join(parent, name)
	os.MkdirAll(filepath.Join(dir, ".knowns"), 0755)
	os.WriteFile(filepath.Join(dir, ".knowns", "config.json"), []byte(`{"name":"`+name+`"}`), 0644)
	return dir
}

func TestRegistryAddAndLoad(t *testing.T) {
	tmpDir := t.TempDir()
	regFile := filepath.Join(tmpDir, "registry.json")
	projDir := createFakeProject(t, tmpDir, "my-project")

	r := NewRegistryWithPath(regFile)
	if err := r.Load(); err != nil {
		t.Fatalf("Load failed: %v", err)
	}

	p, err := r.Add(projDir)
	if err != nil {
		t.Fatalf("Add failed: %v", err)
	}
	if p.Name != "my-project" {
		t.Fatalf("Name = %q, want %q", p.Name, "my-project")
	}
	if p.Path != projDir {
		t.Fatalf("Path = %q, want %q", p.Path, projDir)
	}

	// Reload and verify persistence
	r2 := NewRegistryWithPath(regFile)
	if err := r2.Load(); err != nil {
		t.Fatalf("Reload failed: %v", err)
	}
	if len(r2.Projects) != 1 {
		t.Fatalf("expected 1 project after reload, got %d", len(r2.Projects))
	}
	if r2.Projects[0].ID != p.ID {
		t.Fatalf("ID mismatch after reload")
	}
}

func TestRegistryRemove(t *testing.T) {
	tmpDir := t.TempDir()
	regFile := filepath.Join(tmpDir, "registry.json")
	projDir := createFakeProject(t, tmpDir, "to-remove")

	r := NewRegistryWithPath(regFile)
	r.Load()
	p, _ := r.Add(projDir)

	if err := r.Remove(p.ID); err != nil {
		t.Fatalf("Remove failed: %v", err)
	}
	if len(r.Projects) != 0 {
		t.Fatalf("expected 0 projects after remove, got %d", len(r.Projects))
	}
}

func TestRegistrySetActiveAndGetActive(t *testing.T) {
	tmpDir := t.TempDir()
	regFile := filepath.Join(tmpDir, "registry.json")
	proj1 := createFakeProject(t, tmpDir, "proj-a")
	proj2 := createFakeProject(t, tmpDir, "proj-b")

	r := NewRegistryWithPath(regFile)
	r.Load()
	p1, _ := r.Add(proj1)
	time.Sleep(10 * time.Millisecond)
	p2, _ := r.Add(proj2)

	// p2 was added last, so it should be active
	active := r.GetActive()
	if active.ID != p2.ID {
		t.Fatalf("expected p2 to be active, got %s", active.ID)
	}

	// Set p1 as active
	r.SetActive(p1.ID)
	active = r.GetActive()
	if active.ID != p1.ID {
		t.Fatalf("expected p1 to be active after SetActive, got %s", active.ID)
	}
}

func TestRegistryAddDeduplicate(t *testing.T) {
	tmpDir := t.TempDir()
	regFile := filepath.Join(tmpDir, "registry.json")
	projDir := createFakeProject(t, tmpDir, "dup-project")

	r := NewRegistryWithPath(regFile)
	r.Load()
	p1, _ := r.Add(projDir)
	p2, _ := r.Add(projDir) // same path again

	if p1.ID != p2.ID {
		t.Fatalf("expected same ID for duplicate add, got %s vs %s", p1.ID, p2.ID)
	}
	if len(r.Projects) != 1 {
		t.Fatalf("expected 1 project after duplicate add, got %d", len(r.Projects))
	}
}

func TestRegistryScan(t *testing.T) {
	tmpDir := t.TempDir()
	regFile := filepath.Join(tmpDir, "registry.json")

	// Create a parent dir with 3 subdirs, 2 of which have .knowns/
	scanDir := filepath.Join(tmpDir, "projects")
	createFakeProject(t, scanDir, "repo-a")
	createFakeProject(t, scanDir, "repo-b")
	os.MkdirAll(filepath.Join(scanDir, "not-a-repo"), 0755) // no .knowns/

	r := NewRegistryWithPath(regFile)
	r.Load()

	added, err := r.Scan([]string{scanDir})
	if err != nil {
		t.Fatalf("Scan failed: %v", err)
	}
	if len(added) != 2 {
		t.Fatalf("expected 2 discovered projects, got %d", len(added))
	}
	if len(r.Projects) != 2 {
		t.Fatalf("expected 2 total projects, got %d", len(r.Projects))
	}

	// Scan again — should find 0 new
	added2, _ := r.Scan([]string{scanDir})
	if len(added2) != 0 {
		t.Fatalf("expected 0 new projects on rescan, got %d", len(added2))
	}
}

func TestRegistryFindByPath(t *testing.T) {
	tmpDir := t.TempDir()
	regFile := filepath.Join(tmpDir, "registry.json")
	projDir := createFakeProject(t, tmpDir, "findme")

	r := NewRegistryWithPath(regFile)
	r.Load()
	r.Add(projDir)

	found := r.FindByPath(projDir)
	if found == nil {
		t.Fatal("FindByPath returned nil for registered project")
	}
	if found.Name != "findme" {
		t.Fatalf("FindByPath Name = %q, want %q", found.Name, "findme")
	}

	notFound := r.FindByPath("/nonexistent/path")
	if notFound != nil {
		t.Fatal("FindByPath should return nil for unregistered path")
	}
}

func TestRegistryGetActiveEmpty(t *testing.T) {
	r := NewRegistryWithPath("/tmp/empty-reg.json")
	r.Load()
	if r.GetActive() != nil {
		t.Fatal("GetActive should return nil for empty registry")
	}
}
