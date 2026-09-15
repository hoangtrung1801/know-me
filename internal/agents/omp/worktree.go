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
