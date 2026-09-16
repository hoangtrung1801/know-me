package omp

import (
	"context"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/hoangtrung1801/know-me/internal/models"
	"github.com/hoangtrung1801/know-me/internal/storage"
)

type fakeSession struct {
	sessionID string
	mode      ACPMode
	prompts   []string
	onPrompt  func(string)
}

func (s *fakeSession) NewSession(ctx context.Context) error {
	s.sessionID = "fake-sess-1"
	return nil
}
func (s *fakeSession) LoadSession(ctx context.Context, id string) error {
	s.sessionID = id
	return nil
}
func (s *fakeSession) SetMode(ctx context.Context, mode ACPMode) error {
	s.mode = mode
	return nil
}
func (s *fakeSession) Prompt(ctx context.Context, p string, cb func(ACPUpdate)) (string, error) {
	s.prompts = append(s.prompts, p)
	if s.onPrompt != nil {
		s.onPrompt(p)
	}
	if cb != nil {
		cb(ACPUpdate{Kind: "agent_message_chunk", Text: "Done plan\n```json\n{\"summary\":\"plan done\",\"implementationPlan\":\"do it\",\"tests\":[]}\n```"})
	}
	return "ok", nil
}
func (s *fakeSession) PromptText(ctx context.Context, p string, cb func(ACPUpdate)) (string, error) {
	return s.Prompt(ctx, p, cb)
}
func (s *fakeSession) Cancel(ctx context.Context) error { return nil }
func (s *fakeSession) Close(ctx context.Context) error  { return nil }
func (s *fakeSession) SessionID() string                { return s.sessionID }

func testStore(t *testing.T, status string) *storage.Store {
	t.Helper()
	temp := t.TempDir()
	repo := filepath.Join(temp, "repo")
	if err := os.MkdirAll(repo, 0o755); err != nil {
		t.Fatal(err)
	}
	store := storage.NewProjectStore(temp, "p1", repo)
	_ = store.Init("p1")
	now := time.Now().UTC()
	task := models.Task{
		ID:        "t1",
		ProjectID: "p1",
		Title:     "Test task",
		Status:    status,
		Priority:  "medium",
		Labels:    []string{},
		CreatedAt: now,
		UpdatedAt: now,
	}
	if err := store.Tasks.Create(&task); err != nil {
		t.Fatal(err)
	}
	return store
}

func TestWorkflowInvestigationAndApproval(t *testing.T) {
	store := testStore(t, "in-progress")
	fake := &fakeSession{}
	mgr := NewManager("fake-omp", nil)
	mgr.sessionFactory = func(ctx context.Context, root string, command []string) (acpSession, error) {
		return fake, nil
	}
	mgr.detect = func(ctx context.Context, exe string) Status {
		return Status{Installed: true, LoggedIn: true}
	}
	mgr.dirtyFiles = func(ctx context.Context, root string) ([]string, error) {
		return []string{}, nil
	}

	// 1. Start investigation
	snap, started, err := mgr.Act(context.Background(), store, "t1", ActionStartInvestigation, "")
	if err != nil || !started {
		t.Fatalf("start investigation error: %v, started: %v", err, started)
	}
	if snap.Workflow.Phase != models.AgentPhaseInvestigating {
		t.Fatalf("phase = %q, want %q", snap.Workflow.Phase, models.AgentPhaseInvestigating)
	}

	snap = waitForPhase(t, mgr, store, "t1", models.AgentPhasePlanReview)

	// 2. Approve plan
	snap, started, err = mgr.Act(context.Background(), store, "t1", ActionApprovePlan, "")
	if err != nil || !started {
		t.Fatalf("approve plan error: %v, started: %v", err, started)
	}
	if snap.Workflow.Phase != models.AgentPhaseImplementing {
		t.Fatalf("phase = %q, want %q", snap.Workflow.Phase, models.AgentPhaseImplementing)
	}

	snap = waitForPhase(t, mgr, store, "t1", models.AgentPhaseCodeReview)

	// 3. Approve implementation
	snap, started, err = mgr.Act(context.Background(), store, "t1", ActionApproveImplementation, "")
	if err != nil || started {
		t.Fatalf("approve implementation error: %v, started: %v", err, started)
	}
	if snap.Workflow.Phase != models.AgentPhaseCompleted {
		t.Fatalf("phase = %q, want %q", snap.Workflow.Phase, models.AgentPhaseCompleted)
	}

	task, _ := store.Tasks.Get("t1")
	if task.Status != "done" {
		t.Fatalf("task status = %q, want done", task.Status)
	}
}

func waitForPhase(t *testing.T, manager *Manager, store *storage.Store, taskID string, want models.AgentPhase) models.AgentTaskSnapshot {
	t.Helper()
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		snap, err := manager.Snapshot(context.Background(), store, taskID)
		if err == nil && snap.Workflow.Phase == want {
			return snap
		}
		time.Sleep(10 * time.Millisecond)
	}
	snap, _ := manager.Snapshot(context.Background(), store, taskID)
	t.Fatalf("phase did not reach %q, got %q", want, snap.Workflow.Phase)
	return snap
}

func TestWorkflowApprovePlanRejectsDirtyWorkspace(t *testing.T) {
	store := testStore(t, "in-progress")
	mgr := NewManager("fake-omp", nil)
	mgr.detect = func(ctx context.Context, exe string) Status {
		return Status{Installed: true, LoggedIn: true}
	}
	mgr.dirtyFiles = func(ctx context.Context, root string) ([]string, error) {
		return []string{"README.md"}, nil
	}

	state, _ := store.Agent.Load()
	wf := ensureWorkflow(&state, store.ProjectID, "t1", time.Now().UTC())
	wf.Phase = models.AgentPhasePlanReview
	_ = store.Agent.Save(state)

	_, _, err := mgr.Act(context.Background(), store, "t1", ActionApprovePlan, "")
	if err == nil {
		t.Fatal("expected dirty workspace to reject plan approval, got nil")
	}
}
