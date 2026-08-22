package routes

import (
	"bufio"
	"encoding/json"
	"fmt"
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
	"github.com/hoangtrung1801/known-me/internal/registry"
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

func TestAgentRoutesUseRegisteredRepositoryPath(t *testing.T) {
	home, repositoryRoot := t.TempDir(), t.TempDir()
	globalRoot := filepath.Join(home, ".knowns")
	registryStore := registry.NewRegistryWithPath(filepath.Join(globalRoot, "registry.json"))
	if err := registryStore.Load(); err != nil {
		t.Fatal(err)
	}
	project, err := registryStore.Create("Launch")
	if err != nil {
		t.Fatal(err)
	}
	if err := registryStore.SetPath(project.ID, repositoryRoot); err != nil {
		t.Fatal(err)
	}
	store := storage.NewProjectStore(globalRoot, project.ID, "")
	if err := store.Init(project.Name); err != nil {
		t.Fatal(err)
	}
	now := time.Now().UTC()
	if err := store.Tasks.Create(&models.Task{ID: "task01", ProjectID: project.ID, Title: "Example", Status: "in-progress", Priority: "medium", CreatedAt: now, UpdatedAt: now}); err != nil {
		t.Fatal(err)
	}
	manager := storage.NewManager(store, registryStore)
	routes := NewAgentRoutes(store, manager, nil)
	resolved, _, err := routes.taskStore(httptest.NewRequest(http.MethodGet, "/tasks/task01/agent", nil), "task01")
	if err != nil {
		t.Fatal(err)
	}
	wantRoot, err := filepath.EvalSymlinks(repositoryRoot)
	if err != nil {
		t.Fatal(err)
	}
	if got := resolved.RepositoryRoot(); got != wantRoot {
		t.Fatalf("repository root = %q, want %q", got, wantRoot)
	}
}

func TestAgentRoutesExposeACPResumeStateAndStartResume(t *testing.T) {
	router, store, _ := setupAgentRoutes(t)
	seedAgentResumeWorkflow(t, store)

	w := httptest.NewRecorder()
	router.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/tasks/task01/agent", nil))
	if w.Code != http.StatusOK {
		t.Fatalf("snapshot status = %d body = %s", w.Code, w.Body.String())
	}
	var snapshot models.AgentTaskSnapshot
	if err := json.Unmarshal(w.Body.Bytes(), &snapshot); err != nil {
		t.Fatal(err)
	}
	if snapshot.Workflow.CodexSessionID != "session-1" || !snapshot.Resumable || !snapshot.Interrupted || snapshot.AdapterState != "stopped" {
		t.Fatalf("snapshot = %#v", snapshot)
	}

	w = httptest.NewRecorder()
	router.ServeHTTP(w, httptest.NewRequest(http.MethodPost, "/tasks/task01/agent/resume", nil))
	if w.Code != http.StatusAccepted {
		t.Fatalf("resume status = %d body = %s", w.Code, w.Body.String())
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
	command, err := json.Marshal([]string{os.Args[0], "-test.run=^TestAgentACPHelperProcess$", "--"})
	if err != nil {
		t.Fatal(err)
	}
	t.Setenv("KNOWS_CODEX_ACP_COMMAND", string(command))
	t.Setenv("GO_WANT_AGENT_ACP_HELPER_PROCESS", "1")
	manager := codex.NewManager("", nil)
	router := chi.NewRouter()
	(&AgentRoutes{store: store, agent: manager}).Register(router)
	return router, store, manager
}

func seedAgentResumeWorkflow(t *testing.T, store *storage.Store) {
	t.Helper()
	if err := store.Agent.Save(models.AgentState{Workflows: []models.AgentWorkflow{{
		ProjectID: store.ProjectID, TaskID: "task01", Phase: models.AgentPhaseInterrupted,
		CodexSessionID: "session-1", ResumePhase: models.AgentRunPhaseInvestigation,
	}}}); err != nil {
		t.Fatal(err)
	}
}

func TestAgentACPHelperProcess(t *testing.T) {
	if os.Getenv("GO_WANT_AGENT_ACP_HELPER_PROCESS") != "1" {
		return
	}
	for _, arg := range os.Args[1:] {
		if arg == "--version" {
			fmt.Fprintln(os.Stdout, "codex-acp test")
			return
		}
	}
	scanner := bufio.NewScanner(os.Stdin)
	for scanner.Scan() {
		var message struct {
			ID     any             `json:"id"`
			Method string          `json:"method"`
			Params json.RawMessage `json:"params"`
		}
		if err := json.Unmarshal(scanner.Bytes(), &message); err != nil {
			os.Exit(2)
		}
		write := func(result any) {
			_ = json.NewEncoder(os.Stdout).Encode(map[string]any{"jsonrpc": "2.0", "id": message.ID, "result": result})
		}
		switch message.Method {
		case "initialize":
			write(map[string]any{"protocolVersion": 1})
		case "session/load", "session/new":
			write(map[string]any{"sessionId": "session-1"})
		case "session/set_mode":
			write(map[string]any{})
		case "session/prompt":
			var params struct {
				SessionID string `json:"sessionId"`
			}
			_ = json.Unmarshal(message.Params, &params)
			_ = json.NewEncoder(os.Stdout).Encode(map[string]any{
				"jsonrpc": "2.0", "method": "session/update",
				"params": map[string]any{"sessionId": params.SessionID, "update": map[string]any{
					"sessionUpdate": "agent_message_chunk",
					"content":       map[string]any{"type": "text", "text": `{"implementationPlan":"plan","implementationNotes":"notes","summary":"resumed","tests":[]}`},
				}},
			})
			write(map[string]any{"stopReason": "completed"})
		case "session/close":
			write(map[string]any{})
			return
		}
	}
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
