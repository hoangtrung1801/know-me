package storage

import (
	"context"
	"os"
	"path/filepath"
	"testing"

	"github.com/hoangtrung1801/know-me/internal/models"
	"github.com/hoangtrung1801/know-me/internal/registry"
)

func TestResolveProjectWorkspaceExplicitSetting(t *testing.T) {
	temp := t.TempDir()
	wsDir := filepath.Join(temp, "custom-workspace")
	if err := os.MkdirAll(wsDir, 0o755); err != nil {
		t.Fatal(err)
	}

	store := NewProjectStore(temp, "p1", filepath.Join(temp, "repo"))
	cfg := models.Project{ID: "p1", Name: "Project 1", Settings: models.DefaultProjectSettings()}
	cfg.Settings.WorkspacePath = wsDir
	if err := store.Config.Save(&cfg); err != nil {
		t.Fatal(err)
	}

	got, err := ResolveProjectWorkspace(store, nil)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	canonical, _ := filepath.EvalSymlinks(wsDir)
	if got != canonical {
		t.Fatalf("got %q, want %q", got, canonical)
	}
}

func TestResolveProjectWorkspaceTildeExpansion(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)
	wsDir := filepath.Join(home, "my-project")
	if err := os.MkdirAll(wsDir, 0o755); err != nil {
		t.Fatal(err)
	}

	temp := t.TempDir()
	store := NewProjectStore(temp, "p1", "")
	cfg := models.Project{ID: "p1", Name: "Project 1", Settings: models.DefaultProjectSettings()}
	cfg.Settings.WorkspacePath = "~/my-project"
	if err := store.Config.Save(&cfg); err != nil {
		t.Fatal(err)
	}

	got, err := ResolveProjectWorkspace(store, nil)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	canonical, _ := filepath.EvalSymlinks(wsDir)
	if got != canonical {
		t.Fatalf("got %q, want %q", got, canonical)
	}
}

func TestResolveProjectWorkspaceRelativePath(t *testing.T) {
	repoDir := t.TempDir()
	subDir := filepath.Join(repoDir, "sub-pkg")
	if err := os.MkdirAll(subDir, 0o755); err != nil {
		t.Fatal(err)
	}

	temp := t.TempDir()
	store := NewProjectStore(temp, "p1", repoDir)
	cfg := models.Project{ID: "p1", Name: "Project 1", Settings: models.DefaultProjectSettings()}
	cfg.Settings.WorkspacePath = "sub-pkg"
	if err := store.Config.Save(&cfg); err != nil {
		t.Fatal(err)
	}

	got, err := ResolveProjectWorkspace(store, nil)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	canonical, _ := filepath.EvalSymlinks(subDir)
	if got != canonical {
		t.Fatalf("got %q, want %q", got, canonical)
	}
}

func TestResolveProjectWorkspaceNonExistentPathFails(t *testing.T) {
	temp := t.TempDir()
	store := NewProjectStore(temp, "p1", "")
	cfg := models.Project{ID: "p1", Name: "Project 1", Settings: models.DefaultProjectSettings()}
	cfg.Settings.WorkspacePath = filepath.Join(temp, "does-not-exist")
	if err := store.Config.Save(&cfg); err != nil {
		t.Fatal(err)
	}

	_, err := ResolveProjectWorkspace(store, nil)
	if err == nil {
		t.Fatal("expected error for non-existent workspace path, got nil")
	}
}

func TestResolveProjectWorkspaceCorruptConfigFailsClosed(t *testing.T) {
	temp := t.TempDir()
	store := NewProjectStore(temp, "p1", temp)
	configPath := store.Config.configPath()
	if err := os.MkdirAll(filepath.Dir(configPath), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(configPath, []byte("{invalid-json"), 0o644); err != nil {
		t.Fatal(err)
	}

	_, err := ResolveProjectWorkspace(store, nil)
	if err == nil {
		t.Fatal("expected error for corrupt config, got nil")
	}
}

func TestResolveProjectWorkspaceFallbackToRepoRoot(t *testing.T) {
	repoDir := t.TempDir()
	store := NewProjectStore(t.TempDir(), "p1", repoDir)

	got, err := ResolveProjectWorkspace(store, nil)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	canonical, _ := filepath.EvalSymlinks(repoDir)
	if got != canonical {
		t.Fatalf("got %q, want %q", got, canonical)
	}
}

func TestResolveProjectWorkspaceFallbackToRegistry(t *testing.T) {
	regDir := t.TempDir()
	regPath := filepath.Join(regDir, "registry.json")
	reg := registry.NewRegistryWithPath(regPath)
	projDir := t.TempDir()
	reg.Projects = append(reg.Projects, registry.Project{ID: "p1", Name: "Project 1", Path: projDir})
	if err := reg.Save(); err != nil {
		t.Fatal(err)
	}

	store := NewProjectStore(t.TempDir(), "p1", "")

	got, err := ResolveProjectWorkspace(store, reg)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	canonical, _ := filepath.EvalSymlinks(projDir)
	if got != canonical {
		t.Fatalf("got %q, want %q", got, canonical)
	}
}

func TestExecutionRootUsesWorktreeWhenPresent(t *testing.T) {
	worktreeDir := t.TempDir()
	repoDir := t.TempDir()
	store := NewProjectStore(t.TempDir(), "p1", repoDir)

	workflow := &models.AgentWorkflow{
		WorktreePath: worktreeDir,
	}

	got, err := ExecutionRoot(store, nil, workflow)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	canonical, _ := filepath.EvalSymlinks(worktreeDir)
	if got != canonical {
		t.Fatalf("got %q, want %q", got, canonical)
	}
}

func TestAcquireWorkspaceRunLockConflict(t *testing.T) {
	wsDir := t.TempDir()
	t.Setenv("HOME", t.TempDir())

	store1 := NewProjectStore(t.TempDir(), "p1", wsDir)
	store2 := NewProjectStore(t.TempDir(), "p2", wsDir)

	lock1, err := store1.Agent.AcquireWorkspaceRunLock(context.Background(), wsDir)
	if err != nil {
		t.Fatalf("lock1 error: %v", err)
	}
	defer lock1.Close()

	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	_, err = store2.Agent.AcquireWorkspaceRunLock(ctx, wsDir)
	if err == nil {
		t.Fatal("expected second lock on same workspace to fail, got nil")
	}
}
