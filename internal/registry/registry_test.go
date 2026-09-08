package registry

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestNewRegistryUsesKnowMeGlobalRoot(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)

	registry := NewRegistry()
	want := filepath.Join(home, ".know-me", "registry.json")
	if registry.filePath != want {
		t.Fatalf("registry path = %q, want %q", registry.filePath, want)
	}
}

func TestRegistryLoadPreservesProjectPaths(t *testing.T) {
	file := filepath.Join(t.TempDir(), "registry.json")
	projectRoot := t.TempDir()
	if err := os.WriteFile(file, []byte(`[{"id":"one","name":"One","path":"`+projectRoot+`"},{"id":"two","name":"Two"}]`), 0644); err != nil {
		t.Fatal(err)
	}
	r := NewRegistryWithPath(file)
	if err := r.Load(); err != nil {
		t.Fatal(err)
	}
	wantRoot, err := filepath.EvalSymlinks(projectRoot)
	if err != nil {
		t.Fatal(err)
	}
	if len(r.Projects) != 2 || r.Projects[0].Name != "One" || r.Projects[0].Path != wantRoot {
		t.Fatalf("projects = %#v", r.Projects)
	}
	saved, err := os.ReadFile(file)
	if err != nil || !strings.Contains(string(saved), `"path"`) {
		t.Fatalf("saved registry = %s, err = %v", saved, err)
	}
}

func TestRegistrySetPathCanonicalizesAndPersists(t *testing.T) {
	file := filepath.Join(t.TempDir(), "registry.json")
	root := t.TempDir()
	alias := filepath.Join(t.TempDir(), "alias")
	if err := os.Symlink(root, alias); err != nil {
		t.Fatal(err)
	}
	r := NewRegistryWithPath(file)
	if err := r.Load(); err != nil {
		t.Fatal(err)
	}
	project, err := r.Create("Launch")
	if err != nil {
		t.Fatal(err)
	}
	if err := r.SetPath(project.ID, alias); err != nil {
		t.Fatal(err)
	}
	wantRoot, err := filepath.EvalSymlinks(root)
	if err != nil {
		t.Fatal(err)
	}
	if got := r.Projects[0].Path; got != wantRoot {
		t.Fatalf("path = %q, want canonical root %q", got, wantRoot)
	}

	reloaded := NewRegistryWithPath(file)
	if err := reloaded.Load(); err != nil {
		t.Fatal(err)
	}
	if got := reloaded.Projects[0].Path; got != wantRoot {
		t.Fatalf("reloaded path = %q, want %q", got, wantRoot)
	}
}

func TestRegistryLoadDropsInvalidProjectPaths(t *testing.T) {
	file := filepath.Join(t.TempDir(), "registry.json")
	regularFile := filepath.Join(t.TempDir(), "not-a-directory")
	if err := os.WriteFile(regularFile, []byte("data"), 0644); err != nil {
		t.Fatal(err)
	}
	data := `[{"id":"file","name":"File","path":"` + regularFile + `"},{"id":"missing","name":"Missing","path":"` + filepath.Join(t.TempDir(), "gone") + `"}]`
	if err := os.WriteFile(file, []byte(data), 0644); err != nil {
		t.Fatal(err)
	}
	r := NewRegistryWithPath(file)
	if err := r.Load(); err != nil {
		t.Fatal(err)
	}
	if r.Projects[0].Path != "" || r.Projects[1].Path != "" {
		t.Fatalf("projects = %#v, want invalid paths cleared", r.Projects)
	}
}

func TestRegistrySetPathMergesChangesFromAnotherRegistryInstance(t *testing.T) {
	file := filepath.Join(t.TempDir(), "registry.json")
	rootA, rootB := t.TempDir(), t.TempDir()
	first := NewRegistryWithPath(file)
	if err := first.Load(); err != nil {
		t.Fatal(err)
	}
	projectA, err := first.Create("A")
	if err != nil {
		t.Fatal(err)
	}
	projectB, err := first.Create("B")
	if err != nil {
		t.Fatal(err)
	}
	second := NewRegistryWithPath(file)
	if err := second.Load(); err != nil {
		t.Fatal(err)
	}
	if err := first.SetPath(projectA.ID, rootA); err != nil {
		t.Fatal(err)
	}
	if err := second.SetPath(projectB.ID, rootB); err != nil {
		t.Fatal(err)
	}
	reloaded := NewRegistryWithPath(file)
	if err := reloaded.Load(); err != nil {
		t.Fatal(err)
	}
	wantA, _ := filepath.EvalSymlinks(rootA)
	wantB, _ := filepath.EvalSymlinks(rootB)
	if reloaded.Projects[0].Path != wantA || reloaded.Projects[1].Path != wantB {
		t.Fatalf("projects = %#v, want both path updates preserved", reloaded.Projects)
	}
}

func TestRegistryCreateAllowsRepeatedNames(t *testing.T) {
	r := NewRegistryWithPath(filepath.Join(t.TempDir(), "registry.json"))
	if err := r.Load(); err != nil {
		t.Fatal(err)
	}
	a, err := r.Create("Launch")
	if err != nil {
		t.Fatal(err)
	}
	b, err := r.Create("Launch")
	if err != nil {
		t.Fatal(err)
	}
	if a.ID == b.ID || len(r.Projects) != 2 {
		t.Fatalf("projects = %#v", r.Projects)
	}
}

func TestRegistryRemoveAndActive(t *testing.T) {
	r := NewRegistryWithPath(filepath.Join(t.TempDir(), "registry.json"))
	if err := r.Load(); err != nil {
		t.Fatal(err)
	}
	a, _ := r.Create("A")
	time.Sleep(time.Millisecond)
	b, _ := r.Create("B")
	if got := r.GetActive(); got == nil || got.ID != b.ID {
		t.Fatalf("active = %#v", r.GetActive())
	}
	if err := r.SetActive(a.ID); err != nil {
		t.Fatal(err)
	}
	if err := r.Remove(b.ID); err != nil || len(r.Projects) != 1 {
		t.Fatalf("remove err = %v, projects = %#v", err, r.Projects)
	}
}

func TestRegistryRejectsBlankName(t *testing.T) {
	r := NewRegistryWithPath(filepath.Join(t.TempDir(), "registry.json"))
	if err := r.Load(); err != nil {
		t.Fatal(err)
	}
	if _, err := r.Create("  "); err == nil {
		t.Fatal("blank name accepted")
	}
}
