package registry

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/hoangtrung1801/known-me/internal/util"
)

const (
	registryLockTimeout  = 5 * time.Second
	registryStaleLockAge = 30 * time.Second
)

var registryProcessMu sync.Mutex

type Project struct {
	ID       string    `json:"id"`
	Name     string    `json:"name"`
	Path     string    `json:"path,omitempty"`
	LastUsed time.Time `json:"lastUsed"`
}

type Registry struct {
	Projects []Project `json:"projects"`
	filePath string
}

func NewRegistry() *Registry {
	home, _ := os.UserHomeDir()
	return &Registry{filePath: filepath.Join(home, ".knowns", "registry.json")}
}
func NewRegistryWithPath(path string) *Registry { return &Registry{filePath: path} }

func (r *Registry) Load() error {
	return r.withWriteLock(func() error {
		if err := r.loadUnlocked(); err != nil {
			if os.IsNotExist(err) {
				r.Projects = []Project{}
				return nil
			}
			return fmt.Errorf("read registry: %w", err)
		}
		return r.saveUnlocked()
	})
}

func (r *Registry) loadUnlocked() error {
	data, err := os.ReadFile(r.filePath)
	if err != nil {
		return err
	}
	var raw []struct {
		ID       string    `json:"id"`
		Name     string    `json:"name"`
		Path     string    `json:"path"`
		LastUsed time.Time `json:"lastUsed"`
	}
	if err := json.Unmarshal(data, &raw); err != nil {
		return err
	}
	r.Projects = make([]Project, 0, len(raw))
	for _, p := range raw {
		r.Projects = append(r.Projects, Project{ID: p.ID, Name: p.Name, Path: normalizeStoredPath(p.Path), LastUsed: p.LastUsed})
	}
	return nil
}

func (r *Registry) Save() error {
	return r.withWriteLock(r.saveUnlocked)
}

func (r *Registry) saveUnlocked() error {
	if err := os.MkdirAll(filepath.Dir(r.filePath), 0755); err != nil {
		return err
	}
	data, err := json.MarshalIndent(r.Projects, "", "  ")
	if err != nil {
		return err
	}
	tmp, err := os.CreateTemp(filepath.Dir(r.filePath), filepath.Base(r.filePath)+".tmp-")
	if err != nil {
		return err
	}
	tmpPath := tmp.Name()
	defer os.Remove(tmpPath)
	if err := tmp.Chmod(0644); err != nil {
		_ = tmp.Close()
		return err
	}
	if _, err := tmp.Write(append(data, '\n')); err != nil {
		_ = tmp.Close()
		return err
	}
	if err := tmp.Close(); err != nil {
		return err
	}
	return os.Rename(tmpPath, r.filePath)
}
func (r *Registry) Create(name string) (*Project, error) {
	name = strings.TrimSpace(name)
	if name == "" {
		return nil, fmt.Errorf("project name is required")
	}
	var created Project
	err := r.withWriteLock(func() error {
		if err := r.refreshForMutationUnlocked(); err != nil {
			return err
		}
		created = Project{ID: util.GenerateID(), Name: name, LastUsed: time.Now()}
		r.Projects = append(r.Projects, created)
		return r.saveUnlocked()
	})
	if err != nil {
		return nil, err
	}
	return &created, nil
}

// Get returns the registered project with id, if present.
func (r *Registry) Get(id string) (*Project, bool) {
	registryProcessMu.Lock()
	defer registryProcessMu.Unlock()
	return r.getUnlocked(id)
}

func (r *Registry) getUnlocked(id string) (*Project, bool) {
	for i := range r.Projects {
		if r.Projects[i].ID == id {
			project := r.Projects[i]
			return &project, true
		}
	}
	return nil, false
}

// List returns a snapshot of all registered projects.
func (r *Registry) List() []Project {
	registryProcessMu.Lock()
	defer registryProcessMu.Unlock()
	return append([]Project(nil), r.Projects...)
}

