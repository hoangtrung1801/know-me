package storage

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/hoangtrung1801/known-me/internal/models"
)

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

func TestAgentStoreMarksRunningRunsInterrupted(t *testing.T) {
	store := NewProjectStore(t.TempDir(), "alpha", t.TempDir())
	started := time.Date(2026, 8, 19, 2, 0, 0, 0, time.UTC)
	finished := started.Add(time.Minute)
	state := models.AgentState{
		Workflows: []models.AgentWorkflow{{ProjectID: "alpha", TaskID: "task01", Phase: models.AgentPhaseImplementing, ActiveRunID: "run01"}},
		Runs:      []models.AgentRun{{ID: "run01", ProjectID: "alpha", TaskID: "task01", Phase: models.AgentRunPhaseImplementation, Status: models.AgentRunStatusRunning, StartedAt: started}},
	}
	if err := store.Agent.Save(state); err != nil {
		t.Fatal(err)
	}
	if err := store.Agent.MarkRunningInterrupted(finished); err != nil {
		t.Fatal(err)
	}

	snapshot, err := store.Agent.TaskSnapshot("task01")
	if err != nil {
		t.Fatal(err)
	}
	if snapshot.Workflow.ActiveRunID != "" || snapshot.Workflow.Phase != models.AgentPhasePlanReview {
		t.Fatalf("workflow = %#v", snapshot.Workflow)
	}
	if snapshot.Runs[0].Status != models.AgentRunStatusInterrupted {
		t.Fatalf("run = %#v", snapshot.Runs[0])
	}
}
