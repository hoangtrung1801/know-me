package omp

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"sync"
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
func TestInvestigationFinishEmitsTaskChanged(t *testing.T) {
	store := testStore(t, "in-progress")
	fake := &fakeSession{}
	var mu sync.Mutex
	var events []Event
	mgr := NewManager("fake-omp", func(e Event) {
		mu.Lock()
		events = append(events, e)
		mu.Unlock()
	})
	mgr.sessionFactory = func(ctx context.Context, root string, command []string) (acpSession, error) {
		return fake, nil
	}
	mgr.detect = func(ctx context.Context, exe string) Status {
		return Status{Installed: true, LoggedIn: true}
	}
	mgr.dirtyFiles = func(ctx context.Context, root string) ([]string, error) {
		return []string{}, nil
	}

	if _, started, err := mgr.Act(context.Background(), store, "t1", ActionStartInvestigation, ""); err != nil || !started {
		t.Fatalf("start investigation error: %v, started: %v", err, started)
	}
	waitForPhase(t, mgr, store, "t1", models.AgentPhasePlanReview)

	task, err := store.Tasks.Get("t1")
	if err != nil {
		t.Fatalf("get task: %v", err)
	}
	if task.ImplementationPlan != "do it" {
		t.Fatalf("implementationPlan = %q, want %q", task.ImplementationPlan, "do it")
	}

	mu.Lock()
	defer mu.Unlock()
	for _, e := range events {
		if e.Type == "updated" && e.TaskID == "t1" && e.TaskChanged {
			return
		}
	}
	t.Fatalf("no updated event with taskChanged for t1 in %d events", len(events))
}
func TestWorkflowSkillLoadsFromEmbeddedFS(t *testing.T) {
	skill := loadWorkflowSkillInstructions()
	if skill == "" {
		t.Fatal("expected kn-workflow/SKILL.md to load from embedded FS, got empty")
	}
	if !strings.Contains(skill, "Know-Me Task Run Protocol") {
		t.Fatalf("skill missing title header: %q", skill[:min(len(skill), 100)])
	}
	if !strings.Contains(skill, "```json") || !strings.Contains(skill, "implementationPlan") {
		t.Fatal("skill missing json output contract")
	}
}

