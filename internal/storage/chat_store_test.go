package storage

import (
	"testing"

	"github.com/hoangtrung1801/known-me/internal/models"
)

func newTestChatStore(t *testing.T, projectID string) *ChatStore {
	t.Helper()
	return &ChatStore{root: t.TempDir(), projectID: projectID}
}

func saveTestChat(t *testing.T, store *ChatStore, session *models.ChatSession) {
	t.Helper()
	if err := store.Save(session); err != nil {
		t.Fatal(err)
	}
}

func TestChatStoreFindTaskSessionScopesByProjectAndAgent(t *testing.T) {
	store := newTestChatStore(t, "project-a")
	saveTestChat(t, store, &models.ChatSession{ID: "a", ProjectID: "project-a", TaskID: "12", AgentType: "codex"})
	saveTestChat(t, store, &models.ChatSession{ID: "b", ProjectID: "project-b", TaskID: "12", AgentType: "codex"})
	saveTestChat(t, store, &models.ChatSession{ID: "c", ProjectID: "project-a", TaskID: "12", AgentType: "opencode"})

	session, err := store.FindTaskSession("project-a", "12", "codex")
	if err != nil || session.ID != "a" {
		t.Fatalf("FindTaskSession() = %#v, %v; want project-a Codex session a", session, err)
	}
}

func TestChatStoreDeleteTaskSessionsIsIdempotent(t *testing.T) {
	store := newTestChatStore(t, "project-a")
	saveTestChat(t, store, &models.ChatSession{ID: "a", ProjectID: "project-a", TaskID: "12", AgentType: "codex"})
	saveTestChat(t, store, &models.ChatSession{ID: "b", ProjectID: "project-b", TaskID: "12", AgentType: "codex"})

	if err := store.DeleteTaskSessions("project-a", "12"); err != nil {
		t.Fatal(err)
	}
	if err := store.DeleteTaskSessions("project-a", "12"); err != nil {
		t.Fatal(err)
	}
	if _, err := store.Get("a"); err == nil {
		t.Fatal("deleted task chat is still present")
	}
	if _, err := store.Get("b"); err != nil {
		t.Fatalf("chat from another project was deleted: %v", err)
	}
}

func TestChatStoreRejectsDuplicateCodexTaskSessions(t *testing.T) {
	store := newTestChatStore(t, "project-a")
	if err := store.Save(&models.ChatSession{ID: "a", ProjectID: "project-a", TaskID: "12", AgentType: "codex"}); err != nil {
		t.Fatal(err)
	}
	if err := store.Save(&models.ChatSession{ID: "b", ProjectID: "project-a", TaskID: "12", AgentType: "codex"}); err == nil {
		t.Fatal("duplicate Codex task chat was saved")
	}
}

func TestChatMessageRoundTripPreservesTaskMetadata(t *testing.T) {
	store := newTestChatStore(t, "project-a")
	saveTestChat(t, store, &models.ChatSession{
		ID:        "chat-1",
		ProjectID: "project-a",
		TaskID:    "12",
		AgentType: "codex",
		Messages: []models.ChatMessage{{
			ID:      "message-1",
			Role:    "assistant",
			Content: "done",
			RunID:   "run-1",
			Phase:   models.AgentRunPhaseChat,
		}},
	})

	session, err := store.Get("chat-1")
	if err != nil {
		t.Fatal(err)
	}
	if session.ProjectID != "project-a" || session.Messages[0].RunID != "run-1" || session.Messages[0].Phase != models.AgentRunPhaseChat {
		t.Fatalf("round trip lost task metadata: %#v", session)
	}
}
