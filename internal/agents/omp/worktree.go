package omp

import (
	"context"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"unicode"

	"github.com/hoangtrung1801/know-me/internal/models"
	"github.com/hoangtrung1801/know-me/internal/registry"
	"github.com/hoangtrung1801/know-me/internal/storage"
)

// CreateTaskWorktree creates an isolated git worktree and branch for a task.
func CreateTaskWorktree(ctx context.Context, repositoryRoot, projectID, taskID string) (string, string, error) {
	if repositoryRoot == "" || projectID == "" || taskID == "" {
		return "", "", errors.New("repository root, project ID, and task ID are required")
	}
	path := TaskWorktreePath(projectID, taskID)
	if _, err := os.Stat(path); err == nil {
		return "", "", fmt.Errorf("task worktree already exists: %s", path)
	} else if !errors.Is(err, os.ErrNotExist) {
		return "", "", fmt.Errorf("inspect task worktree: %w", err)
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return "", "", fmt.Errorf("create task worktree directory: %w", err)
	}
	branch := TaskWorktreeBranch(projectID, taskID)
	command := exec.CommandContext(ctx, "git", "-C", repositoryRoot, "worktree", "add", "-b", branch, path, "HEAD")
	output, err := command.CombinedOutput()
	if err != nil {
		return "", "", fmt.Errorf("create Git worktree: %w: %s", err, strings.TrimSpace(string(output)))
	}
	return path, branch, nil
}

// IsGitRepository returns true if the path is inside a Git repository work tree.
func IsGitRepository(ctx context.Context, path string) bool {
	if path == "" {
		return false
	}
	cmd := exec.CommandContext(ctx, "git", "-C", path, "rev-parse", "--is-inside-work-tree")
	out, err := cmd.CombinedOutput()
	return err == nil && strings.TrimSpace(string(out)) == "true"
}

// EnsureTaskWorktree returns an existing isolated git worktree if valid, or creates one for the task.
func EnsureTaskWorktree(ctx context.Context, repositoryRoot, projectID, taskID string) (string, string, error) {
	if repositoryRoot == "" || projectID == "" || taskID == "" {
		return "", "", errors.New("repository root, project ID, and task ID are required")
	}
	path := TaskWorktreePath(projectID, taskID)
	branch := TaskWorktreeBranch(projectID, taskID)

	if stat, err := os.Stat(path); err == nil && stat.IsDir() {
		checkCmd := exec.CommandContext(ctx, "git", "-C", path, "rev-parse", "--is-inside-work-tree")
		if out, checkErr := checkCmd.CombinedOutput(); checkErr == nil && strings.TrimSpace(string(out)) == "true" {
			return path, branch, nil
		}
		// Stale or broken directory: clean it up
		_ = os.RemoveAll(path)
		_ = exec.CommandContext(ctx, "git", "-C", repositoryRoot, "worktree", "prune").Run()
	}

	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return "", "", fmt.Errorf("create task worktree directory: %w", err)
	}

	// Check if branch already exists in the repository
	branchCheck := exec.CommandContext(ctx, "git", "-C", repositoryRoot, "rev-parse", "--verify", "--quiet", "refs/heads/"+branch)
	if branchCheck.Run() == nil {
		cmd := exec.CommandContext(ctx, "git", "-C", repositoryRoot, "worktree", "add", path, branch)
		if output, err := cmd.CombinedOutput(); err != nil {
			return "", "", fmt.Errorf("add existing Git worktree branch: %w: %s", err, strings.TrimSpace(string(output)))
		}
		return path, branch, nil
	}

	command := exec.CommandContext(ctx, "git", "-C", repositoryRoot, "worktree", "add", "-b", branch, path, "HEAD")
	output, err := command.CombinedOutput()
	if err != nil {
		return "", "", fmt.Errorf("create Git worktree: %w: %s", err, strings.TrimSpace(string(output)))
	}
	return path, branch, nil
}

// CommitTaskWorktree stages and commits all changes inside the task worktree.
// If there are no staged changes, it returns the current HEAD commit hash without error.
func CommitTaskWorktree(ctx context.Context, worktreePath, message string) (string, error) {
	if worktreePath == "" {
		return "", errors.New("worktree path is required")
	}
	if strings.TrimSpace(message) == "" {
		message = "Update task implementation"
	}

	addCmd := exec.CommandContext(ctx, "git", "-C", worktreePath, "add", "-A")
	if out, err := addCmd.CombinedOutput(); err != nil {
		return "", fmt.Errorf("git add failed: %w: %s", err, strings.TrimSpace(string(out)))
	}

	diffCmd := exec.CommandContext(ctx, "git", "-C", worktreePath, "diff", "--cached", "--quiet")
	if diffCmd.Run() == nil {
		revCmd := exec.CommandContext(ctx, "git", "-C", worktreePath, "rev-parse", "--short", "HEAD")
		out, err := revCmd.CombinedOutput()
		if err != nil {
			return "", fmt.Errorf("rev-parse failed: %w", err)
		}
		return strings.TrimSpace(string(out)), nil
	}

	commitCmd := exec.CommandContext(ctx, "git", "-C", worktreePath, "commit", "-m", message)
	if out, err := commitCmd.CombinedOutput(); err != nil {
		return "", fmt.Errorf("git commit failed: %w: %s", err, strings.TrimSpace(string(out)))
	}

	revCmd := exec.CommandContext(ctx, "git", "-C", worktreePath, "rev-parse", "--short", "HEAD")
	out, err := revCmd.CombinedOutput()
	if err != nil {
		return "", fmt.Errorf("rev-parse failed: %w", err)
	}
	return strings.TrimSpace(string(out)), nil
}

