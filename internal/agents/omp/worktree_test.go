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

func TestEnsureTaskWorktree(t *testing.T) {
	t.Setenv("HOME", t.TempDir())
	repoRoot := initGitRepo(t)

	// 1. Initial creation
	path1, branch1, err := EnsureTaskWorktree(context.Background(), repoRoot, "project-1", "task-1")
	if err != nil {
		t.Fatalf("EnsureTaskWorktree failed: %v", err)
	}
	if branch1 != "knowme/project-1/task-1" {
		t.Fatalf("branch = %q, want knowme/project-1/task-1", branch1)
	}
	if _, err := os.Stat(filepath.Join(path1, ".git")); err != nil {
		t.Fatalf("worktree .git missing: %v", err)
	}

	// 2. Idempotent reuse: second call should succeed and return the same path
	path2, branch2, err := EnsureTaskWorktree(context.Background(), repoRoot, "project-1", "task-1")
	if err != nil {
		t.Fatalf("EnsureTaskWorktree second call failed: %v", err)
	}
	if path1 != path2 || branch1 != branch2 {
		t.Fatalf("got (%q, %q), want (%q, %q)", path2, branch2, path1, branch1)
	}

	// 3. If worktree directory is deleted but branch remains in git, EnsureTaskWorktree recreates worktree
	gitCmd(t, repoRoot, "worktree", "remove", path1, "--force")
	path3, branch3, err := EnsureTaskWorktree(context.Background(), repoRoot, "project-1", "task-1")
	if err != nil {
		t.Fatalf("EnsureTaskWorktree recreation failed: %v", err)
	}
	if path3 != path1 || branch3 != branch1 {
		t.Fatalf("got (%q, %q), want (%q, %q)", path3, branch3, path1, branch1)
	}
}

func TestCommitTaskWorktree(t *testing.T) {
	t.Setenv("HOME", t.TempDir())
	repoRoot := initGitRepo(t)

	path, _, err := EnsureTaskWorktree(context.Background(), repoRoot, "project-1", "task-1")
	if err != nil {
		t.Fatalf("EnsureTaskWorktree failed: %v", err)
	}

	// 1. No changes -> returns current HEAD hash without error
	hash1, err := CommitTaskWorktree(context.Background(), path, "no changes")
	if err != nil {
		t.Fatalf("CommitTaskWorktree empty commit failed: %v", err)
	}
	if hash1 == "" {
		t.Fatal("expected non-empty commit hash")
	}

	// 2. Add changes in worktree
	newFile := filepath.Join(path, "feature.txt")
	if err := os.WriteFile(newFile, []byte("feature content\n"), 0o644); err != nil {
		t.Fatal(err)
	}

	hash2, err := CommitTaskWorktree(context.Background(), path, "feat(task-1): add feature")
	if err != nil {
		t.Fatalf("CommitTaskWorktree failed: %v", err)
	}
	if hash2 == "" || hash2 == hash1 {
		t.Fatalf("expected new commit hash, got %q (hash1=%q)", hash2, hash1)
	}

	// Verify worktree is clean
	statusCmd := exec.Command("git", "-C", path, "status", "--porcelain")
	out, err := statusCmd.CombinedOutput()
	if err != nil || strings.TrimSpace(string(out)) != "" {
		t.Fatalf("expected clean worktree after commit, got %s", string(out))
	}
}

