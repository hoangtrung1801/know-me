package codex

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/hoangtrung1801/known-me/internal/models"
	"github.com/hoangtrung1801/known-me/internal/search"
	"github.com/hoangtrung1801/known-me/internal/storage"
	"github.com/hoangtrung1801/known-me/internal/tasklifecycle"
)

type Action string

const (
	ActionStartInvestigation           Action = "start-investigation"
	ActionApprovePlan                  Action = "approve-plan"
	ActionRequestPlanChanges           Action = "request-plan-changes"
	ActionApproveImplementation        Action = "approve-implementation"
	ActionRequestImplementationChanges Action = "request-implementation-changes"
	ActionStartFix                     Action = "start-fix"
	ActionCancel                       Action = "cancel"
)

var (
	ErrInvalid  = errors.New("invalid agent action")
	ErrConflict = errors.New("agent action conflict")
	ErrNotFound = errors.New("agent task or run not found")
)

type Event struct {
	Type        string `json:"type"`
	ProjectID   string `json:"projectId"`
	TaskID      string `json:"taskId"`
	RunID       string `json:"runId,omitempty"`
	Message     string `json:"message,omitempty"`
	TaskChanged bool   `json:"taskChanged,omitempty"`
}

type Manager struct {
	mu         sync.Mutex
	executable string
	active     map[string]activeRun
	emit       func(Event)
	run        func(context.Context, Request, func(StreamEvent)) (Result, error)
	detect     func(context.Context, string) Status
	dirtyFiles func(context.Context, string) ([]string, error)
	now        func() time.Time
}

type activeRun struct {
	cancel context.CancelFunc
	lock   *storage.AgentRunLock
}

func NewManager(executable string, emit func(Event)) *Manager {
	runner := Runner{Executable: executable}
	return &Manager{
		executable: executable,
		active:     make(map[string]activeRun),
		emit:       emit,
		run:        runner.Run,
		detect:     Detect,
		dirtyFiles: DirtyFiles,
		now:        func() time.Time { return time.Now().UTC() },
	}
}

func (m *Manager) Status(ctx context.Context, _ *storage.Store) Status {
	m.mu.Lock()
	detect := m.detect
	executable := m.executable
	m.mu.Unlock()
	return detect(ctx, executable)
}

