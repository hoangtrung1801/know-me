package codex

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"reflect"
	"slices"
	"sync"
	"testing"
	"time"

	"github.com/hoangtrung1801/known-me/internal/models"
	"github.com/hoangtrung1801/known-me/internal/storage"
)

func TestManagerRunsInvestigationImplementationAndReviewLoop(t *testing.T) {
	store := testAgentStore(t, "in-progress")
	manager := testManager(t, []PhaseResult{
		{ImplementationPlan: "1. Implement", ImplementationNotes: "Investigated", Summary: "planned", Tests: []string{}},
		{Summary: "implemented", Tests: []string{"go test ./..."}},
		{Summary: "fixed review", Tests: []string{"go test ./..."}},
	})

	mustAct(t, manager, store, "task01", ActionStartInvestigation, "")
	waitForPhase(t, manager, store, "task01", models.AgentPhasePlanReview)
	mustAct(t, manager, store, "task01", ActionApprovePlan, "")
	waitForPhase(t, manager, store, "task01", models.AgentPhaseCodeReview)

	mustAct(t, manager, store, "task01", ActionRequestImplementationChanges, "handle the edge case")
	snapshot := mustSnapshot(t, manager, store, "task01")
	if snapshot.Workflow.Phase != models.AgentPhaseFixReady || len(snapshot.ReviewComments) != 1 {
		t.Fatalf("snapshot = %#v", snapshot)
	}

	mustAct(t, manager, store, "task01", ActionStartFix, "")
	waitForPhase(t, manager, store, "task01", models.AgentPhaseCodeReview)
	mustAct(t, manager, store, "task01", ActionApproveImplementation, "")
	if task, _ := store.Tasks.Get("task01"); task.Status != "done" {
		t.Fatalf("status = %q", task.Status)
	}
}

func TestManagerRequiresCleanInitialImplementationButAllowsDirtyFix(t *testing.T) {
	store := testAgentStore(t, "in-progress")
	manager := testManager(t, []PhaseResult{{Summary: "fixed", Tests: []string{"go test ./..."}}})
	manager.dirtyFiles = func(context.Context, string) ([]string, error) {
		return []string{"internal/example.go"}, nil
	}
	seedAgentWorkflow(t, store, models.AgentWorkflow{
		ProjectID: store.ProjectID, TaskID: "task01", Phase: models.AgentPhasePlanReview,
	})

	_, _, err := manager.Act(context.Background(), store, "task01", ActionApprovePlan, "")
	if !errors.Is(err, ErrConflict) {
		t.Fatalf("approve-plan err = %v", err)
	}
	if phase := mustSnapshot(t, manager, store, "task01").Workflow.Phase; phase != models.AgentPhasePlanReview {
		t.Fatalf("phase after rejected implementation = %q", phase)
	}

	seedAgentWorkflow(t, store, models.AgentWorkflow{
		ProjectID: store.ProjectID, TaskID: "task01", Phase: models.AgentPhaseFixReady,
	})
	mustAct(t, manager, store, "task01", ActionStartFix, "")
	if files := mustSnapshot(t, manager, store, "task01").DirtyFiles; !slices.Equal(files, []string{"internal/example.go"}) {
		t.Fatalf("dirty files = %#v", files)
	}
	waitForPhase(t, manager, store, "task01", models.AgentPhaseCodeReview)
}