// SetPath records the canonical repository path for a project.
func (r *Registry) SetPath(id, path string) error {
	canonical, err := canonicalProjectPath(path)
	if err != nil {
		return err
	}
	return r.withWriteLock(func() error {
		if err := r.refreshForMutationUnlocked(); err != nil {
			return err
		}
		project, ok := r.getUnlocked(id)
		if !ok {
			return fmt.Errorf("project %s not found", id)
		}
		project.Path = canonical
		for i := range r.Projects {
			if r.Projects[i].ID == id {
				r.Projects[i].Path = canonical
				break
			}
		}
		return r.saveUnlocked()
	})
}
func (r *Registry) Remove(id string) error {
	return r.withWriteLock(func() error {
		if err := r.refreshForMutationUnlocked(); err != nil {
			return err
		}
		for i, p := range r.Projects {
			if p.ID == id {
				r.Projects = append(r.Projects[:i], r.Projects[i+1:]...)
				return r.saveUnlocked()
			}
		}
		return fmt.Errorf("project %s not found", id)
	})
}
func (r *Registry) SetActive(id string) error {
	return r.withWriteLock(func() error {
		if err := r.refreshForMutationUnlocked(); err != nil {
			return err
		}
		for i := range r.Projects {
			if r.Projects[i].ID == id {
				r.Projects[i].LastUsed = time.Now()
				return r.saveUnlocked()
			}
		}
		return fmt.Errorf("project %s not found", id)
	})
}
func (r *Registry) GetActive() *Project {
	registryProcessMu.Lock()
	defer registryProcessMu.Unlock()
	return r.getActiveUnlocked()
}

func (r *Registry) getActiveUnlocked() *Project {
	if len(r.Projects) == 0 {
		return nil
	}
	best := r.Projects[0]
	for i := 1; i < len(r.Projects); i++ {
		if r.Projects[i].LastUsed.After(best.LastUsed) {
			best = r.Projects[i]
		}
	}
	return &best
}

func (r *Registry) refreshForMutationUnlocked() error {
	if err := r.loadUnlocked(); err != nil && !os.IsNotExist(err) {
		return fmt.Errorf("read registry: %w", err)
	}
	return nil
}

func (r *Registry) withWriteLock(fn func() error) error {
	registryProcessMu.Lock()
	defer registryProcessMu.Unlock()

	if err := os.MkdirAll(filepath.Dir(r.filePath), 0755); err != nil {
		return err
	}
	lockPath := r.filePath + ".lock"
	deadline := time.Now().Add(registryLockTimeout)
	for {
		lock, err := os.OpenFile(lockPath, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0600)
		if err == nil {
			_, _ = lock.WriteString(fmt.Sprintf("%d\n", os.Getpid()))
			_ = lock.Close()
			defer os.Remove(lockPath)
			return fn()
		}
		if !errors.Is(err, os.ErrExist) {
			return err
		}
		if info, statErr := os.Stat(lockPath); statErr == nil && time.Since(info.ModTime()) > registryStaleLockAge {
			_ = os.Remove(lockPath)
			continue
		}
		if time.Now().After(deadline) {
			return fmt.Errorf("timed out waiting for registry lock %s", lockPath)
		}
		time.Sleep(25 * time.Millisecond)
	}
}

func canonicalProjectPath(path string) (string, error) {
	path = strings.TrimSpace(path)
	if path == "" {
		return "", fmt.Errorf("project path is required")
	}
	absolute, err := filepath.Abs(path)
	if err != nil {
		return "", fmt.Errorf("resolve project path: %w", err)
	}
	resolved, err := filepath.EvalSymlinks(absolute)
	if err != nil {
		return "", fmt.Errorf("resolve project path: %w", err)
	}
	info, err := os.Stat(resolved)
	if err != nil {
		return "", fmt.Errorf("inspect project path: %w", err)
	}
	if !info.IsDir() {
		return "", fmt.Errorf("project path is not a directory: %s", resolved)
	}
	return filepath.Clean(resolved), nil
}

func normalizeStoredPath(path string) string {
	if strings.TrimSpace(path) == "" {
		return ""
	}
	canonical, err := canonicalProjectPath(path)
	if err != nil {
		return ""
	}
	return canonical
}
