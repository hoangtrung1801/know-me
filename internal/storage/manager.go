// Package storage — Manager provides thread-safe runtime project switching.
// It wraps a Store and a Registry, allowing workspace API handlers to swap
// the active project without restarting the server.
package storage

import (
	"fmt"
	"path/filepath"
	"sync"

	"github.com/hoangtrung1801/known-me/internal/registry"
)

// Manager coordinates access to the active store and logical project registry.
type Manager struct {
	active *Store
	reg    *registry.Registry
	mu     sync.RWMutex
}

// NewManager creates a Manager with the given initial store and registry.
func NewManager(initialStore *Store, reg *registry.Registry) *Manager {
	return &Manager{
		active: initialStore,
		reg:    reg,
	}
}

// GetStore returns the currently active Store (read-locked).
func (m *Manager) GetStore() *Store {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.active
}

// GetRegistry returns the underlying project registry.
func (m *Manager) GetRegistry() *registry.Registry {
	return m.reg
}

// ProjectStore returns a store for a registered project, including its
// repository path when one has been associated with the project.
func (m *Manager) ProjectStore(projectID string) (*Store, error) {
	if m == nil || m.reg == nil {
		return nil, fmt.Errorf("project registry is unavailable")
	}
	project, ok := m.reg.Get(projectID)
	if !ok {
		return nil, fmt.Errorf("project %s not found", projectID)
	}
	if active := m.GetStore(); active != nil && active.ProjectID == projectID && active.ProjectRoot != "" {
		if project.Path == "" || repositoryPathsEqual(active.ProjectRoot, project.Path) {
			return active, nil
		}
	}
	root := GlobalRootPath()
	if active := m.GetStore(); active != nil && active.Root != "" {
		root = active.Root
	}
	return NewProjectStore(root, project.ID, project.Path), nil
}

func repositoryPathsEqual(left, right string) bool {
	leftCanonical, leftErr := filepath.EvalSymlinks(left)
	rightCanonical, rightErr := filepath.EvalSymlinks(right)
	if leftErr != nil || rightErr != nil {
		return filepath.Clean(left) == filepath.Clean(right)
	}
	return filepath.Clean(leftCanonical) == filepath.Clean(rightCanonical)
}

// ActiveProjectRoot returns the repository root for the currently active store.
// Returns empty string when no store is active.
func (m *Manager) ActiveProjectRoot() string {
	m.mu.RLock()
	defer m.mu.RUnlock()
	if m.active == nil {
		return ""
	}
	return m.active.RepositoryRoot()
}
