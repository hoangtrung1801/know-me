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
	ActionCreateWorktree               Action = "create-worktree"
	ActionResume                       Action = "resume"
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

type acpSession interface {
	NewSession(context.Context) error
	LoadSession(context.Context, string) error
	SetMode(context.Context, ACPMode) error
	Prompt(context.Context, string, func(ACPUpdate)) (string, error)
	PromptText(context.Context, string, func(ACPUpdate)) (string, error)
	Cancel(context.Context) error
	Close(context.Context) error
	SessionID() string
}

type sessionFactory func(context.Context, string, []string) (acpSession, error)

type sessionLogPathSetter interface {
	SetLogPath(string) error
}

type sessionLoadError struct{ err error }

func (e sessionLoadError) Error() string { return "ACP session/load: " + e.err.Error() }

func (e sessionLoadError) Unwrap() error { return e.err }

type Manager struct {
	mu             sync.Mutex
	executable     string
	active         map[string]activeRun
	sessions       map[string]acpSession
	closing        bool
	emit           func(Event)
	chatEmit       func(ChatEvent)
	run            func(context.Context, Request, func(StreamEvent)) (Result, error)
	sessionFactory sessionFactory
	detect         func(context.Context, string) Status
	dirtyFiles     func(context.Context, string) ([]string, error)
	now            func() time.Time
}

type activeRun struct {
	cancel    context.CancelFunc
	lock      *storage.AgentRunLock
	projectID string
	taskID    string
	runID     string
	phase     models.AgentRunPhase
	store     *storage.Store
	session   acpSession
	done      chan struct{}
}

