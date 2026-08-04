package registry

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/hoangtrung1801/known-me/internal/util"
)

type Project struct {
	ID       string    `json:"id"`
	Name     string    `json:"name"`
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
	data, err := os.ReadFile(r.filePath)
	if err != nil {
		if os.IsNotExist(err) {
			r.Projects = []Project{}
			return nil
		}
		return fmt.Errorf("read registry: %w", err)
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
		r.Projects = append(r.Projects, Project{ID: p.ID, Name: p.Name, LastUsed: p.LastUsed})
	}
	return r.Save()
}

func (r *Registry) Save() error {
	if err := os.MkdirAll(filepath.Dir(r.filePath), 0755); err != nil {
		return err
	}
	data, err := json.MarshalIndent(r.Projects, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(r.filePath, data, 0644)
}
func (r *Registry) Create(name string) (*Project, error) {
	name = strings.TrimSpace(name)
	if name == "" {
		return nil, fmt.Errorf("project name is required")
	}
	p := Project{ID: util.GenerateID(), Name: name, LastUsed: time.Now()}
	r.Projects = append(r.Projects, p)
	return &p, r.Save()
}
func (r *Registry) Remove(id string) error {
	for i, p := range r.Projects {
		if p.ID == id {
			r.Projects = append(r.Projects[:i], r.Projects[i+1:]...)
			return r.Save()
		}
	}
	return fmt.Errorf("project %s not found", id)
}
func (r *Registry) SetActive(id string) error {
	for i := range r.Projects {
		if r.Projects[i].ID == id {
			r.Projects[i].LastUsed = time.Now()
			return r.Save()
		}
	}
	return fmt.Errorf("project %s not found", id)
}
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
