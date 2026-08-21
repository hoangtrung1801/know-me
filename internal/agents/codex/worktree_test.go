package codex

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

func TestCreateTaskWorktree(t *testing.T) {
	t.Setenv("HOME", t.TempDir())
	repositoryRoot := initTestGitRepository(t)

	path, branch, err := createTaskWorktree(context.Background(), repositoryRoot, "project-1", "task-1")
	if err != nil {
		t.Fatal(err)
	}
	if branch != taskWorktreeBranch("project-1", "task-1") {
		t.Fatalf("branch = %q", branch)
	}
	if _, err := os.Stat(filepath.Join(path, ".git")); err != nil {
		t.Fatalf("worktree missing: %v", err)
	}
	if _, err := os.Stat(filepath.Join(path, "README.md")); err != nil {
		t.Fatalf("checked-out file missing: %v", err)
	}
	if got := gitOutput(t, path, "branch", "--show-current"); got != branch {
		t.Fatalf("checked-out branch = %q, want %q", got, branch)
	}

	if _, _, err := createTaskWorktree(context.Background(), repositoryRoot, "project-1", "task-1"); err == nil {
		t.Fatal("second worktree creation succeeded")
	}
}

func initTestGitRepository(t *testing.T) string {
	t.Helper()
	root := t.TempDir()
	gitOutput(t, root, "init")
	gitOutput(t, root, "config", "user.email", "tests@example.com")
	gitOutput(t, root, "config", "user.name", "Tests")
	if err := os.WriteFile(filepath.Join(root, "README.md"), []byte("initial\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	gitOutput(t, root, "add", "README.md")
	gitOutput(t, root, "commit", "-m", "initial")
	return root
}

func gitOutput(t *testing.T, root string, args ...string) string {
	t.Helper()
	command := exec.Command("git", append([]string{"-C", root}, args...)...)
	output, err := command.CombinedOutput()
	if err != nil {
		t.Fatalf("git %s: %v\n%s", strings.Join(args, " "), err, output)
	}
	return strings.TrimSpace(string(output))
}
