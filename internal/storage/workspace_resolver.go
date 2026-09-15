package storage

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/hoangtrung1801/know-me/internal/models"
	"github.com/hoangtrung1801/know-me/internal/registry"
)

// ResolveProjectWorkspace resolves the execution workspace directory for a project
// based on explicit settings, repository root, or global registry mapping.
func ResolveProjectWorkspace(store *Store, reg *registry.Registry) (string, error) {
	if store == nil {
		return "", errors.New("store is required")
	}

	// 1. Explicit project setting
	if store.Config != nil {
		cfg, err := store.Config.Load()
		if err != nil && !errors.Is(err, os.ErrNotExist) {
			return "", fmt.Errorf("read project configuration: %w", err)
		}
		if err == nil && strings.TrimSpace(cfg.Settings.WorkspacePath) != "" {
			rawPath := strings.TrimSpace(cfg.Settings.WorkspacePath)
			if strings.HasPrefix(rawPath, "~/") || rawPath == "~" {
				if home, err := os.UserHomeDir(); err == nil {
					if rawPath == "~" {
						rawPath = home
					} else {
						rawPath = filepath.Join(home, strings.TrimPrefix(rawPath, "~/"))
					}
				}
			}
			if !filepath.IsAbs(rawPath) && store.RepositoryRoot() != "" {
				rawPath = filepath.Join(store.RepositoryRoot(), rawPath)
			}
			cleaned := filepath.Clean(rawPath)
			canonical, err := filepath.EvalSymlinks(cleaned)
			if err != nil {
				canonical = cleaned
			}
			info, err := os.Stat(canonical)
			if err != nil {
				return "", fmt.Errorf("configured workspacePath does not exist: %s", cleaned)
			}
			if !info.IsDir() {
				return "", fmt.Errorf("configured workspacePath is not a directory: %s", cleaned)
			}
			return canonical, nil
		}
	}

	// 2. Active store repository root
	if root := store.RepositoryRoot(); root != "" {
		cleaned := filepath.Clean(root)
		canonical, err := filepath.EvalSymlinks(cleaned)
		if err != nil {
			canonical = cleaned
		}
		if info, err := os.Stat(canonical); err == nil && info.IsDir() {
			return canonical, nil
		}
	}

	// 3. Fallback to global registry by project ID
	if reg != nil && store.ProjectID != "" {
		if proj, ok := reg.Get(store.ProjectID); ok && strings.TrimSpace(proj.Path) != "" {
			cleaned := filepath.Clean(proj.Path)
			canonical, err := filepath.EvalSymlinks(cleaned)
			if err != nil {
				canonical = cleaned
			}
			if info, err := os.Stat(canonical); err == nil && info.IsDir() {
				return canonical, nil
			}
		}
	}

	return "", errors.New("no valid local project workspace directory found; configure workspacePath in project settings")
}

// ExecutionRoot returns the active worktree directory if present, or resolves
// the project workspace directory.
func ExecutionRoot(store *Store, reg *registry.Registry, workflow *models.AgentWorkflow) (string, error) {
	if workflow != nil && workflow.WorktreePath != "" {
		cleaned := filepath.Clean(workflow.WorktreePath)
		canonical, err := filepath.EvalSymlinks(cleaned)
		if err != nil {
			canonical = cleaned
		}
		info, err := os.Stat(canonical)
		if err != nil || !info.IsDir() {
			return "", fmt.Errorf("task worktree is unavailable: %s", workflow.WorktreePath)
		}
		return canonical, nil
	}
	return ResolveProjectWorkspace(store, reg)
}