func (m *Manager) Snapshot(ctx context.Context, store *storage.Store, taskID string) (models.AgentTaskSnapshot, error) {
	if store == nil || store.Agent == nil {
		return models.AgentTaskSnapshot{}, errors.New("agent store is unavailable")
	}
	if _, err := store.Tasks.Get(taskID); err != nil {
		return models.AgentTaskSnapshot{}, fmt.Errorf("%w: %v", ErrNotFound, err)
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.snapshotLocked(ctx, store, taskID)
}

func (m *Manager) Act(ctx context.Context, store *storage.Store, taskID string, action Action, comment string) (models.AgentTaskSnapshot, bool, error) {
	if store == nil || store.Agent == nil {
		return models.AgentTaskSnapshot{}, false, errors.New("agent store is unavailable")
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	task, err := store.Tasks.Get(taskID)
	if err != nil {
		return models.AgentTaskSnapshot{}, false, fmt.Errorf("%w: %v", ErrNotFound, err)
	}
	state, err := store.Agent.Load()
	if err != nil {
		return models.AgentTaskSnapshot{}, false, err
	}
	now := m.now().UTC()
	workflow := ensureWorkflow(&state, store.ProjectID, taskID, now)

	switch action {
	case ActionStartInvestigation:
		if task.Status != "in-progress" || workflow.Phase != models.AgentPhaseIdle || workflow.ActiveRunID != "" {
			return models.AgentTaskSnapshot{}, false, fmt.Errorf("%w: investigation requires an idle in-progress task", ErrConflict)
		}
		return m.startRunLocked(ctx, store, task, &state, workflow, models.AgentRunPhaseInvestigation, models.AgentPhaseInvestigating, models.AgentPhaseIdle)
	case ActionApprovePlan:
		if task.Status != "in-progress" || workflow.Phase != models.AgentPhasePlanReview || workflow.ActiveRunID != "" {
			return models.AgentTaskSnapshot{}, false, fmt.Errorf("%w: plan is not ready for approval", ErrConflict)
		}
		files, err := m.dirtyFiles(ctx, store.RepositoryRoot())
		if err != nil {
			return models.AgentTaskSnapshot{}, false, fmt.Errorf("%w: inspect implementation workspace: %v", ErrConflict, err)
		}
		if len(files) > 0 {
			return models.AgentTaskSnapshot{}, false, fmt.Errorf("%w: implementation workspace is dirty: %s", ErrConflict, strings.Join(files, ", "))
		}
		return m.startRunLocked(ctx, store, task, &state, workflow, models.AgentRunPhaseImplementation, models.AgentPhaseImplementing, models.AgentPhasePlanReview)
	case ActionRequestPlanChanges:
		if workflow.Phase != models.AgentPhasePlanReview || workflow.ActiveRunID != "" {
			return models.AgentTaskSnapshot{}, false, fmt.Errorf("%w: plan is not ready for feedback", ErrConflict)
		}
		if strings.TrimSpace(comment) == "" {
			return models.AgentTaskSnapshot{}, false, fmt.Errorf("%w: review comment is required", ErrInvalid)
		}
		agentLock, err := store.Agent.AcquireRunLock(ctx)
		if err != nil {
			return models.AgentTaskSnapshot{}, false, fmt.Errorf("%w: acquire workspace run lock: %v", ErrConflict, err)
		}
		defer agentLock.Close()
		state.ReviewComments = append(state.ReviewComments, models.ReviewComment{
			ID: uuid.NewString(), ProjectID: store.ProjectID, TaskID: taskID,
			Stage: models.ReviewStagePlan, Body: strings.TrimSpace(comment), CreatedAt: now,
		})
		workflow.Phase = models.AgentPhaseIdle
		workflow.UpdatedAt = now
		if err := store.Agent.Save(state); err != nil {
			return models.AgentTaskSnapshot{}, false, err
		}
		m.emitUpdated(Event{ProjectID: store.ProjectID, TaskID: taskID})
		snapshot, err := m.snapshotLocked(ctx, store, taskID)
		return snapshot, false, err
	case ActionApproveImplementation:
		if task.Status != "in-review" || workflow.Phase != models.AgentPhaseCodeReview || workflow.ActiveRunID != "" {
			return models.AgentTaskSnapshot{}, false, fmt.Errorf("%w: implementation is not ready for approval", ErrConflict)
		}
		agentLock, err := store.Agent.AcquireRunLock(ctx)
		if err != nil {
			return models.AgentTaskSnapshot{}, false, fmt.Errorf("%w: acquire workspace run lock: %v", ErrConflict, err)
		}
		defer agentLock.Close()
		previousStatus := task.Status
		if _, err := m.updateTask(ctx, store, taskID, func(task *models.Task) error {
			if task.Status != "in-review" {
				return fmt.Errorf("%w: task status changed before final approval", ErrConflict)
			}
			task.Status = "done"
			return nil
		}); err != nil {
			return models.AgentTaskSnapshot{}, false, err
		}
		workflow.Phase = models.AgentPhaseCompleted
		workflow.UpdatedAt = now
		if err := store.Agent.Save(state); err != nil {
			_, rollbackErr := m.updateTask(context.Background(), store, taskID, func(task *models.Task) error {
				if task.Status == "done" {
					task.Status = previousStatus
				}
				return nil
			})
			if rollbackErr != nil {
				return models.AgentTaskSnapshot{}, false, fmt.Errorf("save agent state: %v; rollback task: %w", err, rollbackErr)
			}
			return models.AgentTaskSnapshot{}, false, err
		}
		m.emitUpdated(Event{ProjectID: store.ProjectID, TaskID: taskID, TaskChanged: true})
		snapshot, err := m.snapshotLocked(ctx, store, taskID)
		return snapshot, false, err
	case ActionRequestImplementationChanges:
		if task.Status != "in-review" || workflow.Phase != models.AgentPhaseCodeReview || workflow.ActiveRunID != "" {
			return models.AgentTaskSnapshot{}, false, fmt.Errorf("%w: implementation is not ready for feedback", ErrConflict)
		}
		if strings.TrimSpace(comment) == "" {
			return models.AgentTaskSnapshot{}, false, fmt.Errorf("%w: review comment is required", ErrInvalid)
		}
		agentLock, err := store.Agent.AcquireRunLock(ctx)
		if err != nil {
			return models.AgentTaskSnapshot{}, false, fmt.Errorf("%w: acquire workspace run lock: %v", ErrConflict, err)
		}
		defer agentLock.Close()
		previousStatus := task.Status
		if _, err := m.updateTask(ctx, store, taskID, func(task *models.Task) error {
			if task.Status != "in-review" {
				return fmt.Errorf("%w: task status changed before implementation feedback", ErrConflict)
			}
			task.Status = "in-progress"
			return nil
		}); err != nil {
			return models.AgentTaskSnapshot{}, false, err
		}
		state.ReviewComments = append(state.ReviewComments, models.ReviewComment{
			ID: uuid.NewString(), ProjectID: store.ProjectID, TaskID: taskID,
			Stage: models.ReviewStageImplementation, Body: strings.TrimSpace(comment), CreatedAt: now,
		})
		workflow.Phase = models.AgentPhaseFixReady
		workflow.UpdatedAt = now
		if err := store.Agent.Save(state); err != nil {
			_, rollbackErr := m.updateTask(context.Background(), store, taskID, func(task *models.Task) error {
				if task.Status == "in-progress" {
					task.Status = previousStatus
				}
				return nil
			})
			if rollbackErr != nil {
				return models.AgentTaskSnapshot{}, false, fmt.Errorf("save agent state: %v; rollback task: %w", err, rollbackErr)
			}
			return models.AgentTaskSnapshot{}, false, err
		}
		m.emitUpdated(Event{ProjectID: store.ProjectID, TaskID: taskID, TaskChanged: true})
		snapshot, err := m.snapshotLocked(ctx, store, taskID)
		return snapshot, false, err
	case ActionStartFix:
		if task.Status != "in-progress" || workflow.Phase != models.AgentPhaseFixReady || workflow.ActiveRunID != "" {
			return models.AgentTaskSnapshot{}, false, fmt.Errorf("%w: task is not ready for a fix", ErrConflict)
		}
		return m.startRunLocked(ctx, store, task, &state, workflow, models.AgentRunPhaseFix, models.AgentPhaseImplementing, models.AgentPhaseFixReady)
	case ActionCancel:
		if workflow.ActiveRunID == "" {
			return models.AgentTaskSnapshot{}, false, fmt.Errorf("%w: no active run", ErrConflict)
		}
		active, ok := m.active[store.RepositoryRoot()]
		if !ok {
			return models.AgentTaskSnapshot{}, false, fmt.Errorf("%w: active run is not owned by this server", ErrConflict)
		}
		active.cancel()
		snapshot, err := m.snapshotLocked(ctx, store, taskID)
		return snapshot, false, err
	default:
		return models.AgentTaskSnapshot{}, false, fmt.Errorf("%w: unknown action %q", ErrInvalid, action)
	}
}

func (m *Manager) ReadLog(store *storage.Store, taskID, runID string) (string, error) {
	if store == nil || store.Agent == nil {
		return "", errors.New("agent store is unavailable")
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	state, err := store.Agent.Load()
	if err != nil {
		return "", err
	}
	var run *models.AgentRun
	for i := range state.Runs {
		candidate := &state.Runs[i]
		if candidate.ProjectID == store.ProjectID && candidate.ID == runID {
			if candidate.TaskID != taskID {
				return "", fmt.Errorf("%w: run %q belongs to another task", ErrConflict, runID)
			}
			run = candidate
			break
		}
	}
	if run == nil {
		return "", fmt.Errorf("%w: run %q", ErrNotFound, runID)
	}
	content, err := readLog(store.Agent.LogPath(run.ID))
	if errors.Is(err, os.ErrNotExist) {
		return "", fmt.Errorf("%w: run log %q", ErrNotFound, runID)
	}
	return content, err
}

func (m *Manager) Close() {
	m.mu.Lock()
	defer m.mu.Unlock()
	for _, active := range m.active {
		active.cancel()
	}
}

func (m *Manager) startRunLocked(ctx context.Context, store *storage.Store, task *models.Task, state *models.AgentState, workflow *models.AgentWorkflow, runPhase models.AgentRunPhase, runningPhase, restorePhase models.AgentPhase) (models.AgentTaskSnapshot, bool, error) {
	if store.RepositoryRoot() == "" {
		return models.AgentTaskSnapshot{}, false, fmt.Errorf("%w: project repository root is unavailable", ErrConflict)
	}
	status := m.detect(ctx, m.executable)
	if !status.Installed || !status.LoggedIn {
		return models.AgentTaskSnapshot{}, false, fmt.Errorf("%w: Codex is not installed or logged in", ErrConflict)
	}
	root := store.RepositoryRoot()
	if _, exists := m.active[root]; exists {
		return models.AgentTaskSnapshot{}, false, fmt.Errorf("%w: another Codex run is active for this project", ErrConflict)
	}
	runLock, err := store.Agent.AcquireRunLock(ctx)
	if err != nil {
		return models.AgentTaskSnapshot{}, false, fmt.Errorf("%w: another Codex run is active for this project: %v", ErrConflict, err)
	}
	tempDir, err := os.MkdirTemp("", "knowns-codex-run-")
	if err != nil {
		_ = runLock.Close()
		return models.AgentTaskSnapshot{}, false, fmt.Errorf("create Codex run directory: %w", err)
	}
	runID := uuid.NewString()
	now := m.now().UTC()
	run := models.AgentRun{
		ID: runID, ProjectID: store.ProjectID, TaskID: task.ID, Phase: runPhase,
		Status: models.AgentRunStatusRunning, StartedAt: now, LogPath: store.Agent.LogPath(runID),
	}
	workflow.Phase = runningPhase
	workflow.ActiveRunID = runID
	workflow.UpdatedAt = now
	state.Runs = append(state.Runs, run)
	if err := store.Agent.Save(*state); err != nil {
		_ = os.RemoveAll(tempDir)
		_ = runLock.Close()
		return models.AgentTaskSnapshot{}, false, err
	}
	prompt := buildPrompt(task, *state, runPhase)
	runCtx, cancel := context.WithCancel(context.Background())
	m.active[root] = activeRun{cancel: cancel, lock: runLock}
	go m.execute(runCtx, store, runID, task.ID, root, tempDir, prompt, runPhase, restorePhase, runLock)
	snapshot, err := m.snapshotLocked(ctx, store, task.ID)
	return snapshot, true, err
}

func (m *Manager) execute(ctx context.Context, store *storage.Store, runID, taskID, root, tempDir, prompt string, runPhase models.AgentRunPhase, restorePhase models.AgentPhase, runLock *storage.AgentRunLock) {
	defer os.RemoveAll(tempDir)
	defer runLock.Close()
	result, runErr := m.run(ctx, Request{
		Root: root, Prompt: prompt, Phase: runPhase,
		SchemaPath: filepath.Join(tempDir, "schema.json"), ResultPath: filepath.Join(tempDir, "result.json"),
		LogPath: store.Agent.LogPath(runID),
	}, func(event StreamEvent) {
		m.mu.Lock()
		m.updateThreadID(store, runID, event.ThreadID)
		m.mu.Unlock()
		if event.Message != "" {
			m.emitUpdated(Event{ProjectID: store.ProjectID, TaskID: taskID, RunID: runID, Type: "progress", Message: event.Message})
		}
	})

	m.mu.Lock()
	defer m.mu.Unlock()
	state, err := store.Agent.Load()
	if err != nil {
		delete(m.active, root)
		return
	}
	run := findRun(&state, store.ProjectID, taskID, runID)
	workflow := findWorkflow(&state, store.ProjectID, taskID)
	if run == nil || workflow == nil {
		delete(m.active, root)
		return
	}
	if run.Status != models.AgentRunStatusRunning || workflow.ActiveRunID != runID {
		delete(m.active, root)
		return
	}
	now := m.now().UTC()
	delete(m.active, root)
	run.FinishedAt = &now
	exitCode := result.ExitCode
	run.ExitCode = &exitCode
	if runErr != nil {
		if errors.Is(runErr, context.Canceled) || ctx.Err() != nil {
			run.Status = models.AgentRunStatusCancelled
			run.Error = "Codex run cancelled"
		} else {
			run.Status = models.AgentRunStatusFailed
			run.Error = runErr.Error()
		}
		workflow.Phase = restorePhase
		workflow.ActiveRunID = ""
		workflow.UpdatedAt = now
		if saveErr := store.Agent.Save(state); saveErr != nil {
			m.emitUpdated(Event{ProjectID: store.ProjectID, TaskID: taskID, RunID: runID, Type: "error", Message: "save Codex run state: " + saveErr.Error()})
			return
		}
		m.emitUpdated(Event{ProjectID: store.ProjectID, TaskID: taskID, RunID: runID, Type: "updated"})
		return
	}

	var previousTask *models.Task
	if task, taskErr := store.Tasks.Get(taskID); taskErr == nil {
		copy := *task
		previousTask = &copy
	}
	var updateErr error
	if runPhase == models.AgentRunPhaseInvestigation {
		_, updateErr = m.updateTask(context.Background(), store, taskID, func(task *models.Task) error {
			task.ImplementationPlan = result.Output.ImplementationPlan
			task.ImplementationNotes = result.Output.ImplementationNotes
			return nil
		})
	} else {
		_, updateErr = m.updateTask(context.Background(), store, taskID, func(task *models.Task) error {
			if task.Status != "in-progress" {
				return fmt.Errorf("%w: task status changed before Codex completed", ErrConflict)
			}
			task.Status = "in-review"
			return nil
		})
	}
	if updateErr != nil {
		run.Status = models.AgentRunStatusFailed
		run.Error = updateErr.Error()
		workflow.Phase = restorePhase
		workflow.ActiveRunID = ""
		workflow.UpdatedAt = now
		if saveErr := store.Agent.Save(state); saveErr != nil {
			m.emitUpdated(Event{ProjectID: store.ProjectID, TaskID: taskID, RunID: runID, Type: "error", Message: "save Codex run state: " + saveErr.Error()})
			return
		}
		m.emitUpdated(Event{ProjectID: store.ProjectID, TaskID: taskID, RunID: runID, Type: "updated"})
		return
	}
	run.Status = models.AgentRunStatusSucceeded
	run.Summary = result.Output.Summary
	run.Tests = append([]string{}, result.Output.Tests...)
	run.Error = ""
	workflow.ActiveRunID = ""
	workflow.UpdatedAt = now
	if runPhase == models.AgentRunPhaseInvestigation {
		workflow.Phase = models.AgentPhasePlanReview
	} else {
		workflow.Phase = models.AgentPhaseCodeReview
	}
	if err := store.Agent.Save(state); err != nil {
		if previousTask != nil {
			_, rollbackErr := m.updateTask(context.Background(), store, taskID, func(task *models.Task) error {
				if runPhase == models.AgentRunPhaseInvestigation {
					if task.ImplementationPlan == result.Output.ImplementationPlan {
						task.ImplementationPlan = previousTask.ImplementationPlan
					}
					if task.ImplementationNotes == result.Output.ImplementationNotes {
						task.ImplementationNotes = previousTask.ImplementationNotes
					}
				} else if task.Status == "in-review" {
					task.Status = previousTask.Status
				}
				return nil
			})
			if rollbackErr != nil {
				m.emitUpdated(Event{ProjectID: store.ProjectID, TaskID: taskID, RunID: runID, Type: "error", Message: "save Codex run state: " + err.Error() + "; rollback task: " + rollbackErr.Error()})
				return
			}
		}
		m.emitUpdated(Event{ProjectID: store.ProjectID, TaskID: taskID, RunID: runID, Type: "error", Message: "save Codex run state: " + err.Error()})
		return
	}
	m.emitUpdated(Event{ProjectID: store.ProjectID, TaskID: taskID, RunID: runID, Type: "updated", TaskChanged: true})
}

func (m *Manager) updateThreadID(store *storage.Store, runID, threadID string) {
	if threadID == "" {
		return
	}
	state, err := store.Agent.Load()
	if err != nil {
		return
	}
	for i := range state.Runs {
		if state.Runs[i].ProjectID == store.ProjectID && state.Runs[i].ID == runID {
			state.Runs[i].CodexThreadID = threadID
			if err := store.Agent.Save(state); err != nil {
				m.emitUpdated(Event{ProjectID: store.ProjectID, RunID: runID, Type: "error", Message: "save Codex thread state: " + err.Error()})
			}
			return
		}
	}
}

func (m *Manager) snapshotLocked(ctx context.Context, store *storage.Store, taskID string) (models.AgentTaskSnapshot, error) {
	snapshot, err := store.Agent.TaskSnapshot(taskID)
	if err != nil {
		return models.AgentTaskSnapshot{}, err
	}
	files, err := m.dirtyFiles(ctx, store.RepositoryRoot())
	if err != nil {
		return models.AgentTaskSnapshot{}, err
	}
	snapshot.DirtyFiles = files
	return snapshot, nil
}

func (m *Manager) updateTask(ctx context.Context, store *storage.Store, taskID string, mutate func(*models.Task) error) (*models.Task, error) {
	service := tasklifecycle.New(store, tasklifecycle.WithHooks(tasklifecycle.Hooks{
		IndexTask: func(id string) error { return search.ReconcileTaskIndex(store, id) },
	}))
	return service.UpdateTask(ctx, taskID, tasklifecycle.TaskUpdateOptions{Actor: "codex-agent", Mutate: mutate})
}

func (m *Manager) emitUpdated(event Event) {
	if m.emit != nil {
		m.emit(event)
	}
}

func buildPrompt(task *models.Task, state models.AgentState, phase models.AgentRunPhase) string {
	var b strings.Builder
	fmt.Fprintf(&b, "Task title: %s\nDescription: %s\n", task.Title, task.Description)
	if len(task.AcceptanceCriteria) > 0 {
		b.WriteString("Acceptance criteria:\n")
		for _, criterion := range task.AcceptanceCriteria {
			fmt.Fprintf(&b, "- %s\n", criterion.Text)
		}
	}
	fmt.Fprintf(&b, "Implementation plan: %s\nImplementation notes: %s\n", task.ImplementationPlan, task.ImplementationNotes)
	if phase == models.AgentRunPhaseInvestigation {
		b.WriteString("Review comments for the plan:\n")
		for _, comment := range state.ReviewComments {
			if comment.ProjectID == task.ProjectID && comment.TaskID == task.ID && comment.Stage == models.ReviewStagePlan {
				fmt.Fprintf(&b, "- %s\n", comment.Body)
			}
		}
		b.WriteString("Inspect only; do not modify project files.\n")
	} else {
		b.WriteString("Implementation review comments:\n")
		for _, comment := range state.ReviewComments {
			if comment.ProjectID == task.ProjectID && comment.TaskID == task.ID && comment.Stage == models.ReviewStageImplementation {
				fmt.Fprintf(&b, "- %s\n", comment.Body)
			}
		}
		if phase == models.AgentRunPhaseFix {
			b.WriteString("Continue from the existing reviewed workspace changes and address every supplied review comment.\n")
		} else {
			b.WriteString("Implement the approved plan and run relevant tests.\n")
		}
	}
	b.WriteString("Do not edit Know-Me task or document metadata directly.\n")
	b.WriteString("Do not change files outside the current project workspace.\n")
	b.WriteString("Return only the structured result required by the provided JSON schema.")
	return b.String()
}

func ensureWorkflow(state *models.AgentState, projectID, taskID string, now time.Time) *models.AgentWorkflow {
	if workflow := findWorkflow(state, projectID, taskID); workflow != nil {
		return workflow
	}
	state.Workflows = append(state.Workflows, models.AgentWorkflow{ProjectID: projectID, TaskID: taskID, Phase: models.AgentPhaseIdle, UpdatedAt: now})
	return &state.Workflows[len(state.Workflows)-1]
}

func findWorkflow(state *models.AgentState, projectID, taskID string) *models.AgentWorkflow {
	for i := range state.Workflows {
		if state.Workflows[i].ProjectID == projectID && state.Workflows[i].TaskID == taskID {
			return &state.Workflows[i]
		}
	}
	return nil
}

func findRun(state *models.AgentState, projectID, taskID, runID string) *models.AgentRun {
	for i := range state.Runs {
		if state.Runs[i].ProjectID == projectID && state.Runs[i].TaskID == taskID && state.Runs[i].ID == runID {
			return &state.Runs[i]
		}
	}
	return nil
}

func readLog(path string) (string, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return "", err
	}
	return string(data), nil
}