func TestManagerRejectsInvalidReviewActionsWithoutMutation(t *testing.T) {
	tests := []struct {
		name    string
		phase   models.AgentPhase
		action  Action
		comment string
		wantErr error
	}{
		{"wrong phase", models.AgentPhaseIdle, ActionApproveImplementation, "", ErrConflict},
		{"blank plan comment", models.AgentPhasePlanReview, ActionRequestPlanChanges, " ", ErrInvalid},
		{"blank implementation comment", models.AgentPhaseCodeReview, ActionRequestImplementationChanges, "\n", ErrInvalid},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			status := "in-progress"
			if tt.phase == models.AgentPhaseCodeReview {
				status = "in-review"
			}
			store := testAgentStore(t, status)
			manager := testManager(t, nil)
			seedAgentWorkflow(t, store, models.AgentWorkflow{ProjectID: store.ProjectID, TaskID: "task01", Phase: tt.phase})
			before := mustSnapshot(t, manager, store, "task01")
			_, _, err := manager.Act(context.Background(), store, "task01", tt.action, tt.comment)
			if !errors.Is(err, tt.wantErr) {
				t.Fatalf("err = %v, want %v", err, tt.wantErr)
			}
			after := mustSnapshot(t, manager, store, "task01")
			if !reflect.DeepEqual(before, after) {
				t.Fatalf("state mutated: before=%#v after=%#v", before, after)
			}
		})
	}
}

func TestManagerSerializesRunsPerProjectRoot(t *testing.T) {
	repositoryRoot := t.TempDir()
	first := testAgentStoreAt(t, repositoryRoot, "in-progress")
	second := storage.NewProjectStore(first.Root, first.ProjectID, repositoryRoot)
	manager := testManager(t, nil)
	started := make(chan struct{})
	release := make(chan struct{})
	manager.run = func(ctx context.Context, _ Request, _ func(StreamEvent)) (Result, error) {
		close(started)
		select {
		case <-release:
			return Result{Output: PhaseResult{ImplementationPlan: "plan", Summary: "done"}}, nil
		case <-ctx.Done():
			return Result{}, ctx.Err()
		}
	}

	mustAct(t, manager, first, "task01", ActionStartInvestigation, "")
	<-started
	if _, _, err := manager.Act(context.Background(), second, "task01", ActionStartInvestigation, ""); !errors.Is(err, ErrConflict) {
		t.Fatalf("second run err = %v", err)
	}
	close(release)
	waitForPhase(t, manager, first, "task01", models.AgentPhasePlanReview)
}

func TestManagersSerializeRunsAcrossInstances(t *testing.T) {
	repositoryRoot := t.TempDir()
	first := testAgentStoreAt(t, repositoryRoot, "in-progress")
	second := storage.NewProjectStore(first.Root, first.ProjectID, repositoryRoot)
	managerA := testManager(t, nil)
	managerB := testManager(t, nil)
	started := make(chan struct{})
	release := make(chan struct{})
	managerA.run = func(ctx context.Context, _ Request, _ func(StreamEvent)) (Result, error) {
		close(started)
		select {
		case <-release:
			return Result{Output: PhaseResult{ImplementationPlan: "plan", Summary: "done"}}, nil
		case <-ctx.Done():
			return Result{}, ctx.Err()
		}
	}

	mustAct(t, managerA, first, "task01", ActionStartInvestigation, "")
	<-started
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Millisecond)
	defer cancel()
	if _, _, err := managerB.Act(ctx, second, "task01", ActionStartInvestigation, ""); !errors.Is(err, ErrConflict) {
		t.Fatalf("second manager run err = %v, want conflict", err)
	}
	close(release)
	waitForPhase(t, managerA, first, "task01", models.AgentPhasePlanReview)
}

