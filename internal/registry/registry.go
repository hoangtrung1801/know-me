// Package registry manages a global project registry at ~/.knowns/registry.json.
// It tracks known Knowns projects with their paths, names, and last-used timestamps.
package registry

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"time"

	"github.com/howznguyen/knowns/internal/util"
)

// Project represents a registered Knowns project.
type Project struct {
	ID       string    `json:"id"`
	Name     string    `json:"name"`
	Path     string    `json:"path"`
	LastUsed time.Time `json:"lastUsed"`
}

// Registry manages the list of known projects.
type Registry struct {
	Projects []Project `json:"projects"`
	filePath string
}

// NewRegistry creates a Registry with the default path (~/.knowns/registry.json).
func NewRegistry() *Registry {
	home, _ := os.UserHomeDir()
	return &Registry{
		filePath: filepath.Join(home, ".knowns", "registry.json"),
	}
}

// NewRegistryWithPath creates a Registry with a custom file path (for testing).
func NewRegistryWithPath(path string) *Registry {
	return &Registry{filePath: path}
}

// Load reads the registry from disk. If the file doesn't exist, starts empty.
func (r *Registry) Load() error {
	data, err := os.ReadFile(r.filePath)
	if err != nil {
		if os.IsNotExist(err) {
			r.Projects = []Project{}
			return nil
		}
		return fmt.Errorf("read registry: %w", err)
	}
	if err := json.Unmarshal(data, &r.Projects); err != nil {
		return err
	}
	// Deduplicate by path (keep last occurrence so most recent wins)
	seen := make(map[string]int)
	deduped := r.Projects[:0]
	for _, p := range r.Projects {
		if idx, exists := seen[p.Path]; exists {
			deduped[idx] = p // overwrite with newer entry
		} else {
			seen[p.Path] = len(deduped)
			deduped = append(deduped, p)
		}
	}
	r.Projects = deduped
	return nil
}

// Save writes the registry to disk, creating parent directories if needed.
func (r *Registry) Save() error {
	if err := os.MkdirAll(filepath.Dir(r.filePath), 0755); err != nil {
		return fmt.Errorf("create registry dir: %w", err)
	}
	data, err := json.MarshalIndent(r.Projects, "", "  ")
	if err != nil {
		return fmt.Errorf("marshal registry: %w", err)
	}
	return os.WriteFile(r.filePath, data, 0644)
}

// Add registers a project. If the path is already registered, returns the
// existing entry without duplicating. The path must contain a .knowns/ directory.
func (r *Registry) Add(projectPath string) (*Project, error) {
	absPath, err := filepath.Abs(projectPath)
	if err != nil {
		return nil, fmt.Errorf("resolve path: %w", err)
	}

	// Check .knowns/ exists and has config.json (properly initialized project)
	knDir := filepath.Join(absPath, ".knowns")
	if info, err := os.Stat(knDir); err != nil || !info.IsDir() {
		return nil, fmt.Errorf("no .knowns/ directory found at %s", absPath)
	}
	if _, err := os.Stat(filepath.Join(knDir, "config.json")); err != nil {
		return nil, fmt.Errorf("no config.json found at %s — run 'knowns init' first", absPath)
	}

	// Dedup by path
	if existing := r.FindByPath(absPath); existing != nil {
		return existing, nil
	}

	p := Project{
		ID:       util.GenerateID(),
		Name:     filepath.Base(absPath),
		Path:     absPath,
		LastUsed: time.Now(),
	}
	r.Projects = append(r.Projects, p)
	return &p, r.Save()
}

// Remove deletes a project from the registry by ID.
func (r *Registry) Remove(id string) error {
	for i, p := range r.Projects {
		if p.ID == id {
			r.Projects = append(r.Projects[:i], r.Projects[i+1:]...)
			return r.Save()
		}
	}
	return fmt.Errorf("project %s not found", id)
}

// SetActive updates the LastUsed timestamp for the given project ID.
func (r *Registry) SetActive(id string) error {
	for i, p := range r.Projects {
		if p.ID == id {
			r.Projects[i].LastUsed = time.Now()
			return r.Save()
		}
	}
	return fmt.Errorf("project %s not found", id)
}

// GetActive returns the most recently used project, or nil if empty.
func (r *Registry) GetActive() *Project {
	if len(r.Projects) == 0 {
		return nil
	}
	best := &r.Projects[0]
	for i := 1; i < len(r.Projects); i++ {
		if r.Projects[i].LastUsed.After(best.LastUsed) {
			best = &r.Projects[i]
		}
	}
	return best
}

// FindByPath returns the project with the given absolute path, or nil.
func (r *Registry) FindByPath(absPath string) *Project {
	for i, p := range r.Projects {
		if p.Path == absPath {
			return &r.Projects[i]
		}
	}
	return nil
}

// Scan walks the given directories (depth 1) looking for subdirectories
// that contain a .knowns/ folder. Newly discovered projects are added to
// the registry. Returns the list of newly added projects.
func (r *Registry) Scan(dirs []string) ([]Project, error) {
	var added []Project
	for _, dir := range dirs {
		absDir, err := filepath.Abs(dir)
		if err != nil {
			continue
		}
		entries, err := os.ReadDir(absDir)
		if err != nil {
			continue
		}
		for _, entry := range entries {
			if !entry.IsDir() {
				continue
			}
			candidate := filepath.Join(absDir, entry.Name())
			knDir := filepath.Join(candidate, ".knowns")
			if info, err := os.Stat(knDir); err == nil && info.IsDir() {
				if _, cfgErr := os.Stat(filepath.Join(knDir, "config.json")); cfgErr != nil {
					continue // not a properly initialized project
				}
				if r.FindByPath(candidate) != nil {
					continue // already registered
				}
				p, err := r.Add(candidate)
				if err == nil && p != nil {
					added = append(added, *p)
				}
			}
		}
	}
	return added, nil
}