func NewManager(executable string, emit func(Event), chatEmit ...func(ChatEvent)) *Manager {
	runner := Runner{Executable: executable}
	var emitChat func(ChatEvent)
	if len(chatEmit) > 0 {
		emitChat = chatEmit[0]
	}
	return &Manager{
		executable: executable,
		active:     make(map[string]activeRun),
		sessions:   make(map[string]acpSession),
		emit:       emit,
		chatEmit:   emitChat,
		run:        runner.Run,
		sessionFactory: func(ctx context.Context, root string, command []string) (acpSession, error) {
			return NewACPProcess(ctx, root, command, nil)
		},
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
		return m.startRunLocked(ctx, store, task, &state, workflow, models.AgentRunPhaseInvestigation, models.AgentPhaseInvestigating, models.AgentPhaseIdle, "Start investigation")
	case ActionResume:
		if task.Status != "in-progress" || workflow.Phase != models.AgentPhaseInterrupted || workflow.ActiveRunID != "" || workflow.CodexSessionID == "" || workflow.ResumePhase == "" {
			return models.AgentTaskSnapshot{}, false, fmt.Errorf("%w: task has no resumable interrupted ACP session", ErrConflict)
		}
		runPhase := workflow.ResumePhase
		if runPhase == models.AgentRunPhaseChat {
			workflow.Phase = models.AgentPhaseIdle
			workflow.ResumePhase = ""
			if err := m.startChatLocked(ctx, store, task, &state, workflow, "Resume interrupted Codex chat", true); err != nil {
				return models.AgentTaskSnapshot{}, false, err
			}
			snapshot, err := m.snapshotLocked(ctx, store, taskID)
			return snapshot, true, err
		}
		return m.startRunLocked(ctx, store, task, &state, workflow, runPhase, runningPhaseForRun(runPhase), restorePhaseForRun(runPhase), "Resume Codex session")
	case ActionApprovePlan:
		if task.Status != "in-progress" || workflow.Phase != models.AgentPhasePlanReview || workflow.ActiveRunID != "" {
			return models.AgentTaskSnapshot{}, false, fmt.Errorf("%w: plan is not ready for approval", ErrConflict)
		}
		root, err := executionRoot(store, workflow)
		if err != nil {
			return models.AgentTaskSnapshot{}, false, fmt.Errorf("%w: inspect implementation workspace: %v", ErrConflict, err)
		}
		files, err := m.dirtyFiles(ctx, root)
		if err != nil {
			return models.AgentTaskSnapshot{}, false, fmt.Errorf("%w: inspect implementation workspace: %v", ErrConflict, err)
		}
		if len(files) > 0 {
			return models.AgentTaskSnapshot{}, false, fmt.Errorf("%w: implementation workspace is dirty: %s", ErrConflict, strings.Join(files, ", "))
		}
		return m.startRunLocked(ctx, store, task, &state, workflow, models.AgentRunPhaseImplementation, models.AgentPhaseImplementing, models.AgentPhasePlanReview, "Approve plan and implement")
	case ActionCreateWorktree:
		if task.Status != "in-progress" || workflow.Phase != models.AgentPhasePlanReview || workflow.ActiveRunID != "" {
			return models.AgentTaskSnapshot{}, false, fmt.Errorf("%w: plan is not ready for an isolated implementation", ErrConflict)
		}
		if workflow.WorktreePath != "" {
			return models.AgentTaskSnapshot{}, false, fmt.Errorf("%w: task already has an isolated worktree", ErrConflict)
		}
		path, branch, err := createTaskWorktree(ctx, store.RepositoryRoot(), store.ProjectID, taskID)
		if err != nil {
			return models.AgentTaskSnapshot{}, false, fmt.Errorf("%w: %v", ErrConflict, err)
		}
		workflow.WorktreePath = path
		workflow.WorktreeBranch = branch
		workflow.UpdatedAt = now
		if err := store.Agent.Save(state); err != nil {
			return models.AgentTaskSnapshot{}, false, err
		}
		if session := m.removeSessionLocked(store.ProjectID, taskID); session != nil {
			_ = closeSession(session)
		}
		return m.startRunLocked(ctx, store, task, &state, workflow, models.AgentRunPhaseImplementation, models.AgentPhaseImplementing, models.AgentPhasePlanReview, "Create isolated worktree and implement")
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
		state.ReviewComments = append(state.ReviewComments, models.ReviewComment{
			ID: uuid.NewString(), ProjectID: store.ProjectID, TaskID: taskID,
			Stage: models.ReviewStagePlan, Body: strings.TrimSpace(comment), CreatedAt: now,
		})
		if err := m.appendReviewMessageLocked(store, task, workflow, comment, models.AgentRunPhaseInvestigation); err != nil {
			return models.AgentTaskSnapshot{}, false, err
		}
		workflow.Phase = models.AgentPhaseIdle
		workflow.UpdatedAt = now
		if err := store.Agent.Save(state); err != nil {
			return models.AgentTaskSnapshot{}, false, err
		}
		if err := agentLock.Close(); err != nil {
			return models.AgentTaskSnapshot{}, false, err
		}
		return m.startRunLocked(ctx, store, task, &state, workflow, models.AgentRunPhaseInvestigation, models.AgentPhaseInvestigating, models.AgentPhaseIdle, "Revise investigation plan")
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
		if session := m.removeSessionLocked(store.ProjectID, taskID); session != nil {
			closeCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
			closeErr := session.Close(closeCtx)
			cancel()
			if closeErr != nil {
				m.emitUpdated(Event{ProjectID: store.ProjectID, TaskID: taskID, Type: "error", Message: "close ACP session: " + closeErr.Error()})
			}
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
		if err := m.appendReviewMessageLocked(store, task, workflow, comment, models.AgentRunPhaseImplementation); err != nil {
			return models.AgentTaskSnapshot{}, false, err
		}
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
		return m.startRunLocked(ctx, store, task, &state, workflow, models.AgentRunPhaseFix, models.AgentPhaseImplementing, models.AgentPhaseFixReady, "Start fix")
	case ActionCancel:
		if workflow.ActiveRunID == "" {
			return models.AgentTaskSnapshot{}, false, fmt.Errorf("%w: no active run", ErrConflict)
		}
		root, err := executionRoot(store, workflow)
		if err != nil {
			return models.AgentTaskSnapshot{}, false, fmt.Errorf("%w: %v", ErrConflict, err)
		}
		active, ok := m.active[root]
		if !ok {
			return models.AgentTaskSnapshot{}, false, fmt.Errorf("%w: active run is not owned by this server", ErrConflict)
		}
		if active.session != nil {
			_ = active.session.Cancel(context.Background())
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
	m.closing = true
	activeRuns := make([]activeRun, 0, len(m.active))
	for _, active := range m.active {
		activeRuns = append(activeRuns, active)
	}
	m.mu.Unlock()
	for _, active := range activeRuns {
		if active.session != nil {
			_ = active.session.Cancel(context.Background())
		}
		active.cancel()
	}
	deadline := time.NewTimer(5 * time.Second)
	defer deadline.Stop()
waitForRuns:
	for _, active := range activeRuns {
		select {
		case <-active.done:
		case <-deadline.C:
			break waitForRuns
		}
	}
	m.mu.Lock()
	sessions := make([]acpSession, 0, len(m.sessions))
	for key, session := range m.sessions {
		sessions = append(sessions, session)
		delete(m.sessions, key)
	}
	m.mu.Unlock()
	for _, session := range sessions {
		_ = closeSession(session)
	}
}

func (m *Manager) startRunLocked(ctx context.Context, store *storage.Store, task *models.Task, state *models.AgentState, workflow *models.AgentWorkflow, runPhase models.AgentRunPhase, runningPhase, restorePhase models.AgentPhase, visibleMessage string) (models.AgentTaskSnapshot, bool, error) {
	root, err := executionRoot(store, workflow)
	if err != nil {
		return models.AgentTaskSnapshot{}, false, fmt.Errorf("%w: %v", ErrConflict, err)
	}
	status := m.detect(ctx, m.executable)
	if !status.Installed || !status.LoggedIn {
		return models.AgentTaskSnapshot{}, false, fmt.Errorf("%w: Codex is not installed or logged in", ErrConflict)
	}
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
	var chat, previousChat *models.ChatSession
	var chatCreated bool
	if store.Chats != nil {
		chat, chatCreated, err = ensureTaskChatLocked(store, task, workflow, now)
		if err != nil {
			_ = runLock.Close()
			return models.AgentTaskSnapshot{}, false, err
		}
		previousChat = cloneChatSession(chat)
		chat.Messages = append(chat.Messages,
			models.ChatMessage{ID: uuid.NewString(), Role: "user", Content: visibleMessage, Model: "codex", CreatedAt: formatChatTime(now), Phase: runPhase},
			models.ChatMessage{ID: uuid.NewString(), Role: "assistant", Content: "", Model: "codex", CreatedAt: formatChatTime(now), RunID: runID, Phase: runPhase},
		)
		chat.Status = "streaming"
		chat.UpdatedAt = formatChatTime(now)
		if err := store.Chats.Save(chat); err != nil {
			_ = runLock.Close()
			return models.AgentTaskSnapshot{}, false, err
		}
	}
	workflow.Phase = runningPhase
	workflow.ActiveRunID = runID
	workflow.UpdatedAt = now
	state.Runs = append(state.Runs, run)
	if err := store.Agent.Save(*state); err != nil {
		if chat != nil {
			if chatCreated {
				_ = store.Chats.Delete(chat.ID)
			} else {
				_ = store.Chats.Save(previousChat)
			}
		}
		_ = os.RemoveAll(tempDir)
		_ = runLock.Close()
		return models.AgentTaskSnapshot{}, false, err
	}
	prompt := buildPrompt(task, *state, runPhase)
	runCtx, cancel := context.WithCancel(context.Background())
	activeDone := make(chan struct{})
	m.active[root] = activeRun{cancel: cancel, lock: runLock, projectID: store.ProjectID, taskID: task.ID, runID: runID, phase: runPhase, store: store, done: activeDone}
	if chat != nil {
		m.emitChatSession(ChatEvent{Type: "created", ProjectID: store.ProjectID, TaskID: task.ID, Session: chat})
		m.emitChatSession(ChatEvent{Type: "updated", ProjectID: store.ProjectID, TaskID: task.ID, Session: chat})
	}
	if m.sessionFactory == nil {
		go m.execute(runCtx, store, runID, task.ID, root, tempDir, prompt, runPhase, restorePhase, runLock, activeDone)
	} else {
		go m.executeSession(runCtx, store, runID, task.ID, root, tempDir, runPhase, restorePhase, runLock, activeDone)
	}
	snapshot, err := m.snapshotLocked(ctx, store, task.ID)
	return snapshot, true, err
}

func (m *Manager) executeSession(ctx context.Context, store *storage.Store, runID, taskID, root, tempDir string, runPhase models.AgentRunPhase, restorePhase models.AgentPhase, runLock *storage.AgentRunLock, activeDone chan struct{}) {
	defer os.RemoveAll(tempDir)
	defer runLock.Close()
	defer close(activeDone)

	session, runErr := m.ensureSession(ctx, store, taskID, root)
	if runErr == nil {
		m.setActiveSession(root, runID, session)
		if setter, ok := session.(sessionLogPathSetter); ok {
			runErr = setter.SetLogPath(store.Agent.LogPath(runID))
		}
	}
	if runErr == nil {
		runErr = m.persistSession(store, taskID, runID, session.SessionID())
	}
	if runErr == nil {
		runErr = session.SetMode(ctx, modeForPhase(runPhase))
	}

	var result Result
	if runErr == nil {
		state, err := store.Agent.Load()
		if err != nil {
			runErr = err
		} else if task, err := store.Tasks.Get(taskID); err != nil {
			runErr = err
		} else {
			prompt := buildPrompt(task, state, runPhase)
			raw, err := session.Prompt(ctx, prompt, func(update ACPUpdate) {
				message := update.Text
				if message == "" {
					message = update.Kind
				}
				m.emitUpdated(Event{ProjectID: store.ProjectID, TaskID: taskID, RunID: runID, Type: "progress", Message: message})
			})
			if err != nil {
				runErr = err
			} else {
				result.Output, runErr = decodePhaseResult([]byte(raw))
				if runErr == nil {
					runErr = validateResult(runPhase, result.Output)
				}
			}
		}
	}
	m.finishSessionRun(ctx, store, runID, taskID, root, runPhase, restorePhase, session, result, runErr)
}

func (m *Manager) ensureSession(ctx context.Context, store *storage.Store, taskID, root string) (acpSession, error) {
	key := sessionKey(store.ProjectID, taskID)
	m.mu.Lock()
	if session := m.sessions[key]; session != nil {
		m.mu.Unlock()
		return session, nil
	}
	factory := m.sessionFactory
	executable := m.executable
	m.mu.Unlock()
	if factory == nil {
		return nil, errors.New("ACP session factory is unavailable")
	}
	command, err := configuredACPCommand(executable)
	if err != nil {
		return nil, err
	}
	// The adapter process outlives a single prompt; prompt cancellation must
	// not kill the task session that later review gates reuse.
	session, err := factory(context.Background(), root, command)
	if err != nil {
		return nil, err
	}
	state, err := store.Agent.Load()
	if err != nil {
		_ = closeSession(session)
		return nil, err
	}
	workflow := findWorkflow(&state, store.ProjectID, taskID)
	if workflow == nil {
		_ = closeSession(session)
		return nil, fmt.Errorf("%w: workflow %s", ErrNotFound, taskID)
	}
	if workflow.CodexSessionID != "" {
		err = session.LoadSession(ctx, workflow.CodexSessionID)
		if err != nil {
			err = sessionLoadError{err: err}
		}
	} else {
		err = session.NewSession(ctx)
	}
	if err != nil {
		_ = closeSession(session)
		return nil, err
	}
	m.mu.Lock()
	if existing := m.sessions[key]; existing != nil {
		m.mu.Unlock()
		_ = closeSession(session)
		return existing, nil
	}
	m.sessions[key] = session
	m.mu.Unlock()
	return session, nil
}

func (m *Manager) persistSession(store *storage.Store, taskID, runID, sessionID string) error {
	if sessionID == "" {
		return errors.New("ACP session returned no session ID")
	}
	state, err := store.Agent.Load()
	if err != nil {
		return err
	}
	run := findRun(&state, store.ProjectID, taskID, runID)
	workflow := findWorkflow(&state, store.ProjectID, taskID)
	if run == nil || workflow == nil || run.Status != models.AgentRunStatusRunning || workflow.ActiveRunID != runID {
		return ErrConflict
	}
	run.CodexSessionID = sessionID
	workflow.CodexSessionID = sessionID
	if err := store.Agent.Save(state); err != nil {
		return err
	}
	if workflow.ChatSessionID != "" && store.Chats != nil {
		chat, err := store.Chats.Update(workflow.ChatSessionID, func(chat *models.ChatSession) error {
			chat.SessionID = sessionID
			chat.UpdatedAt = formatChatTime(m.now().UTC())
			return nil
		})
		if err != nil {
			return err
		}
		m.emitChatSession(ChatEvent{Type: "updated", ProjectID: store.ProjectID, TaskID: taskID, Session: chat})
	}
	return nil
}

func (m *Manager) setActiveSession(root, runID string, session acpSession) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if active, ok := m.active[root]; ok && active.runID == runID {
		active.session = session
		m.active[root] = active
	}
}

func (m *Manager) finishSessionRun(ctx context.Context, store *storage.Store, runID, taskID, root string, runPhase models.AgentRunPhase, restorePhase models.AgentPhase, session acpSession, result Result, runErr error) {
	m.mu.Lock()
	state, err := store.Agent.Load()
	if err != nil {
		delete(m.active, root)
		m.mu.Unlock()
		return
	}
	run := findRun(&state, store.ProjectID, taskID, runID)
	workflow := findWorkflow(&state, store.ProjectID, taskID)
	if run == nil || workflow == nil || run.Status != models.AgentRunStatusRunning || workflow.ActiveRunID != runID {
		delete(m.active, root)
		m.mu.Unlock()
		return
	}
	now := m.now().UTC()
	delete(m.active, root)
	shuttingDown := m.closing
	if shuttingDown && runErr == nil {
		runErr = errors.New("ACP manager is shutting down")
	}
	if session != nil && session.SessionID() != "" {
		run.CodexSessionID = session.SessionID()
		workflow.CodexSessionID = session.SessionID()
	}
	exitCode := result.ExitCode
	run.ExitCode = &exitCode
	run.FinishedAt = &now
	if runErr != nil {
		sessionToClose := acpSession(nil)
		switch {
		case shuttingDown || isACPInterruption(runErr):
			run.Status = models.AgentRunStatusInterrupted
			run.Error = runErr.Error()
			workflow.Phase = models.AgentPhaseInterrupted
			workflow.ResumePhase = runPhase
			sessionToClose = m.removeSessionLocked(store.ProjectID, taskID)
		case errors.Is(runErr, context.Canceled) || ctx.Err() != nil:
			run.Status = models.AgentRunStatusCancelled
			run.Error = "Codex run cancelled"
			workflow.Phase = restorePhase
			workflow.ResumePhase = ""
		default:
			run.Status = models.AgentRunStatusFailed
			run.Error = runErr.Error()
			workflow.Phase = restorePhase
			workflow.ResumePhase = ""
		}
		workflow.ActiveRunID = ""
		workflow.UpdatedAt = now
		chatStatus := "error"
		if errors.Is(runErr, context.Canceled) || ctx.Err() != nil {
			chatStatus = "idle"
		}
		chatSession, chatMessage := m.finalizeGatedChat(store, taskID, runID, runPhase, result, runErr, chatStatus)
		saveErr := store.Agent.Save(state)
		m.mu.Unlock()
		if sessionToClose != nil {
			_ = closeSession(sessionToClose)
		}
		if saveErr != nil {
			m.emitUpdated(Event{ProjectID: store.ProjectID, TaskID: taskID, RunID: runID, Type: "error", Message: "save ACP run state: " + saveErr.Error()})
			return
		}
		if chatSession != nil {
			m.emitChatSession(ChatEvent{Type: "updated", ProjectID: store.ProjectID, TaskID: taskID, Session: chatSession})
		}
		if chatMessage != nil {
			m.emitChatSession(ChatEvent{Type: "message", ProjectID: store.ProjectID, TaskID: taskID, ChatID: chatSession.ID, Message: chatMessage})
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
				return fmt.Errorf("%w: task status changed before ACP completed", ErrConflict)
			}
			task.Status = "in-review"
			return nil
		})
	}
	if updateErr != nil {
		run.Status = models.AgentRunStatusFailed
		run.Error = updateErr.Error()
		workflow.Phase = restorePhase
		workflow.ResumePhase = ""
		workflow.ActiveRunID = ""
		workflow.UpdatedAt = now
		chatSession, chatMessage := m.finalizeGatedChat(store, taskID, runID, runPhase, result, updateErr, "error")
		saveErr := store.Agent.Save(state)
		m.mu.Unlock()
		if saveErr != nil {
			m.emitUpdated(Event{ProjectID: store.ProjectID, TaskID: taskID, RunID: runID, Type: "error", Message: "save ACP run state: " + saveErr.Error()})
			return
		}
		if chatSession != nil {
			m.emitChatSession(ChatEvent{Type: "updated", ProjectID: store.ProjectID, TaskID: taskID, Session: chatSession})
		}
		if chatMessage != nil {
			m.emitChatSession(ChatEvent{Type: "message", ProjectID: store.ProjectID, TaskID: taskID, ChatID: chatSession.ID, Message: chatMessage})
		}
		m.emitUpdated(Event{ProjectID: store.ProjectID, TaskID: taskID, RunID: runID, Type: "updated"})
		return
	}
	run.Status = models.AgentRunStatusSucceeded
	run.Summary = result.Output.Summary
	run.Tests = append([]string{}, result.Output.Tests...)
	run.Error = ""
	workflow.ActiveRunID = ""
	workflow.ResumePhase = ""
	workflow.UpdatedAt = now
	if runPhase == models.AgentRunPhaseInvestigation {
		workflow.Phase = models.AgentPhasePlanReview
	} else {
		workflow.Phase = models.AgentPhaseCodeReview
	}
	chatSession, chatMessage := m.finalizeGatedChat(store, taskID, runID, runPhase, result, nil, "idle")
	saveErr := store.Agent.Save(state)
	m.mu.Unlock()
	if saveErr != nil {
		if previousTask != nil {
			_, _ = m.updateTask(context.Background(), store, taskID, func(task *models.Task) error {
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
		}
		m.emitUpdated(Event{ProjectID: store.ProjectID, TaskID: taskID, RunID: runID, Type: "error", Message: "save ACP run state: " + saveErr.Error()})
		return
	}
	if chatSession != nil {
		m.emitChatSession(ChatEvent{Type: "updated", ProjectID: store.ProjectID, TaskID: taskID, Session: chatSession})
	}
	if chatMessage != nil {
		m.emitChatSession(ChatEvent{Type: "message", ProjectID: store.ProjectID, TaskID: taskID, ChatID: chatSession.ID, Message: chatMessage})
	}
	m.emitUpdated(Event{ProjectID: store.ProjectID, TaskID: taskID, RunID: runID, Type: "updated", TaskChanged: true})
}

func isACPInterruption(err error) bool {
	var loadErr sessionLoadError
	if errors.As(err, &loadErr) {
		return true
	}
	message := strings.ToLower(err.Error())
	for _, marker := range []string{"acp adapter exited", "acp adapter output closed", "acp process closed", "read acp output", "write acp message"} {
		if strings.Contains(message, marker) {
			return true
		}
	}
	return false
}

func closeSession(session acpSession) error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	return session.Close(ctx)
}

func (m *Manager) execute(ctx context.Context, store *storage.Store, runID, taskID, root, tempDir, prompt string, runPhase models.AgentRunPhase, restorePhase models.AgentPhase, runLock *storage.AgentRunLock, activeDone chan struct{}) {
	defer os.RemoveAll(tempDir)
	defer runLock.Close()
	defer close(activeDone)
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
		if m.closing || isACPInterruption(runErr) {
			run.Status = models.AgentRunStatusInterrupted
			run.Error = runErr.Error()
			workflow.Phase = models.AgentPhaseInterrupted
			workflow.ResumePhase = runPhase
		} else if errors.Is(runErr, context.Canceled) || ctx.Err() != nil {
			run.Status = models.AgentRunStatusCancelled
			run.Error = "Codex run cancelled"
			workflow.Phase = restorePhase
			workflow.ResumePhase = ""
		} else {
			run.Status = models.AgentRunStatusFailed
			run.Error = runErr.Error()
			workflow.Phase = restorePhase
			workflow.ResumePhase = ""
		}
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
	if err := m.ensureSnapshotChatLocked(store, taskID); err != nil {
		return models.AgentTaskSnapshot{}, err
	}
	snapshot, err := store.Agent.TaskSnapshot(taskID)
	if err != nil {
		return models.AgentTaskSnapshot{}, err
	}
	root, err := executionRoot(store, &snapshot.Workflow)
	if err != nil {
		return models.AgentTaskSnapshot{}, err
	}
	files, err := m.dirtyFiles(ctx, root)
	if err != nil {
		return models.AgentTaskSnapshot{}, err
	}
	snapshot.DirtyFiles = files
	snapshot.AdapterState = "stopped"
	if m.sessions[sessionKey(store.ProjectID, taskID)] != nil {
		snapshot.AdapterState = "running"
	}
	return snapshot, nil
}

func (m *Manager) ensureSnapshotChatLocked(store *storage.Store, taskID string) error {
	if store.Chats == nil {
		return nil
	}
	state, err := store.Agent.Load()
	if err != nil {
		return err
	}
	task, err := store.Tasks.Get(taskID)
	if err != nil {
		return err
	}
	workflow := ensureWorkflow(&state, store.ProjectID, taskID, m.now().UTC())
	previousID := workflow.ChatSessionID
	session, created, err := ensureTaskChatLocked(store, task, workflow, m.now().UTC())
	if err != nil {
		return err
	}
	if created {
		if err := store.Chats.Save(session); err != nil {
			return err
		}
		m.emitChatSession(ChatEvent{Type: "created", ProjectID: store.ProjectID, TaskID: taskID, Session: session})
	}
	if previousID != workflow.ChatSessionID {
		if err := store.Agent.Save(state); err != nil {
			return err
		}
	}
	return nil
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
	b.WriteString("Return exactly one JSON object matching this schema (no markdown fences or extra text):\n")
	b.WriteString(strictResultSchema)
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

func sessionKey(projectID, taskID string) string {
	return projectID + "\x00" + taskID
}

func (m *Manager) removeSessionLocked(projectID, taskID string) acpSession {
	key := sessionKey(projectID, taskID)
	session := m.sessions[key]
	delete(m.sessions, key)
	return session
}

func modeForPhase(phase models.AgentRunPhase) ACPMode {
	if phase == models.AgentRunPhaseInvestigation {
		return ACPModeReadOnly
	}
	return ACPModeAgent
}

func runningPhaseForRun(phase models.AgentRunPhase) models.AgentPhase {
	if phase == models.AgentRunPhaseInvestigation {
		return models.AgentPhaseInvestigating
	}
	return models.AgentPhaseImplementing
}

func restorePhaseForRun(phase models.AgentRunPhase) models.AgentPhase {
	switch phase {
	case models.AgentRunPhaseInvestigation:
		return models.AgentPhaseIdle
	case models.AgentRunPhaseFix:
		return models.AgentPhaseFixReady
	default:
		return models.AgentPhasePlanReview
	}
}
