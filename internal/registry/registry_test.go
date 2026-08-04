package registry

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestRegistryLoadDropsLegacyPaths(t *testing.T) {
	file := filepath.Join(t.TempDir(), "registry.json")
	if err := os.WriteFile(file, []byte(`[{"id":"one","name":"One","path":"/old"},{"id":"two","name":"Two"}]`), 0644); err != nil {
		t.Fatal(err)
	}
	r := NewRegistryWithPath(file)
	if err := r.Load(); err != nil {
		t.Fatal(err)
	}
	if len(r.Projects) != 2 || r.Projects[0].Name != "One" {
		t.Fatalf("projects = %#v", r.Projects)
	}
	saved, err := os.ReadFile(file)
	if err != nil || strings.Contains(string(saved), `"path"`) {
		t.Fatalf("saved registry = %s, err = %v", saved, err)
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
