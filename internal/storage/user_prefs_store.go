// Package storage — UserPrefsStore manages user-level preferences at ~/.known-me/preferences.json.
// These preferences apply across all projects and serve as defaults when
// a project does not define its own value.
package storage

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"

	"github.com/hoangtrung1801/known-me/internal/models"
	"github.com/hoangtrung1801/known-me/internal/paths"
)

// UserPrefs holds user-level preferences that apply across all projects.
type UserPrefs struct {
	OpenCodeModels *models.OpenCodeModelSettings `json:"opencodeModels,omitempty"`
}

// UserPrefsStore reads and writes ~/.known-me/preferences.json.
type UserPrefsStore struct {
	filePath string
}

// NewUserPrefsStore creates a store with the default path (~/.known-me/preferences.json).
func NewUserPrefsStore() *UserPrefsStore {
	return &UserPrefsStore{
		filePath: filepath.Join(paths.GlobalStoreRoot(), "preferences.json"),
	}
}

// NewUserPrefsStoreWithPath creates a store with a custom path (for testing).
func NewUserPrefsStoreWithPath(path string) *UserPrefsStore {
	return &UserPrefsStore{filePath: path}
}

// Load reads user preferences from disk. Returns empty prefs if file doesn't exist.
func (s *UserPrefsStore) Load() (*UserPrefs, error) {
	data, err := os.ReadFile(s.filePath)
	if err != nil {
		if os.IsNotExist(err) {
			return &UserPrefs{}, nil
		}
		return nil, fmt.Errorf("read user prefs: %w", err)
	}
	var prefs UserPrefs
	if err := json.Unmarshal(data, &prefs); err != nil {
		return nil, fmt.Errorf("parse user prefs: %w", err)
	}
	return &prefs, nil
}

// Save writes user preferences to disk, creating parent directories if needed.
func (s *UserPrefsStore) Save(prefs *UserPrefs) error {
	if err := os.MkdirAll(filepath.Dir(s.filePath), 0755); err != nil {
		return fmt.Errorf("create prefs dir: %w", err)
	}
	data, err := json.MarshalIndent(prefs, "", "  ")
	if err != nil {
		return fmt.Errorf("marshal user prefs: %w", err)
	}
	return os.WriteFile(s.filePath, data, 0644)
}
