package codex

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/hoangtrung1801/know-me/internal/models"
	"github.com/hoangtrung1801/know-me/internal/storage"
)

func TestStartChatCreatesLinkedSessionAndLeavesWorkflowUnchanged(t *testing.T) {
	manager, fake := testSessionManager(t, nil)
	store := testAgentStore(t, "in-progress")
	var events []ChatEvent
	manager.chatEmit = func(event ChatEvent) {
		events = append(events, event)
	}

	if err := manager.StartChat(context.Background(), store, "task01", "Please inspect the failing test"); err != nil {
		t.Fatal(err)
	}
	waitForChatStatus(t, store, "task01", "idle")

	snapshot := mustSnapshot(t, manager, store, "task01")
	if snapshot.Workflow.Phase != models.AgentPhaseIdle || snapshot.ChatSessionID == "" {
		t.Fatalf("snapshot = %#v", snapshot)
	}
	if task, err := store.Tasks.Get("task01"); err != nil || task.Status != "in-progress" {
		t.Fatalf("task after chat = %#v, %v", task, err)
	}
	session, err := store.Chats.FindTaskSession(store.ProjectID, "task01", "codex")
	if err != nil {
		t.Fatal(err)
	}
	if session.SessionID != "session-1" || len(session.Messages) != 2 || session.Messages[0].Role != "user" || session.Messages[1].Role != "assistant" || session.Messages[1].Content != "chat response" {
		t.Fatalf("chat session = %#v", session)
	}
	if len(events) == 0 || fake.promptCalls != 1 {
		t.Fatalf("events = %#v prompt calls = %d", events, fake.promptCalls)
	}
}

func TestStartChatUsesTaskWorktree(t *testing.T) {
	t.Setenv("HOME", t.TempDir())
	store := testGitAgentStore(t, "in-progress")
	worktreePath, worktreeBranch, err := createTaskWorktree(context.Background(), store.RepositoryRoot(), store.ProjectID, "task01")
	if err != nil {
		t.Fatal(err)
	}
	seedAgentWorkflow(t, store, models.AgentWorkflow{
		ProjectID: store.ProjectID, TaskID: "task01", Phase: models.AgentPhaseIdle,
		WorktreePath: worktreePath, WorktreeBranch: worktreeBranch,
	})
	manager, fake := testSessionManager(t, nil)
	var sessionRoot string
	manager.sessionFactory = func(_ context.Context, root string, _ []string) (acpSession, error) {
		sessionRoot = root
		return fake, nil
	}

	if err := manager.StartChat(context.Background(), store, "task01", "Please inspect the task"); err != nil {
		t.Fatal(err)
	}
	waitForChatStatus(t, store, "task01", "idle")
	if sessionRoot != worktreePath {
		t.Fatalf("chat root = %q, worktree = %q", sessionRoot, worktreePath)
	}
}

func TestStartChatAllowsReviewPhases(t *testing.T) {
	for _, phase := range []models.AgentPhase{models.AgentPhasePlanReview, models.AgentPhaseCodeReview, models.AgentPhaseCompleted} {
		t.Run(string(phase), func(t *testing.T) {
			store := testAgentStore(t, "in-progress")
			seedAgentWorkflow(t, store, models.AgentWorkflow{
				ProjectID: store.ProjectID,
				TaskID:    "task01",
				Phase:     phase,
			})
			manager, _ := testSessionManager(t, nil)

			if err := manager.StartChat(context.Background(), store, "task01", "send anyway"); err != nil {
				t.Fatalf("StartChat() error = %v", err)
			}
			waitForChatStatus(t, store, "task01", "idle")
		})
	}
}

