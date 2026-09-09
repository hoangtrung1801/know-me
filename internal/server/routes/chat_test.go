package routes

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/hoangtrung1801/know-me/internal/models"
	"github.com/hoangtrung1801/know-me/internal/storage"
)

type recordingCodexChatRunner struct {
	startCalls  int
	stopCalls   int
	lastTaskID  string
	lastContent string
	startErr    error
	stopErr     error
}

func (r *recordingCodexChatRunner) StartChat(_ context.Context, _ *storage.Store, taskID, content string) error {
	r.startCalls++
	r.lastTaskID = taskID
	r.lastContent = content
	return r.startErr
}

func (r *recordingCodexChatRunner) StopChat(_ context.Context, _ *storage.Store, _ string) error {
	r.stopCalls++
	return r.stopErr
}

func setupCodexChatRouteTest(t *testing.T, runner *recordingCodexChatRunner) (*chi.Mux, *storage.Store, *models.ChatSession) {
	t.Helper()
	store := storage.NewProjectStore(t.TempDir(), "project01", filepath.Join(t.TempDir(), "repo"))
	if err := store.Init("project01"); err != nil {
		t.Fatal(err)
	}
	now := time.Now().UTC()
	if err := store.Tasks.Create(&models.Task{ID: "task01", ProjectID: store.ProjectID, Title: "Example", Status: "in-progress", Priority: "medium", CreatedAt: now, UpdatedAt: now}); err != nil {
		t.Fatal(err)
	}
	session := &models.ChatSession{ID: "chat01", AgentType: "codex", ProjectID: store.ProjectID, TaskID: "task01", Status: "idle", CreatedAt: now.Format(time.RFC3339Nano), UpdatedAt: now.Format(time.RFC3339Nano), Messages: []models.ChatMessage{}, MessageQueue: []string{}}
	if err := store.Chats.Save(session); err != nil {
		t.Fatal(err)
	}
	router := chi.NewRouter()
	(&ChatRoutes{store: store, sse: &fakeBroadcaster{}, codexChat: runner}).Register(router)
	return router, store, session
}

func TestCodexChatGetAndSendDelegatesToManager(t *testing.T) {
	runner := &recordingCodexChatRunner{}
	router, _, _ := setupCodexChatRouteTest(t, runner)
	req := httptest.NewRequest(http.MethodPost, "/chats/chat01/send", bytes.NewBufferString(`{"content":"inspect the test"}`))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)
	if w.Code != http.StatusAccepted {
		t.Fatalf("status = %d body = %s", w.Code, w.Body.String())
	}
	if runner.startCalls != 1 || runner.lastTaskID != "task01" || runner.lastContent != "inspect the test" {
		t.Fatalf("runner = %#v", runner)
	}

	w = httptest.NewRecorder()
	router.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/chats/chat01", nil))
	if w.Code != http.StatusOK {
		t.Fatalf("GET status = %d body = %s", w.Code, w.Body.String())
	}
}

func TestCodexChatRejectsSendDuringGatedRun(t *testing.T) {
	runner := &recordingCodexChatRunner{}
	router, store, _ := setupCodexChatRouteTest(t, runner)
	state := models.AgentState{Workflows: []models.AgentWorkflow{{ProjectID: store.ProjectID, TaskID: "task01", Phase: models.AgentPhaseImplementing, ActiveRunID: "run01"}}, Runs: []models.AgentRun{{ID: "run01", ProjectID: store.ProjectID, TaskID: "task01", Phase: models.AgentRunPhaseImplementation, Status: models.AgentRunStatusRunning}}}
	if err := store.Agent.Save(state); err != nil {
		t.Fatal(err)
	}
	req := httptest.NewRequest(http.MethodPost, "/chats/chat01/send", bytes.NewBufferString(`{"content":"send during run"}`))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)
	if w.Code != http.StatusConflict || runner.startCalls != 0 {
		t.Fatalf("status = %d calls = %d body = %s", w.Code, runner.startCalls, w.Body.String())
	}
}

func TestCodexChatCannotBeDeletedIndependently(t *testing.T) {
	router, store, _ := setupCodexChatRouteTest(t, &recordingCodexChatRunner{})
	w := httptest.NewRecorder()
	router.ServeHTTP(w, httptest.NewRequest(http.MethodDelete, "/chats/chat01", nil))
	if w.Code != http.StatusConflict {
		t.Fatalf("status = %d body = %s", w.Code, w.Body.String())
	}
	if _, err := store.Chats.Get("chat01"); err != nil {
		t.Fatal("task chat was deleted")
	}
}

func TestCodexChatIsolatedByProject(t *testing.T) {
	runner := &recordingCodexChatRunner{}
	router, store, _ := setupCodexChatRouteTest(t, runner)
	foreign := &models.ChatSession{ID: "foreign-chat", AgentType: "codex", ProjectID: "project02", TaskID: "task01", Status: "idle", Messages: []models.ChatMessage{}}
	if err := store.Chats.Save(foreign); err != nil {
		t.Fatal(err)
	}
	for _, method := range []string{http.MethodGet, http.MethodDelete} {
		w := httptest.NewRecorder()
		router.ServeHTTP(w, httptest.NewRequest(method, "/chats/foreign-chat", nil))
		if w.Code != http.StatusNotFound {
			t.Fatalf("%s status = %d body = %s", method, w.Code, w.Body.String())
		}
	}
	w := httptest.NewRecorder()
	router.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/chats", nil))
	if w.Code != http.StatusOK || bytes.Contains(w.Body.Bytes(), []byte("foreign-chat")) {
		t.Fatalf("list status = %d body = %s", w.Code, w.Body.String())
	}
}

func TestCodexChatStopDelegatesToManager(t *testing.T) {
	runner := &recordingCodexChatRunner{}
	router, _, _ := setupCodexChatRouteTest(t, runner)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, httptest.NewRequest(http.MethodPost, "/chats/chat01/stop", nil))
	if w.Code != http.StatusOK || runner.stopCalls != 1 {
		t.Fatalf("status = %d stops = %d body = %s", w.Code, runner.stopCalls, w.Body.String())
	}
	var body map[string]string
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil || body["status"] != "stopped" {
		t.Fatalf("body = %s", w.Body.String())
	}
}