// MergeTaskWorktree merges the worktree branch into the base repository branch,
// removes the worktree, and cleans up the branch.
func MergeTaskWorktree(ctx context.Context, repositoryRoot, worktreePath, worktreeBranch string) (string, error) {
	if repositoryRoot == "" {
		return "", errors.New("repository root is required")
	}
	if worktreeBranch == "" {
		return "", errors.New("worktree branch is required")
	}

	branchCmd := exec.CommandContext(ctx, "git", "-C", repositoryRoot, "rev-parse", "--abbrev-ref", "HEAD")
	out, err := branchCmd.CombinedOutput()
	targetBranch := strings.TrimSpace(string(out))
	if err != nil || targetBranch == "" || targetBranch == "HEAD" {
		targetBranch = "main"
	}

	statusCmd := exec.CommandContext(ctx, "git", "-C", repositoryRoot, "status", "--porcelain")
	statusOut, err := statusCmd.CombinedOutput()
	if err != nil {
		return "", fmt.Errorf("inspect base repository status: %w: %s", err, strings.TrimSpace(string(statusOut)))
	}
	if strings.TrimSpace(string(statusOut)) != "" {
		return "", errors.New("cannot merge: base repository has uncommitted changes; please stash or commit first")
	}

	mergeMsg := fmt.Sprintf("Merge branch '%s'", worktreeBranch)
	mergeCmd := exec.CommandContext(ctx, "git", "-C", repositoryRoot, "merge", "--no-ff", worktreeBranch, "-m", mergeMsg)
	if mergeOut, err := mergeCmd.CombinedOutput(); err != nil {
		_ = exec.CommandContext(ctx, "git", "-C", repositoryRoot, "merge", "--abort").Run()
		return "", fmt.Errorf("git merge conflict or error: %w: %s", err, strings.TrimSpace(string(mergeOut)))
	}

	revCmd := exec.CommandContext(ctx, "git", "-C", repositoryRoot, "rev-parse", "--short", "HEAD")
	revOut, err := revCmd.CombinedOutput()
	if err != nil {
		return "", fmt.Errorf("rev-parse merge commit failed: %w", err)
	}
	commitHash := strings.TrimSpace(string(revOut))

	if worktreePath != "" {
		_ = exec.CommandContext(ctx, "git", "-C", repositoryRoot, "worktree", "remove", worktreePath, "--force").Run()
		_ = os.RemoveAll(worktreePath)
		_ = exec.CommandContext(ctx, "git", "-C", repositoryRoot, "worktree", "prune").Run()
	}
	_ = exec.CommandContext(ctx, "git", "-C", repositoryRoot, "branch", "-d", worktreeBranch).Run()

	return commitHash, nil
}

// TaskWorktreePath returns the filesystem path for a task's isolated worktree.
func TaskWorktreePath(projectID, taskID string) string {
	return filepath.Join(storage.GlobalRootPath(), "worktrees", WorktreeSegment(projectID), WorktreeSegment(taskID))
}

// TaskWorktreeBranch returns the Git branch name for a task worktree.
func TaskWorktreeBranch(projectID, taskID string) string {
	return "knowme/" + WorktreeSegment(projectID) + "/" + WorktreeSegment(taskID)
}

// WorktreeSegment sanitizes raw IDs for safe use in file paths and git refs.
func WorktreeSegment(value string) string {
	var builder strings.Builder
	for _, r := range value {
		if unicode.IsLetter(r) || unicode.IsNumber(r) || r == '.' || r == '_' || r == '-' {
			builder.WriteRune(r)
		} else {
			builder.WriteByte('-')
		}
	}
	s := builder.String()
	for strings.Contains(s, "..") {
		s = strings.ReplaceAll(s, "..", "--")
	}
	if len(s) == 0 {
		return "unknown"
	}
	return s
}

// ResolveExecutionRoot delegates to storage.ExecutionRoot with per-project workspace resolution.
func ResolveExecutionRoot(store *storage.Store, reg *registry.Registry, workflow *models.AgentWorkflow) (string, error) {
	return storage.ExecutionRoot(store, reg, workflow)
}