func TestStartChatRejectsActiveGatedPhases(t *testing.T) {
	for _, phase := range []models.AgentPhase{models.AgentPhaseInvestigating, models.AgentPhaseImplementing} {
		t.Run(string(phase), func(t *testing.T) {
			store := testAgentStore(t, "in-progress")
			seedAgentWorkflow(t, store, models.AgentWorkflow{
				ProjectID: store.ProjectID,
				TaskID:    "task01",
				Phase:     phase,
			})
			manager, _ := testSessionManager(t, nil)

			if err := manager.StartChat(context.Background(), store, "task01", "send anyway"); !errors.Is(err, ErrConflict) {
				t.Fatalf("StartChat() error = %v, want conflict", err)
			}
			if _, err := store.Chats.FindTaskSession(store.ProjectID, "task01", "codex"); err == nil {
				t.Fatal("gated workflow rejection created a chat session")
			}
		})
	}
}

func TestGatedRunAppendsActionAndAssistantToTaskChat(t *testing.T) {
	manager, _ := testSessionManager(t, []PhaseResult{{
		ImplementationPlan:  "1. Inspect the failing test",
		ImplementationNotes: "The assertion needs an edge-case check.",
		Summary:             "investigation complete",
		Tests:               []string{"go test ./internal/agents/codex"},
	}})
	store := testAgentStore(t, "in-progress")

	mustAct(t, manager, store, "task01", ActionStartInvestigation, "")
	waitForPhase(t, manager, store, "task01", models.AgentPhasePlanReview)

	session, err := store.Chats.FindTaskSession(store.ProjectID, "task01", "codex")
	if err != nil {
		t.Fatal(err)
	}
	if len(session.Messages) != 2 || session.Messages[0].Role != "user" || session.Messages[1].Role != "assistant" {
		t.Fatalf("gated transcript = %#v", session.Messages)
	}
	if session.Messages[1].Content == "" || session.Messages[1].Phase != models.AgentRunPhaseInvestigation {
		t.Fatalf("gated assistant message = %#v", session.Messages[1])
	}
}

func TestStartChatQueuesAutoMessageWhileChatRunIsActive(t *testing.T) {
	manager, fake := testSessionManager(t, nil)
	store := testAgentStore(t, "in-progress")
	fake.promptStarted = make(chan struct{})
	release := make(chan struct{})
	fake.promptBlock = release

	if err := manager.StartChat(context.Background(), store, "task01", "first"); err != nil {
		t.Fatal(err)
	}
	<-fake.promptStarted
	if err := manager.StartChat(context.Background(), store, "task01", "second"); err != nil {
		t.Fatal(err)
	}
	session, err := store.Chats.FindTaskSession(store.ProjectID, "task01", "codex")
	if err != nil {
		t.Fatal(err)
	}
	if len(session.MessageQueue) != 1 || session.MessageQueue[0] != "second" {
		t.Fatalf("queue = %#v", session.MessageQueue)
	}
	close(release)
	waitForChatStatus(t, store, "task01", "idle")
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		session, _ = store.Chats.FindTaskSession(store.ProjectID, "task01", "codex")
		if session != nil && len(session.MessageQueue) == 0 && fake.promptCalls == 2 {
			return
		}
		time.Sleep(5 * time.Millisecond)
	}
	t.Fatalf("queued chat did not drain: session=%#v calls=%d", session, fake.promptCalls)
}

func TestChatInterruptionPreservesPartialAssistantAndRequiresResume(t *testing.T) {
	manager, fake := testSessionManager(t, nil)
	store := testAgentStore(t, "in-progress")
	fake.promptErr = errors.New("ACP adapter exited: EOF")

	if err := manager.StartChat(context.Background(), store, "task01", "continue the fix"); err != nil {
		t.Fatal(err)
	}
	waitForChatStatus(t, store, "task01", "error")
	snapshot := mustSnapshot(t, manager, store, "task01")
	if !snapshot.Interrupted || snapshot.Workflow.ResumePhase != models.AgentRunPhaseChat {
		t.Fatalf("interrupted snapshot = %#v", snapshot)
	}
	session, err := store.Chats.FindTaskSession(store.ProjectID, "task01", "codex")
	if err != nil {
		t.Fatal(err)
	}
	if len(session.Messages) != 2 || session.Messages[1].Role != "assistant" {
		t.Fatalf("interrupted transcript = %#v", session.Messages)
	}
}

