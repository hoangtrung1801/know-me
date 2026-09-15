package omp

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"

	"github.com/hoangtrung1801/know-me/internal/models"
	"github.com/hoangtrung1801/know-me/internal/storage"
)

func TestCreateTaskWorktree(t *testing.T) {
	t.Setenv("HOME", t.TempDir())
	repoRoot := initGitRepo(t)

	path, branch, err := CreateTaskWorktree(context.Background(), repoRoot, "project-1", "task-1")
	if err != nil {
		t.Fatalf("CreateTaskWorktree failed: %v", err)
	}

	if branch != "knowme/project-1/task-1" {
		t.Fatalf("branch = %q, want knowme/project-1/task-1", branch)
	}

	if _, err := os.Stat(filepath.Join(path, ".git")); err != nil {
		t.Fatalf("worktree .git missing: %v", err)
	}

	// Second attempt on same task must fail
	_, _, err = CreateTaskWorktree(context.Background(), repoRoot, "project-1", "task-1")
	if err == nil {
		t.Fatal("expected duplicate worktree to fail, got nil")
	}
}

func TestWorktreeSegmentSanitizesHostileIDs(t *testing.T) {
	cases := []struct {
		input string
		want  string
	}{
		{"../../evil", "------evil"},
		{"proj 1/task 2", "proj-1-task-2"},
		{"feature:auth#1", "feature-auth-1"},
		{"clean-id.123_ok", "clean-id.123_ok"},
		{"", "unknown"},
	}

	for _, tc := range cases {
		got := WorktreeSegment(tc.input)
		if got != tc.want {
			t.Errorf("WorktreeSegment(%q) = %q, want %q", tc.input, got, tc.want)
		}
	}
}

func TestResolveExecutionRoot(t *testing.T) {
	temp := t.TempDir()
	store := storage.NewProjectStore(temp, "p1", filepath.Join(temp, "repo"))
	if err := os.MkdirAll(store.RepositoryRoot(), 0o755); err != nil {
		t.Fatal(err)
	}

	// 1. Without worktree
	got, err := ResolveExecutionRoot(store, nil, nil)
	if err != nil {
		t.Fatalf("ResolveExecutionRoot failed: %v", err)
	}
	canonicalRepo, _ := filepath.EvalSymlinks(store.RepositoryRoot())
	if got != canonicalRepo {
		t.Fatalf("got %q, want %q", got, canonicalRepo)
	}

	// 2. With worktree
	wtDir := filepath.Join(temp, "wt")
	if err := os.MkdirAll(wtDir, 0o755); err != nil {
		t.Fatal(err)
	}
	wf := &models.AgentWorkflow{
		WorktreePath: wtDir,
	}
	gotWt, err := ResolveExecutionRoot(store, nil, wf)
	if err != nil {
		t.Fatalf("ResolveExecutionRoot with worktree failed: %v", err)
	}
	canonicalWt, _ := filepath.EvalSymlinks(wtDir)
	if gotWt != canonicalWt {
		t.Fatalf("got %q, want %q", gotWt, canonicalWt)
	}
}

func initGitRepo(t *testing.T) string {
	t.Helper()
	root := t.TempDir()
	gitCmd(t, root, "init")
	gitCmd(t, root, "config", "user.email", "tests@example.com")
	gitCmd(t, root, "config", "user.name", "Tests")
	if err := os.WriteFile(filepath.Join(root, "README.md"), []byte("# Hello\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	gitCmd(t, root, "add", "README.md")
	gitCmd(t, root, "commit", "-m", "init")
	return root
}

func gitCmd(t *testing.T, root string, args ...string) {
	t.Helper()
	cmd := exec.Command("git", append([]string{"-C", root}, args...)...)
	if out, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("git %s failed: %v\n%s", strings.Join(args, " "), err, out)
	}
}
