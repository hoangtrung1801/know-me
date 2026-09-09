package codex

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
	"github.com/hoangtrung1801/know-me/internal/storage"
)

func createTaskWorktree(ctx context.Context, repositoryRoot, projectID, taskID string) (string, string, error) {
	if repositoryRoot == "" || projectID == "" || taskID == "" {
		return "", "", errors.New("repository root, project ID, and task ID are required")
	}
	path := taskWorktreePath(projectID, taskID)
	if _, err := os.Stat(path); err == nil {
		return "", "", fmt.Errorf("task worktree already exists: %s", path)
	} else if !errors.Is(err, os.ErrNotExist) {
		return "", "", fmt.Errorf("inspect task worktree: %w", err)
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return "", "", fmt.Errorf("create task worktree directory: %w", err)
	}
	branch := taskWorktreeBranch(projectID, taskID)
	command := exec.CommandContext(ctx, "git", "-C", repositoryRoot, "worktree", "add", "-b", branch, path, "HEAD")
	output, err := command.CombinedOutput()
	if err != nil {
		return "", "", fmt.Errorf("create Git worktree: %w: %s", err, strings.TrimSpace(string(output)))
	}
	return path, branch, nil
}

func taskWorktreePath(projectID, taskID string) string {
	return filepath.Join(storage.GlobalRootPath(), "worktrees", worktreeSegment(projectID), worktreeSegment(taskID))
}

func taskWorktreeBranch(projectID, taskID string) string {
	return "knowns/" + worktreeSegment(projectID) + "/" + worktreeSegment(taskID)
}

func worktreeSegment(value string) string {
	var builder strings.Builder
	for _, r := range value {
		if unicode.IsLetter(r) || unicode.IsNumber(r) || r == '.' || r == '_' || r == '-' {
			builder.WriteRune(r)
		} else {
			builder.WriteByte('-')
		}
	}
	if builder.Len() == 0 {
		return "unknown"
	}
	return builder.String()
}

func executionRoot(store *storage.Store, workflow *models.AgentWorkflow) (string, error) {
	if store == nil {
		return "", errors.New("agent store is unavailable")
	}
	if workflow != nil && workflow.WorktreePath != "" {
		info, err := os.Stat(workflow.WorktreePath)
		if err != nil {
			return "", fmt.Errorf("task worktree is unavailable: %w", err)
		}
		if !info.IsDir() {
			return "", fmt.Errorf("task worktree is not a directory: %s", workflow.WorktreePath)
		}
		return workflow.WorktreePath, nil
	}
	root := store.RepositoryRoot()
	if root == "" {
		return "", errors.New("project repository root is unavailable")
	}
	return root, nil
}
