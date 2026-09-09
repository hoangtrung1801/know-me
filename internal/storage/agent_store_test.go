package storage

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/hoangtrung1801/know-me/internal/models"
)

func testAgentStore(t *testing.T) *Store {
	t.Helper()
	return NewProjectStore(t.TempDir(), "alpha", t.TempDir())
}

func TestAgentRunLockSerializesStores(t *testing.T) {
	root := t.TempDir()
	first := NewProjectStore(root, "alpha", t.TempDir())
	second := NewProjectStore(root, "alpha", t.TempDir())

	lock, err := first.Agent.AcquireRunLock(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	defer lock.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Millisecond)
	defer cancel()
	if _, err := second.Agent.AcquireRunLock(ctx); !errors.Is(err, context.DeadlineExceeded) {
		t.Fatalf("second lock error = %v, want deadline exceeded", err)
	}
}

func TestAgentStoreScopesDuplicateTaskIDsByProject(t *testing.T) {
	root := t.TempDir()
	alpha := NewProjectStore(root, "alpha", t.TempDir())
	beta := NewProjectStore(root, "beta", t.TempDir())

	state := models.AgentState{Workflows: []models.AgentWorkflow{
		{ProjectID: "alpha", TaskID: "same01", Phase: models.AgentPhasePlanReview},
		{ProjectID: "beta", TaskID: "same01", Phase: models.AgentPhaseFixReady},
	}}
	if err := alpha.Agent.Save(state); err != nil {
		t.Fatal(err)
	}

	a, err := alpha.Agent.TaskSnapshot("same01")
	if err != nil {
		t.Fatal(err)
	}
	b, err := beta.Agent.TaskSnapshot("same01")
	if err != nil {
		t.Fatal(err)
	}
	if a.Workflow.Phase != models.AgentPhasePlanReview {
		t.Fatalf("alpha phase = %q", a.Workflow.Phase)
	}
	if b.Workflow.Phase != models.AgentPhaseFixReady {
		t.Fatalf("beta phase = %q", b.Workflow.Phase)
	}
}

func TestAgentStoreMarksRunInterruptedAndKeepsSessionResumable(t *testing.T) {
	store := testAgentStore(t)
	now := time.Date(2026, 8, 19, 3, 0, 0, 0, time.UTC)
	err := store.Agent.Save(models.AgentState{
		Workflows: []models.AgentWorkflow{{
			ProjectID:      store.ProjectID,
			TaskID:         "task01",
			Phase:          models.AgentPhaseImplementing,
			ActiveRunID:    "run01",
			CodexSessionID: "session01",
		}},
		Runs: []models.AgentRun{{
			ID:             "run01",
			ProjectID:      store.ProjectID,
			TaskID:         "task01",
			Phase:          models.AgentRunPhaseImplementation,
			Status:         models.AgentRunStatusRunning,
			CodexSessionID: "session01",
		}},
	})
	if err != nil {
		t.Fatal(err)
	}
	if err := store.Agent.MarkRunningInterrupted(now); err != nil {
		t.Fatal(err)
	}

	snapshot, err := store.Agent.TaskSnapshot("task01")
	if err != nil {
		t.Fatal(err)
	}
	if snapshot.Workflow.Phase != models.AgentPhaseInterrupted {
		t.Fatalf("phase = %q", snapshot.Workflow.Phase)
	}
	if snapshot.Workflow.ResumePhase != models.AgentRunPhaseImplementation {
		t.Fatalf("resume phase = %q", snapshot.Workflow.ResumePhase)
	}
	if snapshot.Workflow.CodexSessionID != "session01" || snapshot.Workflow.ActiveRunID != "" {
		t.Fatalf("workflow = %#v", snapshot.Workflow)
	}
	if snapshot.Runs[0].Status != models.AgentRunStatusInterrupted {
		t.Fatalf("run = %#v", snapshot.Runs[0])
	}
	if snapshot.AdapterState != "stopped" || !snapshot.Resumable || !snapshot.Interrupted {
		t.Fatalf("snapshot = %#v", snapshot)
	}
}

func TestAgentStoreRoundTripPreservesSessionFieldsAndEmptySlices(t *testing.T) {
	store := testAgentStore(t)
	now := time.Date(2026, 8, 19, 4, 0, 0, 0, time.UTC)
	state := models.AgentState{
		Workflows: []models.AgentWorkflow{{
			ProjectID:      store.ProjectID,
			TaskID:         "task01",
			Phase:          models.AgentPhaseInterrupted,
			CodexSessionID: "session01",
			ResumePhase:    models.AgentRunPhaseImplementation,
			UpdatedAt:      now,
		}},
		Runs: []models.AgentRun{{
			ID:             "run01",
			ProjectID:      store.ProjectID,
			TaskID:         "task01",
			Phase:          models.AgentRunPhaseImplementation,
			Status:         models.AgentRunStatusInterrupted,
			CodexSessionID: "session01",
			StartedAt:      now,
		}},
		ReviewComments: []models.ReviewComment{},
	}
	if err := store.Agent.Save(state); err != nil {
		t.Fatal(err)
	}

	got, err := store.Agent.Load()
	if err != nil {
		t.Fatal(err)
	}
	if len(got.Workflows) != 1 || len(got.Runs) != 1 {
		t.Fatalf("state = %#v", got)
	}
	if got.Workflows[0].CodexSessionID != "session01" || got.Workflows[0].ResumePhase != models.AgentRunPhaseImplementation {
		t.Fatalf("workflow = %#v", got.Workflows[0])
	}
	if got.Runs[0].CodexSessionID != "session01" {
		t.Fatalf("run = %#v", got.Runs[0])
	}
	if got.ReviewComments == nil || len(got.ReviewComments) != 0 {
		t.Fatalf("review comments = %#v", got.ReviewComments)
	}
}