func TestMergeTaskWorktree(t *testing.T) {
	t.Setenv("HOME", t.TempDir())
	repoRoot := initGitRepo(t)

	path, branch, err := EnsureTaskWorktree(context.Background(), repoRoot, "project-1", "task-1")
	if err != nil {
		t.Fatalf("EnsureTaskWorktree failed: %v", err)
	}

	// Make change in worktree
	testFile := filepath.Join(path, "feature.txt")
	if err := os.WriteFile(testFile, []byte("merged feature\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	commitHash, err := CommitTaskWorktree(context.Background(), path, "feat: add feature")
	if err != nil {
		t.Fatalf("CommitTaskWorktree failed: %v", err)
	}
	if commitHash == "" {
		t.Fatal("expected non-empty commit hash")
	}

	// Merge into base repository
	mergeHash, err := MergeTaskWorktree(context.Background(), repoRoot, path, branch)
	if err != nil {
		t.Fatalf("MergeTaskWorktree failed: %v", err)
	}
	if mergeHash == "" {
		t.Fatal("expected non-empty merge commit hash")
	}

	// Verify merged file exists in base repo
	mergedContent, err := os.ReadFile(filepath.Join(repoRoot, "feature.txt"))
	if err != nil {
		t.Fatalf("expected feature.txt in repo root: %v", err)
	}
	if string(mergedContent) != "merged feature\n" {
		t.Fatalf("got content %q, want 'merged feature\\n'", string(mergedContent))
	}

	// Verify worktree directory is cleaned up
	if _, err := os.Stat(path); !os.IsNotExist(err) {
		t.Fatalf("expected worktree path to be removed, but stat returned: %v", err)
	}

	// Verify branch was deleted
	branchCheck := exec.Command("git", "-C", repoRoot, "rev-parse", "--verify", "--quiet", "refs/heads/"+branch)
	if branchCheck.Run() == nil {
		t.Fatalf("expected branch %q to be deleted", branch)
	}
}

func TestMergeTaskWorktreeRejectsDirtyBase(t *testing.T) {
	t.Setenv("HOME", t.TempDir())
	repoRoot := initGitRepo(t)

	path, branch, err := EnsureTaskWorktree(context.Background(), repoRoot, "project-1", "task-1")
	if err != nil {
		t.Fatalf("EnsureTaskWorktree failed: %v", err)
	}

	// Dirty the base repo with an uncommitted change
	dirtyFile := filepath.Join(repoRoot, "dirty.txt")
	if err := os.WriteFile(dirtyFile, []byte("uncommitted\n"), 0o644); err != nil {
		t.Fatal(err)
	}

	_, err = MergeTaskWorktree(context.Background(), repoRoot, path, branch)
	if err == nil {
		t.Fatal("expected merge to be rejected due to dirty base repo, got nil")
	}
	if !strings.Contains(err.Error(), "base repository has uncommitted changes") {
		t.Fatalf("unexpected error message: %v", err)
	}
}

func TestMergeTaskWorktreeConflictAbort(t *testing.T) {
	t.Setenv("HOME", t.TempDir())
	repoRoot := initGitRepo(t)

	path, branch, err := EnsureTaskWorktree(context.Background(), repoRoot, "project-1", "task-1")
	if err != nil {
		t.Fatalf("EnsureTaskWorktree failed: %v", err)
	}

	// Modify README.md in worktree
	if err := os.WriteFile(filepath.Join(path, "README.md"), []byte("# Conflict from worktree\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	_, err = CommitTaskWorktree(context.Background(), path, "conflict worktree")
	if err != nil {
		t.Fatal(err)
	}

	// Modify README.md in base repo with conflicting change
	if err := os.WriteFile(filepath.Join(repoRoot, "README.md"), []byte("# Conflict from base\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	gitCmd(t, repoRoot, "add", "README.md")
	gitCmd(t, repoRoot, "commit", "-m", "conflict base")

	// Merge should fail with conflict
	_, err = MergeTaskWorktree(context.Background(), repoRoot, path, branch)
	if err == nil {
		t.Fatal("expected merge conflict, got nil")
	}

	// Base repo should be clean because merge was aborted
	statusCmd := exec.Command("git", "-C", repoRoot, "status", "--porcelain")
	out, err := statusCmd.CombinedOutput()
	if err != nil || strings.TrimSpace(string(out)) != "" {
		t.Fatalf("expected clean base repo after abort, got status: %s", string(out))
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
