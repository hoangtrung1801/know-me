package storage

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sync"

	"github.com/hoangtrung1801/known-me/internal/models"
)

var (
	ErrChatNotFound = errors.New("chat session not found")
	ErrChatConflict = errors.New("chat session conflict")
)

// ChatStore reads and writes .knowns/chats.json.
type ChatStore struct {
	root      string
	projectID string
	mu        sync.Mutex
}

func (cs *ChatStore) filePath() string {
	return filepath.Join(cs.root, "chats.json")
}

// List returns all chat sessions.
func (cs *ChatStore) List() ([]*models.ChatSession, error) {
	cs.mu.Lock()
	defer cs.mu.Unlock()
	return cs.listUnlocked()
}

func (cs *ChatStore) listUnlocked() ([]*models.ChatSession, error) {
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
	cs.mu.Lock()
	defer cs.mu.Unlock()
	all, err := cs.listUnlocked()
	if err != nil {
		return nil, err
	}
	for _, s := range all {
		if s.ID == id {
			return s, nil
		}
	}
	return nil, fmt.Errorf("%w: %q", ErrChatNotFound, id)
}

// FindTaskSession returns the task-bound session for a project and agent.
func (cs *ChatStore) FindTaskSession(projectID, taskID, agentType string) (*models.ChatSession, error) {
	cs.mu.Lock()
	defer cs.mu.Unlock()
	all, err := cs.listUnlocked()
	if err != nil {
		return nil, err
	}
	for _, session := range all {
		if session.ProjectID == projectID && session.TaskID == taskID && session.AgentType == agentType {
			return session, nil
		}
	}
	return nil, fmt.Errorf("%w for project %q task %q and agent %q", ErrChatNotFound, projectID, taskID, agentType)
}

// DeleteTaskSessions removes all sessions linked to a project task.
// It is intentionally idempotent so lifecycle retries can safely call it.
func (cs *ChatStore) DeleteTaskSessions(projectID, taskID string) error {
	cs.mu.Lock()
	defer cs.mu.Unlock()
	all, err := cs.listUnlocked()
	if err != nil {
		return err
	}
	filtered := make([]*models.ChatSession, 0, len(all))
	changed := false
	for _, session := range all {
		if session.ProjectID == projectID && session.TaskID == taskID {
			changed = true
			continue
		}
		filtered = append(filtered, session)
	}
	if !changed {
		return nil
	}
	return writeJSON(cs.filePath(), filtered)
}

// Save creates or updates a chat session.
func (cs *ChatStore) Save(session *models.ChatSession) error {
	cs.mu.Lock()
	defer cs.mu.Unlock()
	if session.ID == "" {
		return fmt.Errorf("chat session ID is required")
	}
	all, err := cs.listUnlocked()
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
	if !found && session.AgentType == "codex" && session.ProjectID != "" && session.TaskID != "" {
		for _, existing := range all {
			if existing.AgentType == "codex" && existing.ProjectID == session.ProjectID && existing.TaskID == session.TaskID {
				return fmt.Errorf("%w: Codex chat already exists for project %q task %q", ErrChatConflict, session.ProjectID, session.TaskID)
			}
		}
	}
	if !found {
		all = append(all, session)
	}
	return writeJSON(cs.filePath(), all)
}

// Update applies a read-modify-write under the chat store lock.
func (cs *ChatStore) Update(id string, mutate func(*models.ChatSession) error) (*models.ChatSession, error) {
	if mutate == nil {
		return nil, fmt.Errorf("chat update callback is required")
	}
	cs.mu.Lock()
	defer cs.mu.Unlock()
	all, err := cs.listUnlocked()
	if err != nil {
		return nil, err
	}
	var session *models.ChatSession
	for _, candidate := range all {
		if candidate.ID == id {
			session = candidate
			break
		}
	}
	if session == nil {
		return nil, fmt.Errorf("%w: %q", ErrChatNotFound, id)
	}
	if err := mutate(session); err != nil {
		return nil, err
	}
	if err := writeJSON(cs.filePath(), all); err != nil {
		return nil, err
	}
	return session, nil
}

// Delete removes a chat session by ID.
func (cs *ChatStore) Delete(id string) error {
	cs.mu.Lock()
	defer cs.mu.Unlock()
	all, err := cs.listUnlocked()
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
		return fmt.Errorf("%w: %q", ErrChatNotFound, id)
	}
	return writeJSON(cs.filePath(), filtered)
}

// MarkAllIdle sets all "streaming" sessions to "idle".
// Called on server restart for crash recovery.
func (cs *ChatStore) MarkAllIdle() error {
	cs.mu.Lock()
	defer cs.mu.Unlock()
	all, err := cs.listUnlocked()
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