func TestManagerIgnoresStaleRunCompletion(t *testing.T) {
	store := testAgentStore(t, "in-progress")
	manager := testManager(t, nil)
	started := make(chan struct{})
	release := make(chan struct{})
	manager.run = func(context.Context, Request, func(StreamEvent)) (Result, error) {
		close(started)
		<-release
		return Result{Output: PhaseResult{ImplementationPlan: "stale plan", Summary: "stale result"}}, nil
	}

	mustAct(t, manager, store, "task01", ActionStartInvestigation, "")
	<-started
	state, err := store.Agent.Load()
	if err != nil {
		t.Fatal(err)
	}
	state.Workflows[0].Phase = models.AgentPhaseIdle
	state.Workflows[0].ActiveRunID = ""
	state.Runs[0].Status = models.AgentRunStatusInterrupted
	if err := store.Agent.Save(state); err != nil {
		t.Fatal(err)
	}
	close(release)

	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		snapshot := mustSnapshot(t, manager, store, "task01")
		if snapshot.Runs[0].Status == models.AgentRunStatusInterrupted {
			if task, _ := store.Tasks.Get("task01"); task.ImplementationPlan != "" {
				t.Fatalf("stale result changed task plan: %q", task.ImplementationPlan)
			}
			return
		}
		time.Sleep(5 * time.Millisecond)
	}
	t.Fatalf("stale run was not preserved: %#v", mustSnapshot(t, manager, store, "task01"))
}

func TestManagerFailureRestoresPhaseAndTaskStatus(t *testing.T) {
	for _, test := range []struct {
		name      string
		phase     models.AgentPhase
		action    Action
		wantPhase models.AgentPhase
	}{
		{"investigation", models.AgentPhaseIdle, ActionStartInvestigation, models.AgentPhaseIdle},
		{"implementation", models.AgentPhasePlanReview, ActionApprovePlan, models.AgentPhasePlanReview},
	} {
		t.Run(test.name, func(t *testing.T) {
			store := testAgentStore(t, "in-progress")
			manager := testManager(t, nil)
			seedAgentWorkflow(t, store, models.AgentWorkflow{ProjectID: store.ProjectID, TaskID: "task01", Phase: test.phase})
			manager.run = func(context.Context, Request, func(StreamEvent)) (Result, error) {
				return Result{}, errors.New("fake failure")
			}
			mustAct(t, manager, store, "task01", test.action, "")
			waitForPhase(t, manager, store, "task01", test.wantPhase)
			if task, _ := store.Tasks.Get("task01"); task.Status != "in-progress" {
				t.Fatalf("status = %q", task.Status)
			}
			snapshot := mustSnapshot(t, manager, store, "task01")
			if snapshot.Runs[len(snapshot.Runs)-1].Status != models.AgentRunStatusFailed {
				t.Fatalf("run = %#v", snapshot.Runs[len(snapshot.Runs)-1])
			}
		})
	}
}

func TestManagerCancellationRecordsCancelled(t *testing.T) {
	store := testAgentStore(t, "in-progress")
	manager := testManager(t, nil)
	started := make(chan struct{})
	manager.run = func(ctx context.Context, _ Request, _ func(StreamEvent)) (Result, error) {
		close(started)
		<-ctx.Done()
		return Result{}, ctx.Err()
	}
	mustAct(t, manager, store, "task01", ActionStartInvestigation, "")
	<-started
	mustAct(t, manager, store, "task01", ActionCancel, "")
	waitForRunStatus(t, manager, store, "task01", models.AgentRunStatusCancelled)
}

