package paths

import (
	"path/filepath"
	"testing"
)

func TestActiveIdentityUsesKnowmeNames(t *testing.T) {
	if CLIName != "knownme" {
		t.Fatalf("CLIName = %q, want knownme", CLIName)
	}
	if StoreDirName != ".known-me" {
		t.Fatalf("StoreDirName = %q, want .known-me", StoreDirName)
	}
}

func TestGlobalStoreRootUsesNewDirectory(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)

	if got, want := GlobalStoreRoot(), filepath.Join(home, ".known-me"); got != want {
		t.Fatalf("GlobalStoreRoot() = %q, want %q", got, want)
	}
}

func TestProjectStoreRootUsesNewDirectory(t *testing.T) {
	project := t.TempDir()

	if got, want := ProjectStoreRoot(project), filepath.Join(project, ".known-me"); got != want {
		t.Fatalf("ProjectStoreRoot() = %q, want %q", got, want)
	}
}
