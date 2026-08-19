package routes

import (
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/hoangtrung1801/known-me/internal/agents/codex"
	"github.com/hoangtrung1801/known-me/internal/models"
	"github.com/hoangtrung1801/known-me/internal/storage"
)

func TestAgentRoutesRejectBlankReviewComment(t *testing.T) {
	router, store, _ := setupAgentRoutes(t)
	seedAgentTask(t, store, models.AgentPhaseCodeReview, "in-review")
	req := httptest.NewRequest(http.MethodPost, "/tasks/task01/agent/request-implementation-changes", strings.NewReader(`{"comment":" "}`))
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("status = %d body = %s", w.Code, w.Body.String())
	}
}

func TestAgentRoutesReturnSnapshotAndLog(t *testing.T) {
	router, store, _ := setupAgentRoutes(t)
	seedCompletedAgentRun(t, store, "task01", "run01", "log line\n")
	for _, path := range []string{"/tasks/task01/agent", "/tasks/task01/agent/runs/run01/log"} {
		w := httptest.NewRecorder()
		router.ServeHTTP(w, httptest.NewRequest(http.MethodGet, path, nil))
		if w.Code != http.StatusOK {
			t.Fatalf("%s status = %d body = %s", path, w.Code, w.Body.String())
		}
	}
}

func setupAgentRoutes(t *testing.T) (http.Handler, *storage.Store, *codex.Manager) {
	t.Helper()
	store := storage.NewProjectStore(t.TempDir(), "project01", t.TempDir())
	root := store.RepositoryRoot()
	cmd := exec.Command("git", "-C", root, "init")
	if output, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("git init: %v\n%s", err, output)
	}
	if err := store.Init("project01"); err != nil {
		t.Fatal(err)
	}
	now := time.Now().UTC()
	if err := store.Tasks.Create(&models.Task{ID: "task01", ProjectID: store.ProjectID, Title: "Example", Status: "in-progress", Priority: "medium", Labels: []string{}, CreatedAt: now, UpdatedAt: now}); err != nil {
		t.Fatal(err)
	}
	manager := codex.NewManager("fake-codex", nil)
	router := chi.NewRouter()
	(&AgentRoutes{store: store, agent: manager}).Register(router)
	return router, store, manager
}

func seedAgentTask(t *testing.T, store *storage.Store, phase models.AgentPhase, status string) {
	t.Helper()
	task, err := store.Tasks.Get("task01")
	if err != nil {
		t.Fatal(err)
	}
	if task.Status != status {
		task.Status = status
		if err := store.Tasks.Update(task); err != nil {
			t.Fatal(err)
		}
	}
	if err := store.Agent.Save(models.AgentState{Workflows: []models.AgentWorkflow{{ProjectID: store.ProjectID, TaskID: task.ID, Phase: phase}}}); err != nil {
		t.Fatal(err)
	}
}

func seedCompletedAgentRun(t *testing.T, store *storage.Store, taskID, runID, content string) {
	t.Helper()
	if err := store.Agent.Save(models.AgentState{
		Workflows: []models.AgentWorkflow{{ProjectID: store.ProjectID, TaskID: taskID, Phase: models.AgentPhaseCodeReview}},
		Runs:      []models.AgentRun{{ID: runID, ProjectID: store.ProjectID, TaskID: taskID, Status: models.AgentRunStatusSucceeded, StartedAt: time.Now().UTC()}},
	}); err != nil {
		t.Fatal(err)
	}
	path := store.Agent.LogPath(runID)
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte(content), 0o600); err != nil {
		t.Fatal(err)
	}
}
