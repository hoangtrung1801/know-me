// Package storage — Manager provides thread-safe runtime project switching.
// It wraps a Store and a Registry, allowing workspace API handlers to swap
// the active project without restarting the server.
package storage

import (
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
