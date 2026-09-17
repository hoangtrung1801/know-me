package omp

import (
	"context"
	"strings"
	"testing"
	"time"

	"github.com/hoangtrung1801/know-me/internal/models"
)

func TestStartChatAndStreaming(t *testing.T) {
	store := testStore(t, "in-progress")
	fake := &fakeSession{}
	mgr := NewManager("fake-omp", nil)
	mgr.sessionFactory = func(ctx context.Context, root string, command []string) (acpSession, error) {
		return fake, nil
	}
	mgr.detect = func(ctx context.Context, exe string) Status {
		return Status{Installed: true, LoggedIn: true}
	}

	err := mgr.StartChat(context.Background(), store, "t1", "hello omp")
	if err != nil {
		t.Fatalf("StartChat failed: %v", err)
	}

	time.Sleep(50 * time.Millisecond)

	chat, err := store.Chats.FindTaskSession(store.ProjectID, "t1", "omp")
	if err != nil {
		t.Fatalf("FindTaskSession error: %v", err)
	}
	if chat.AgentType != "omp" {
		t.Fatalf("chat.AgentType = %q, want omp", chat.AgentType)
	}
	if len(chat.Messages) < 2 {
		t.Fatalf("expected at least 2 messages (user + assistant), got %d", len(chat.Messages))
	}
	if chat.Messages[0].Role != "user" || chat.Messages[0].Content != "hello omp" {
		t.Fatalf("user message = %#v", chat.Messages[0])
	}
	if chat.Messages[1].Role != "assistant" || chat.Messages[1].Model != "omp" {
		t.Fatalf("assistant message = %#v", chat.Messages[1])
	}
}

func TestStartChatFindsLegacyCodexSession(t *testing.T) {
	store := testStore(t, "in-progress")
	legacyChat := &models.ChatSession{
		ID:        "legacy-chat-1",
		Title:     "Legacy chat",
		AgentType: "codex",
		ProjectID: store.ProjectID,
		TaskID:    "t1",
		Status:    "idle",
		Messages:  []models.ChatMessage{},
	}
	if err := store.Chats.Save(legacyChat); err != nil {
		t.Fatal(err)
	}

	fake := &fakeSession{}
	mgr := NewManager("fake-omp", nil)
	mgr.sessionFactory = func(ctx context.Context, root string, command []string) (acpSession, error) {
		return fake, nil
	}
	mgr.detect = func(ctx context.Context, exe string) Status {
		return Status{Installed: true, LoggedIn: true}
	}

	err := mgr.StartChat(context.Background(), store, "t1", "continue with omp")
	if err != nil {
		t.Fatalf("StartChat on legacy session failed: %v", err)
	}

	time.Sleep(50 * time.Millisecond)

	// Verify migrated session
	chat, err := store.Chats.Get("legacy-chat-1")
	if err != nil {
		t.Fatal(err)
	}
	if chat.AgentType != "omp" {
		t.Fatalf("expected legacy chat to be migrated to omp, got %q", chat.AgentType)
	}
}

func TestBuildChatPromptRestrictsPlanReview(t *testing.T) {
	mgr := NewManager("fake-omp", nil)
	store := testStore(t, "in-progress")
	task, _ := store.Tasks.Get("t1")
	task.ImplementationPlan = "Do not edit until approved"
	_ = store.Tasks.Update(task)

	prompt := mgr.buildChatPrompt(store, "t1", "write script to say hello", models.AgentPhasePlanReview)
	if !strings.Contains(prompt, "PLAN REVIEW mode") {
		t.Fatalf("expected PLAN REVIEW mode in prompt, got: %s", prompt)
	}
	if !strings.Contains(prompt, "Do NOT modify, create, or delete any files") {
		t.Fatalf("expected prohibition against file edits in prompt, got: %s", prompt)
	}
	if !strings.Contains(prompt, "Do not edit until approved") {
		t.Fatalf("expected current implementation plan in prompt, got: %s", prompt)
	}
	if !strings.Contains(prompt, "write script to say hello") {
		t.Fatalf("expected user message in prompt, got: %s", prompt)
	}
}
