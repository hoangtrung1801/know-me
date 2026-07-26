package storage

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"

	"github.com/howznguyen/knowns/internal/models"
)

// WorkspaceStore reads and writes .knowns/workspaces.json.
type WorkspaceStore struct {
	root string
}

func (ws *WorkspaceStore) filePath() string {
	return filepath.Join(ws.root, "workspaces.json")
}

// List returns all workspaces.
func (ws *WorkspaceStore) List() ([]*models.Workspace, error) {
	data, err := os.ReadFile(ws.filePath())
	if os.IsNotExist(err) {
		return []*models.Workspace{}, nil
	}
	if err != nil {
		return nil, fmt.Errorf("read workspaces.json: %w", err)
	}
	var workspaces []*models.Workspace
	if err := json.Unmarshal(data, &workspaces); err != nil {
		return nil, fmt.Errorf("parse workspaces.json: %w", err)
	}
	if workspaces == nil {
		workspaces = []*models.Workspace{}
	}
	return workspaces, nil
}

// Get returns a single workspace by ID.
func (ws *WorkspaceStore) Get(id string) (*models.Workspace, error) {
	all, err := ws.List()
	if err != nil {
		return nil, err
	}
	for _, w := range all {
		if w.ID == id {
			return w, nil
		}
	}
	return nil, fmt.Errorf("workspace %q not found", id)
}

// Save creates or updates a workspace entry.
// If a workspace with the same ID already exists it is replaced; otherwise it
// is appended.
func (ws *WorkspaceStore) Save(workspace *models.Workspace) error {
	if workspace.ID == "" {
		return fmt.Errorf("workspace ID is required")
	}
	all, err := ws.List()
	if err != nil {
		return err
	}
	found := false
	for i, w := range all {
		if w.ID == workspace.ID {
			all[i] = workspace
			found = true
			break
		}
	}
	if !found {
		all = append(all, workspace)
	}
	return writeJSON(ws.filePath(), all)
}

// Delete removes a workspace by ID.
func (ws *WorkspaceStore) Delete(id string) error {
	all, err := ws.List()
	if err != nil {
		return err
	}
	filtered := make([]*models.Workspace, 0, len(all))
	found := false
	for _, w := range all {
		if w.ID == id {
			found = true
			continue
		}
		filtered = append(filtered, w)
	}
	if !found {
		return fmt.Errorf("workspace %q not found", id)
	}
	return writeJSON(ws.filePath(), filtered)
}

// MarkAllStopped sets all "running" workspaces to "stopped".
// Called on server restart for crash recovery.
func (ws *WorkspaceStore) MarkAllStopped() error {
	all, err := ws.List()
	if err != nil {
		return err
	}
	changed := false
	for _, w := range all {
		if w.Status == "running" {
			w.Status = "stopped"
			changed = true
		}
	}
	if !changed {
		return nil
	}
	return writeJSON(ws.filePath(), all)
}