func TestResumeInterruptedChatUsesTextPrompt(t *testing.T) {
	manager, fake := testSessionManager(t, nil)
	store := testAgentStore(t, "in-progress")
	fake.promptErr = errors.New("ACP adapter exited: EOF")
	if err := manager.StartChat(context.Background(), store, "task01", "continue the fix"); err != nil {
		t.Fatal(err)
	}
	waitForChatStatus(t, store, "task01", "error")
	fake.promptErr = nil

	mustAct(t, manager, store, "task01", ActionResume, "")
	waitForChatStatus(t, store, "task01", "idle")
	snapshot := mustSnapshot(t, manager, store, "task01")
	if snapshot.Interrupted || snapshot.Workflow.Phase != models.AgentPhaseIdle {
		t.Fatalf("resumed snapshot = %#v", snapshot)
	}
	if fake.promptCalls != 2 {
		t.Fatalf("prompt calls = %d, want 2", fake.promptCalls)
	}
}

func TestReviewCommentStartsFollowupInTaskChat(t *testing.T) {
	store := testAgentStore(t, "in-progress")
	seedAgentWorkflow(t, store, models.AgentWorkflow{
		ProjectID: store.ProjectID,
		TaskID:    "task01",
		Phase:     models.AgentPhasePlanReview,
	})
	manager, _ := testSessionManager(t, []PhaseResult{{
		ImplementationPlan:  "1. Revise the plan",
		ImplementationNotes: "Applied review feedback",
		Summary:             "revised",
		Tests:               []string{},
	}})

	if _, _, err := manager.Act(context.Background(), store, "task01", ActionRequestPlanChanges, "handle the edge case"); err != nil {
		t.Fatal(err)
	}
	waitForPhase(t, manager, store, "task01", models.AgentPhasePlanReview)
	session, err := store.Chats.FindTaskSession(store.ProjectID, "task01", "codex")
	if err != nil {
		t.Fatal(err)
	}
	if len(session.Messages) != 3 || session.Messages[0].Role != "user" || session.Messages[0].Content != "handle the edge case" || session.Messages[1].Content != "Revise investigation plan" || session.Messages[2].Role != "assistant" || session.Messages[2].Content == "" {
		t.Fatalf("review transcript = %#v", session.Messages)
	}
}

func TestSnapshotCreatesLinkedTaskChat(t *testing.T) {
	store := testAgentStore(t, "in-progress")
	manager := testManager(t, nil)

	snapshot := mustSnapshot(t, manager, store, "task01")
	if snapshot.ChatSessionID == "" || snapshot.Workflow.ChatSessionID != snapshot.ChatSessionID {
		t.Fatalf("snapshot chat link = %#v", snapshot)
	}
	session, err := store.Chats.FindTaskSession(store.ProjectID, "task01", "codex")
	if err != nil || session.ID != snapshot.ChatSessionID {
		t.Fatalf("snapshot session = %#v, %v", session, err)
	}
}

func (s *recordingSession) PromptText(ctx context.Context, _ string, onUpdate func(ACPUpdate)) (string, error) {
	if s.promptStarted != nil {
		close(s.promptStarted)
		s.promptStarted = nil
	}
	if s.promptBlock != nil {
		select {
		case <-s.promptBlock:
		case <-ctx.Done():
			return "", ctx.Err()
		}
	}
	s.promptCalls++
	if s.promptErr != nil {
		return "", s.promptErr
	}
	if onUpdate != nil {
		onUpdate(ACPUpdate{Kind: "agent_message_chunk", Text: "chat response"})
	}
	return "chat response", nil
}

func waitForChatStatus(t *testing.T, store *storage.Store, taskID, want string) {
	t.Helper()
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		session, err := store.Chats.FindTaskSession(store.ProjectID, taskID, "codex")
		if err == nil && session.Status == want {
			return
		}
		time.Sleep(5 * time.Millisecond)
	}
	session, err := store.Chats.FindTaskSession(store.ProjectID, taskID, "codex")
	t.Fatalf("chat status did not reach %q: %#v, %v", want, session, err)
}
