package storage

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"

	"github.com/howznguyen/knowns/internal/models"
)

// ChatStore reads and writes .knowns/chats.json.
type ChatStore struct {
	root string
}

func (cs *ChatStore) filePath() string {
	return filepath.Join(cs.root, "chats.json")
}

// List returns all chat sessions.
func (cs *ChatStore) List() ([]*models.ChatSession, error) {
	data, err := os.ReadFile(cs.filePath())
	if os.IsNotExist(err) {
		return []*models.ChatSession{}, nil
	}
	if err != nil {
		return nil, fmt.Errorf("read chats.json: %w", err)
	}
	var sessions []*models.ChatSession
	if err := json.Unmarshal(data, &sessions); err != nil {
		return nil, fmt.Errorf("parse chats.json: %w", err)
	}
	if sessions == nil {
		sessions = []*models.ChatSession{}
	}
	return sessions, nil
}

// Get returns a single chat session by ID.
func (cs *ChatStore) Get(id string) (*models.ChatSession, error) {
	all, err := cs.List()
	if err != nil {
		return nil, err
	}
	for _, s := range all {
		if s.ID == id {
			return s, nil
		}
	}
	return nil, fmt.Errorf("chat session %q not found", id)
}

// Save creates or updates a chat session.
func (cs *ChatStore) Save(session *models.ChatSession) error {
	if session.ID == "" {
		return fmt.Errorf("chat session ID is required")
	}
	all, err := cs.List()
	if err != nil {
		return err
	}
	found := false
	for i, s := range all {
		if s.ID == session.ID {
			all[i] = session
			found = true
			break
		}
	}
	if !found {
		all = append(all, session)
	}
	return writeJSON(cs.filePath(), all)
}

// Delete removes a chat session by ID.
func (cs *ChatStore) Delete(id string) error {
	all, err := cs.List()
	if err != nil {
		return err
	}
	filtered := make([]*models.ChatSession, 0, len(all))
	found := false
	for _, s := range all {
		if s.ID == id {
			found = true
			continue
		}
		filtered = append(filtered, s)
	}
	if !found {
		return fmt.Errorf("chat session %q not found", id)
	}
	return writeJSON(cs.filePath(), filtered)
}

// MarkAllIdle sets all "streaming" sessions to "idle".
// Called on server restart for crash recovery.
func (cs *ChatStore) MarkAllIdle() error {
	all, err := cs.List()
	if err != nil {
		return err
	}
	changed := false
	for _, s := range all {
		if s.Status == "streaming" {
			s.Status = "idle"
			changed = true
		}
	}
	if !changed {
		return nil
	}
	return writeJSON(cs.filePath(), all)
}
