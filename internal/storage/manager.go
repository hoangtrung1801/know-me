// Package storage — Manager provides thread-safe runtime project switching.
// It wraps a Store and a Registry, allowing workspace API handlers to swap
// the active project without restarting the server.
package storage

import (
	"fmt"
	"os"
	"path/filepath"
	"sync"

	"github.com/howznguyen/knowns/internal/registry"
)

// Manager coordinates runtime project switching. All route handlers call
// GetStore() to obtain the currently active Store.
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

// Switch changes the active project to the one at projectPath.
// It validates that the project directory exists, creates a new Store,
// and updates the registry's active project.
func (m *Manager) Switch(projectPath string) (*Store, error) {
	absPath, err := filepath.Abs(projectPath)
	if err != nil {
		return nil, fmt.Errorf("resolve path: %w", err)
	}

	if info, err := os.Stat(absPath); err != nil || !info.IsDir() {
		return nil, fmt.Errorf("project directory not found at %s", absPath)
	}

	// Update registry: add if new, then set active.
	var projectID string
	if m.reg != nil {
		p, err := m.reg.Add(absPath)
		if err != nil {
			return nil, err
		}
		if p != nil {
			projectID = p.ID
			_ = m.reg.SetActive(p.ID)
		}
	}
	newStore := NewProjectStore(GlobalRootPath(), projectID, absPath)

	m.mu.Lock()
	m.active = newStore
	m.mu.Unlock()

	return newStore, nil
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