func TestBuildPromptIncludesWorkflowSkillAndPhaseInstruction(t *testing.T) {
	mgr := NewManager("fake-omp", nil)
	task := &models.Task{
		ID:          "t42",
		Title:       "Ship feature",
		Description: "Detailed task description",
		AcceptanceCriteria: []models.AcceptanceCriterion{
			{Text: "AC 1"},
		},
	}
	state := &models.AgentState{
		ReviewComments: []models.ReviewComment{
			{TaskID: "t42", Stage: "plan", Body: "Add unit tests"},
		},
	}
	wf := &models.AgentWorkflow{TaskID: "t42"}

	for _, tc := range []struct {
		phase       models.AgentRunPhase
		mustContain []string
	}{
		{
			phase: models.AgentRunPhaseInvestigation,
			mustContain: []string{
				"/knowme-workflow",
				"Know-Me Task Run Protocol",
				"Active Phase: INVESTIGATION",
				"Task: Ship feature",
				"Description:\nDetailed task description",
				"AC 1",
				"Add unit tests",
				"implementationPlan",
			},
		},
		{
			phase: models.AgentRunPhaseImplementation,
			mustContain: []string{
				"Know-Me Task Run Protocol",
				"Active Phase: IMPLEMENTATION",
				"implementationNotes",
			},
		},
		{
			phase: models.AgentRunPhaseFix,
			mustContain: []string{
				"Know-Me Task Run Protocol",
				"Active Phase: FIX",
				"Review Feedback",
			},
		},
	} {
		prompt := mgr.buildPrompt(task, state, wf, tc.phase)
		for _, expected := range tc.mustContain {
			if !strings.Contains(prompt, expected) {
				t.Errorf("phase %v prompt missing %q:\n%s", tc.phase, expected, prompt)
			}
		}
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

func TestWorkflowApprovePlanAllowsDirtyWorktree(t *testing.T) {
	t.Setenv("HOME", t.TempDir())
	repoRoot := initGitRepo(t)
	temp := t.TempDir()
	store := storage.NewProjectStore(temp, "p1", repoRoot)
	_ = store.Init("p1")
	now := time.Now().UTC()
	task := models.Task{
		ID:                 "t5",
		ProjectID:          "p1",
		Title:              "Feature five",
		Status:             "in-progress",
		ImplementationPlan: "Plan for five",
		CreatedAt:          now,
		UpdatedAt:          now,
	}
	_ = store.Tasks.Create(&task)

	fake := &fakeSession{}
	mgr := NewManager("fake-omp", nil)
	mgr.sessionFactory = func(ctx context.Context, root string, command []string) (acpSession, error) {
		return fake, nil
	}
	mgr.detect = func(ctx context.Context, exe string) Status {
		return Status{Installed: true, LoggedIn: true}
	}
	// Simulate dirty files in worktree
	mgr.dirtyFiles = func(ctx context.Context, root string) ([]string, error) {
		return []string{"hello.js", "package.json"}, nil
	}

	state, _ := store.Agent.Load()
	wf := ensureWorkflow(&state, store.ProjectID, "t5", now)
	wf.Phase = models.AgentPhasePlanReview
	wf.WorktreePath = filepath.Join(temp, "worktrees", "p1", "t5")
	wf.WorktreeBranch = "knowme/p1/t5"
	_ = os.MkdirAll(wf.WorktreePath, 0o755)
	_ = store.Agent.Save(state)

	snap, started, err := mgr.Act(context.Background(), store, "t5", ActionApprovePlan, "")
	if err != nil || !started {
		t.Fatalf("expected plan approval to succeed in isolated worktree even if dirty, got err: %v", err)
	}
	if snap.Workflow.Phase != models.AgentPhaseImplementing {
		t.Fatalf("phase = %q, want %q", snap.Workflow.Phase, models.AgentPhaseImplementing)
	}
	waitForPhase(t, mgr, store, "t5", models.AgentPhaseCodeReview)
}

func TestWorkflowWorktreeFullLifecycle(t *testing.T) {
	t.Setenv("HOME", t.TempDir())
	repoRoot := initGitRepo(t)
	temp := t.TempDir()
	store := storage.NewProjectStore(temp, "p1", repoRoot)
	_ = store.Init("p1")
	now := time.Now().UTC()
	task := models.Task{
		ID:        "t1",
		ProjectID: "p1",
		Title:     "Add shiny feature",
		Status:    "in-progress",
		Priority:  "medium",
		Labels:    []string{},
		CreatedAt: now,
		UpdatedAt: now,
	}
	if err := store.Tasks.Create(&task); err != nil {
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
	mgr.dirtyFiles = func(ctx context.Context, root string) ([]string, error) {
		return []string{}, nil
	}

	// 1. ActionStartAgent: creates isolated worktree
	snap, started, err := mgr.Act(context.Background(), store, "t1", ActionStartAgent, "")
	if err != nil || started {
		t.Fatalf("start agent error: %v, started: %v", err, started)
	}
	if snap.Workflow.Phase != models.AgentPhaseIdle {
		t.Fatalf("phase = %q, want %q", snap.Workflow.Phase, models.AgentPhaseIdle)
	}
	if snap.Workflow.WorktreePath == "" || snap.Workflow.WorktreeBranch == "" {
		t.Fatalf("expected worktreePath and worktreeBranch to be set, got path=%q, branch=%q", snap.Workflow.WorktreePath, snap.Workflow.WorktreeBranch)
	}
	wtPath := snap.Workflow.WorktreePath

	// 2. ActionStartInvestigation: runs investigation in worktree
	snap, started, err = mgr.Act(context.Background(), store, "t1", ActionStartInvestigation, "")
	if err != nil || !started {
		t.Fatalf("start investigation error: %v, started: %v", err, started)
	}
	snap = waitForPhase(t, mgr, store, "t1", models.AgentPhasePlanReview)

	// 3. ActionApprovePlan: runs implementation in worktree
	snap, started, err = mgr.Act(context.Background(), store, "t1", ActionApprovePlan, "")
	if err != nil || !started {
		t.Fatalf("approve plan error: %v, started: %v", err, started)
	}
	snap = waitForPhase(t, mgr, store, "t1", models.AgentPhaseCodeReview)

	// Simulate implementation creating a file in worktree
	featFile := filepath.Join(wtPath, "shiny.txt")
	if err := os.WriteFile(featFile, []byte("shiny feature content\n"), 0o644); err != nil {
		t.Fatal(err)
	}

	// 4. ActionCommitWorktree: commits changes in worktree
	snap, started, err = mgr.Act(context.Background(), store, "t1", ActionCommitWorktree, "feat(t1): add shiny feature")
	if err != nil || started {
		t.Fatalf("commit worktree error: %v, started: %v", err, started)
	}
	if snap.Workflow.Phase != models.AgentPhaseReadyToMerge {
		t.Fatalf("phase = %q, want %q", snap.Workflow.Phase, models.AgentPhaseReadyToMerge)
	}
	if snap.Workflow.WorktreeCommit == "" {
		t.Fatal("expected non-empty WorktreeCommit")
	}

	// 5. ActionMergeWorktree: merges worktree into base repo, completes task
	snap, started, err = mgr.Act(context.Background(), store, "t1", ActionMergeWorktree, "")
	if err != nil || started {
		t.Fatalf("merge worktree error: %v, started: %v", err, started)
	}
	if snap.Workflow.Phase != models.AgentPhaseCompleted {
		t.Fatalf("phase = %q, want %q", snap.Workflow.Phase, models.AgentPhaseCompleted)
	}

	// Verify task status is "done"
	updatedTask, err := store.Tasks.Get("t1")
	if err != nil {
		t.Fatalf("get task error: %v", err)
	}
	if updatedTask.Status != "done" {
		t.Fatalf("task status = %q, want done", updatedTask.Status)
	}

	// Verify merged file exists in base repo
	mergedContent, err := os.ReadFile(filepath.Join(repoRoot, "shiny.txt"))
	if err != nil {
		t.Fatalf("expected shiny.txt in base repo root: %v", err)
	}
	if string(mergedContent) != "shiny feature content\n" {
		t.Fatalf("got content %q, want 'shiny feature content\\n'", string(mergedContent))
	}
}

func TestWorkflowCompleteWithoutMerge(t *testing.T) {
	t.Setenv("HOME", t.TempDir())
	repoRoot := initGitRepo(t)
	temp := t.TempDir()
	store := storage.NewProjectStore(temp, "p1", repoRoot)
	_ = store.Init("p1")
	now := time.Now().UTC()
	task := models.Task{
		ID:        "t2",
		ProjectID: "p1",
		Title:     "Feature two",
		Status:    "in-progress",
		CreatedAt: now,
		UpdatedAt: now,
	}
	_ = store.Tasks.Create(&task)

	mgr := NewManager("fake-omp", nil)
	state, _ := store.Agent.Load()
	wf := ensureWorkflow(&state, store.ProjectID, "t2", now)
	wf.Phase = models.AgentPhaseReadyToMerge
	_ = store.Agent.Save(state)

	snap, started, err := mgr.Act(context.Background(), store, "t2", ActionCompleteWithoutMerge, "")
	if err != nil || started {
		t.Fatalf("complete without merge error: %v, started: %v", err, started)
	}
	if snap.Workflow.Phase != models.AgentPhaseCompleted {
		t.Fatalf("phase = %q, want %q", snap.Workflow.Phase, models.AgentPhaseCompleted)
	}
	updatedTask, _ := store.Tasks.Get("t2")
	if updatedTask.Status != "done" {
		t.Fatalf("task status = %q, want done", updatedTask.Status)
	}
}

func TestWorkflowRequestChangesFromReadyToMerge(t *testing.T) {
	t.Setenv("HOME", t.TempDir())
	repoRoot := initGitRepo(t)
	temp := t.TempDir()
	store := storage.NewProjectStore(temp, "p1", repoRoot)
	_ = store.Init("p1")
	now := time.Now().UTC()
	task := models.Task{
		ID:        "t3",
		ProjectID: "p1",
		Title:     "Feature three",
		Status:    "in-progress",
		CreatedAt: now,
		UpdatedAt: now,
	}
	_ = store.Tasks.Create(&task)

	mgr := NewManager("fake-omp", nil)
	state, _ := store.Agent.Load()
	wf := ensureWorkflow(&state, store.ProjectID, "t3", now)
	wf.Phase = models.AgentPhaseReadyToMerge
	_ = store.Agent.Save(state)

	snap, started, err := mgr.Act(context.Background(), store, "t3", ActionRequestImplementationChanges, "Need extra tests")
	if err != nil || started {
		t.Fatalf("request changes error: %v, started: %v", err, started)
	}
	if snap.Workflow.Phase != models.AgentPhaseFixReady {
		t.Fatalf("phase = %q, want %q", snap.Workflow.Phase, models.AgentPhaseFixReady)
	}
}

func TestWorkflowReconcilesOrphanedActiveRun(t *testing.T) {
	t.Setenv("HOME", t.TempDir())
	repoRoot := initGitRepo(t)
	temp := t.TempDir()
	store := storage.NewProjectStore(temp, "p1", repoRoot)
	_ = store.Init("p1")
	now := time.Now().UTC()
	task := models.Task{
		ID:                 "t4",
		ProjectID:          "p1",
		Title:              "Feature four",
		Status:             "in-progress",
		ImplementationPlan: "Plan content already created",
		CreatedAt:          now,
		UpdatedAt:          now,
	}
	_ = store.Tasks.Create(&task)

	mgr := NewManager("fake-omp", nil)
	mgr.detect = func(ctx context.Context, exe string) Status {
		return Status{Installed: true, LoggedIn: true}
	}
	mgr.dirtyFiles = func(ctx context.Context, root string) ([]string, error) {
		return []string{}, nil
	}

	state, _ := store.Agent.Load()
	wf := ensureWorkflow(&state, store.ProjectID, "t4", now)
	wf.Phase = models.AgentPhaseIdle
	wf.ActiveRunID = "orphaned-run-123"
	state.Runs = append(state.Runs, models.AgentRun{
		ID:        "orphaned-run-123",
		ProjectID: store.ProjectID,
		TaskID:    "t4",
		Phase:     models.AgentRunPhaseChat,
		Status:    models.AgentRunStatusRunning,
		StartedAt: now,
	})
	_ = store.Agent.Save(state)

	snap, err := mgr.Snapshot(context.Background(), store, "t4")
	if err != nil {
		t.Fatalf("snapshot error: %v", err)
	}
	if snap.Workflow.ActiveRunID != "" {
		t.Fatalf("expected ActiveRunID to be cleared, got %q", snap.Workflow.ActiveRunID)
	}
	if snap.Workflow.Phase != models.AgentPhasePlanReview {
		t.Fatalf("expected phase = plan-review, got %q", snap.Workflow.Phase)
	}

	savedState, _ := store.Agent.Load()
	savedWf := findWorkflow(&savedState, store.ProjectID, "t4")
	if savedWf.ActiveRunID != "" {
		t.Fatalf("persisted ActiveRunID = %q, want empty", savedWf.ActiveRunID)
	}
	if savedWf.Phase != models.AgentPhasePlanReview {
		t.Fatalf("persisted phase = %q, want plan-review", savedWf.Phase)
	}
	savedRun := findRun(&savedState, store.ProjectID, "orphaned-run-123")
	if savedRun.Status != models.AgentRunStatusInterrupted {
		t.Fatalf("persisted run status = %q, want interrupted", savedRun.Status)
	}
}