func TestManagerReadLogRejectsRunFromAnotherTask(t *testing.T) {
	store := testAgentStore(t, "in-progress")
	state := models.AgentState{Runs: []models.AgentRun{
		{ID: "run01", ProjectID: store.ProjectID, TaskID: "task01", Status: models.AgentRunStatusSucceeded},
		{ID: "run02", ProjectID: store.ProjectID, TaskID: "task02", Status: models.AgentRunStatusSucceeded},
	}}
	if err := store.Agent.Save(state); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(filepath.Dir(store.Agent.LogPath("run01")), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(store.Agent.LogPath("run01"), []byte("task one\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	manager := testManager(t, nil)
	content, err := manager.ReadLog(store, "task01", "run01")
	if err != nil || content != "task one\n" {
		t.Fatalf("content=%q err=%v", content, err)
	}
	if _, err := manager.ReadLog(store, "task02", "run01"); !errors.Is(err, ErrConflict) {
		t.Fatalf("cross-task err = %v", err)
	}
}

func testAgentStore(t *testing.T, status string) *storage.Store {
	return testAgentStoreAt(t, t.TempDir(), status)
}

func testAgentStoreAt(t *testing.T, repositoryRoot, status string) *storage.Store {
	t.Helper()
	store := storage.NewProjectStore(t.TempDir(), "project01", repositoryRoot)
	if err := store.Init("project01"); err != nil {
		t.Fatal(err)
	}
	now := time.Now().UTC()
	if err := store.Tasks.Create(&models.Task{ID: "task01", ProjectID: store.ProjectID, Title: "Example task", Description: "Do the example", Status: status, Priority: "medium", Labels: []string{}, CreatedAt: now, UpdatedAt: now}); err != nil {
		t.Fatal(err)
	}
	return store
}

func testManager(t *testing.T, results []PhaseResult) *Manager {
	t.Helper()
	manager := NewManager("fake-codex", nil)
	manager.detect = func(context.Context, string) Status { return Status{Installed: true, LoggedIn: true} }
	manager.dirtyFiles = func(context.Context, string) ([]string, error) { return []string{}, nil }
	var mu sync.Mutex
	index := 0
	manager.run = func(context.Context, Request, func(StreamEvent)) (Result, error) {
		mu.Lock()
		defer mu.Unlock()
		if index >= len(results) {
			return Result{Output: PhaseResult{Summary: "done"}}, nil
		}
		result := results[index]
		index++
		return Result{Output: result}, nil
	}
	return manager
}

func mustAct(t *testing.T, manager *Manager, store *storage.Store, taskID string, action Action, comment string) {
	t.Helper()
	if _, _, err := manager.Act(context.Background(), store, taskID, action, comment); err != nil {
		t.Fatalf("action %s: %v", action, err)
	}
}

func mustSnapshot(t *testing.T, manager *Manager, store *storage.Store, taskID string) models.AgentTaskSnapshot {
	t.Helper()
	snapshot, err := manager.Snapshot(context.Background(), store, taskID)
	if err != nil {
		t.Fatal(err)
	}
	return snapshot
}

func seedAgentWorkflow(t *testing.T, store *storage.Store, workflow models.AgentWorkflow) {
	t.Helper()
	state, err := store.Agent.Load()
	if err != nil {
		t.Fatal(err)
	}
	for i := range state.Workflows {
		if state.Workflows[i].ProjectID == workflow.ProjectID && state.Workflows[i].TaskID == workflow.TaskID {
			state.Workflows[i] = workflow
			mustSaveAgentState(t, store, state)
			return
		}
	}
	state.Workflows = append(state.Workflows, workflow)
	mustSaveAgentState(t, store, state)
}

func mustSaveAgentState(t *testing.T, store *storage.Store, state models.AgentState) {
	t.Helper()
	if err := store.Agent.Save(state); err != nil {
		t.Fatal(err)
	}
}

func waitForPhase(t *testing.T, manager *Manager, store *storage.Store, taskID string, want models.AgentPhase) {
	t.Helper()
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		snapshot := mustSnapshot(t, manager, store, taskID)
		if snapshot.Workflow.Phase == want && snapshot.Workflow.ActiveRunID == "" {
			return
		}
		time.Sleep(5 * time.Millisecond)
	}
	t.Fatalf("phase did not reach %q: %#v", want, mustSnapshot(t, manager, store, taskID))
}

func waitForRunStatus(t *testing.T, manager *Manager, store *storage.Store, taskID string, want models.AgentRunStatus) {
	t.Helper()
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		snapshot := mustSnapshot(t, manager, store, taskID)
		if len(snapshot.Runs) > 0 && snapshot.Runs[len(snapshot.Runs)-1].Status == want && snapshot.Workflow.ActiveRunID == "" {
			return
		}
		time.Sleep(5 * time.Millisecond)
	}
	t.Fatalf("run did not reach %q: %#v", want, mustSnapshot(t, manager, store, taskID))
}
