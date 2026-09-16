package omp

import (
	"context"
	"errors"
	"fmt"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
	instructionskills "github.com/hoangtrung1801/know-me/internal/instructions/skills"
	"github.com/hoangtrung1801/know-me/internal/models"
	"github.com/hoangtrung1801/know-me/internal/registry"
	"github.com/hoangtrung1801/know-me/internal/storage"
	"github.com/hoangtrung1801/know-me/internal/tasklifecycle"
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

type Manager struct {
	mu             sync.Mutex
	executable     string
	registry       *registry.Registry
	active         map[string]activeRun
	sessions       map[string]acpSession
	closing        bool
	emit           func(Event)
	chatEmit       func(ChatEvent)
	run            func(context.Context, Request, func(StreamEvent)) (Result, error)
	sessionFactory sessionFactory
	detect         func(context.Context, string) Status
	dirtyFiles     func(context.Context, string) ([]string, error)
	diff           func(context.Context, string) (string, error)
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
		registry:   registry.NewRegistry(),
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
		diff:       Diff,
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
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.snapshotLocked(ctx, store, taskID)
}

func (m *Manager) ensureSnapshotChatLocked(store *storage.Store, taskID string) error {
	if store == nil || store.Chats == nil {
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
	workflow := findWorkflow(&state, store.ProjectID, taskID)
	if workflow != nil && workflow.ChatSessionID != "" {
		return nil
	}
	now := m.now().UTC()
	if workflow == nil {
		workflow = ensureWorkflow(&state, store.ProjectID, taskID, now)
	}
	session, created, err := ensureTaskChatLocked(store, task, workflow, now)
	if err != nil {
		return err
	}
	if created {
		if err := store.Chats.Save(session); err != nil {
			return err
		}
		m.emitChatSession(ChatEvent{Type: "created", ProjectID: store.ProjectID, TaskID: taskID, Session: session})
	}
	return store.Agent.Save(state)
}

func (m *Manager) snapshotLocked(ctx context.Context, store *storage.Store, taskID string) (models.AgentTaskSnapshot, error) {
	_ = m.ensureSnapshotChatLocked(store, taskID)
	snapshot, err := store.Agent.TaskSnapshot(taskID)
	if err != nil {
		return models.AgentTaskSnapshot{}, err
	}
	root, err := ResolveExecutionRoot(store, m.registry, &snapshot.Workflow)
	if err == nil {
		if files, dirtyErr := m.dirtyFiles(ctx, root); dirtyErr == nil {
			snapshot.DirtyFiles = files
		}
		if diffText, diffErr := m.diff(ctx, root); diffErr == nil {
			snapshot.Diff = diffText
		}
	}

	active, isActive := m.active[root]
	if isActive && active.taskID == taskID {
		snapshot.AdapterState = "running"
	} else {
		snapshot.AdapterState = "stopped"
	}
	if snapshot.Workflow.Phase == models.AgentPhaseInterrupted {
		snapshot.Interrupted = true
		sessionID := snapshot.Workflow.OMPSessionID
		if sessionID == "" {
			sessionID = snapshot.Workflow.CodexSessionID
		}
		snapshot.Resumable = sessionID != "" && snapshot.Workflow.ResumePhase != ""
	}
	if snapshot.DirtyFiles == nil {
		snapshot.DirtyFiles = []string{}
	}
	return snapshot, nil
}
func (m *Manager) Diff(ctx context.Context, store *storage.Store, taskID string) (string, error) {
	if store == nil {
		return "", errors.New("store is required")
	}
	m.mu.Lock()
	defer m.mu.Unlock()

	state, err := store.Agent.Load()
	if err != nil {
		return "", err
	}
	workflow := findWorkflow(&state, store.ProjectID, taskID)
	root, err := ResolveExecutionRoot(store, m.registry, workflow)
	if err != nil {
		return "", err
	}
	return m.diff(ctx, root)
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
		sessionID := workflow.OMPSessionID
		if sessionID == "" {
			sessionID = workflow.CodexSessionID
		}
		if task.Status != "in-progress" || workflow.Phase != models.AgentPhaseInterrupted || workflow.ActiveRunID != "" || sessionID == "" || workflow.ResumePhase == "" {
			return models.AgentTaskSnapshot{}, false, fmt.Errorf("%w: task has no resumable interrupted ACP session", ErrConflict)
		}
		runPhase := workflow.ResumePhase
		if runPhase == models.AgentRunPhaseChat {
			workflow.Phase = models.AgentPhaseIdle
			workflow.ResumePhase = ""
			if err := m.startChatLocked(ctx, store, task, &state, workflow, "Resume interrupted OMP chat", true); err != nil {
				return models.AgentTaskSnapshot{}, false, err
			}
			snapshot, err := m.snapshotLocked(ctx, store, taskID)
			return snapshot, true, err
		}
		return m.startRunLocked(ctx, store, task, &state, workflow, runPhase, runningPhaseForRun(runPhase), restorePhaseForRun(runPhase), "Resume OMP session")

	case ActionApprovePlan:
		if task.Status != "in-progress" || workflow.Phase != models.AgentPhasePlanReview || workflow.ActiveRunID != "" {
			return models.AgentTaskSnapshot{}, false, fmt.Errorf("%w: plan is not ready for approval", ErrConflict)
		}
		root, err := ResolveExecutionRoot(store, m.registry, workflow)
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
		baseRoot, err := ResolveExecutionRoot(store, m.registry, nil)
		if err != nil {
			return models.AgentTaskSnapshot{}, false, err
		}
		path, branch, err := CreateTaskWorktree(ctx, baseRoot, store.ProjectID, taskID)
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
			_ = session.Close(context.Background())
		}
		return m.startRunLocked(ctx, store, task, &state, workflow, models.AgentRunPhaseImplementation, models.AgentPhaseImplementing, models.AgentPhasePlanReview, "Create isolated worktree and implement")

	case ActionRequestPlanChanges:
		if workflow.Phase != models.AgentPhasePlanReview || workflow.ActiveRunID != "" {
			return models.AgentTaskSnapshot{}, false, fmt.Errorf("%w: plan is not ready for feedback", ErrConflict)
		}
		if strings.TrimSpace(comment) == "" {
			return models.AgentTaskSnapshot{}, false, fmt.Errorf("%w: review comment is required", ErrInvalid)
		}
		root, err := ResolveExecutionRoot(store, m.registry, workflow)
		if err != nil {
			return models.AgentTaskSnapshot{}, false, err
		}
		lock, err := store.Agent.AcquireWorkspaceRunLock(ctx, root)
		if err != nil {
			return models.AgentTaskSnapshot{}, false, fmt.Errorf("%w: acquire workspace run lock: %v", ErrConflict, err)
		}
		defer lock.Close()

		workflow.Phase = models.AgentPhaseIdle
		workflow.UpdatedAt = now
		state.ReviewComments = append(state.ReviewComments, models.ReviewComment{
			ID:        uuid.NewString(),
			ProjectID: store.ProjectID,
			TaskID:    taskID,
			Stage:     models.ReviewStagePlan,
			Body:      strings.TrimSpace(comment),
			CreatedAt: now,
		})
		if err := store.Agent.Save(state); err != nil {
			return models.AgentTaskSnapshot{}, false, err
		}
		return m.startRunLocked(ctx, store, task, &state, workflow, models.AgentRunPhaseInvestigation, models.AgentPhaseInvestigating, models.AgentPhaseIdle, "Revise investigation plan")

	case ActionApproveImplementation:
		if workflow.Phase != models.AgentPhaseCodeReview || workflow.ActiveRunID != "" {
			return models.AgentTaskSnapshot{}, false, fmt.Errorf("%w: implementation is not ready for approval", ErrConflict)
		}
		root, err := ResolveExecutionRoot(store, m.registry, workflow)
		if err != nil {
			return models.AgentTaskSnapshot{}, false, err
		}
		lock, err := store.Agent.AcquireWorkspaceRunLock(ctx, root)
		if err != nil {
			return models.AgentTaskSnapshot{}, false, fmt.Errorf("%w: acquire workspace run lock: %v", ErrConflict, err)
		}
		defer lock.Close()

		previousStatus := task.Status
		if _, err := m.updateTask(ctx, store, taskID, func(task *models.Task) error {
			if task.Status != "in-review" {
				task.Status = "done"
			}
			return nil
		}); err != nil {
			return models.AgentTaskSnapshot{}, false, err
		}

		workflow.Phase = models.AgentPhaseCompleted
		workflow.UpdatedAt = now
		if err := store.Agent.Save(state); err != nil {
			_, _ = m.updateTask(ctx, store, taskID, func(task *models.Task) error {
				task.Status = previousStatus
				return nil
			})
			return models.AgentTaskSnapshot{}, false, err
		}
		if session := m.removeSessionLocked(store.ProjectID, taskID); session != nil {
			_ = session.Close(context.Background())
		}
		m.emitUpdated(Event{Type: "updated", ProjectID: store.ProjectID, TaskID: taskID, TaskChanged: true})
		snapshot, err := m.snapshotLocked(ctx, store, taskID)
		return snapshot, false, err

	case ActionRequestImplementationChanges:
		if workflow.Phase != models.AgentPhaseCodeReview || workflow.ActiveRunID != "" {
			return models.AgentTaskSnapshot{}, false, fmt.Errorf("%w: implementation is not ready for feedback", ErrConflict)
		}
		if strings.TrimSpace(comment) == "" {
			return models.AgentTaskSnapshot{}, false, fmt.Errorf("%w: review comment is required", ErrInvalid)
		}
		root, err := ResolveExecutionRoot(store, m.registry, workflow)
		if err != nil {
			return models.AgentTaskSnapshot{}, false, err
		}
		lock, err := store.Agent.AcquireWorkspaceRunLock(ctx, root)
		if err != nil {
			return models.AgentTaskSnapshot{}, false, fmt.Errorf("%w: acquire workspace run lock: %v", ErrConflict, err)
		}
		defer lock.Close()

		previousStatus := task.Status
		if _, err := m.updateTask(ctx, store, taskID, func(task *models.Task) error {
			task.Status = "in-progress"
			return nil
		}); err != nil {
			return models.AgentTaskSnapshot{}, false, err
		}

		workflow.Phase = models.AgentPhaseFixReady
		workflow.UpdatedAt = now
		state.ReviewComments = append(state.ReviewComments, models.ReviewComment{
			ID:        uuid.NewString(),
			ProjectID: store.ProjectID,
			TaskID:    taskID,
			Stage:     models.ReviewStageImplementation,
			Body:      strings.TrimSpace(comment),
			CreatedAt: now,
		})
		if err := store.Agent.Save(state); err != nil {
			_, _ = m.updateTask(ctx, store, taskID, func(task *models.Task) error {
				task.Status = previousStatus
				return nil
			})
			return models.AgentTaskSnapshot{}, false, err
		}
		m.emitUpdated(Event{Type: "updated", ProjectID: store.ProjectID, TaskID: taskID, TaskChanged: true})
		snapshot, err := m.snapshotLocked(ctx, store, taskID)
		return snapshot, false, err

	case ActionStartFix:
		if task.Status != "in-progress" || workflow.Phase != models.AgentPhaseFixReady || workflow.ActiveRunID != "" {
			return models.AgentTaskSnapshot{}, false, fmt.Errorf("%w: task is not ready for a fix run", ErrConflict)
		}
		return m.startRunLocked(ctx, store, task, &state, workflow, models.AgentRunPhaseFix, models.AgentPhaseImplementing, models.AgentPhaseFixReady, "Start fix run")

	case ActionCancel:
		if workflow.ActiveRunID == "" {
			return models.AgentTaskSnapshot{}, false, fmt.Errorf("%w: task has no active run", ErrConflict)
		}
		root, err := ResolveExecutionRoot(store, m.registry, workflow)
		if err != nil {
			return models.AgentTaskSnapshot{}, false, err
		}
		active, ok := m.active[root]
		if !ok {
			return models.AgentTaskSnapshot{}, false, fmt.Errorf("%w: active run is not owned by this server", ErrConflict)
		}
		active.cancel()
		if active.session != nil {
			_ = active.session.Cancel(context.Background())
		}
		snapshot, err := m.snapshotLocked(ctx, store, taskID)
		return snapshot, false, err

	default:
		return models.AgentTaskSnapshot{}, false, fmt.Errorf("%w: unknown action %q", ErrInvalid, action)
	}
}

func (m *Manager) startRunLocked(ctx context.Context, store *storage.Store, task *models.Task, state *models.AgentState, workflow *models.AgentWorkflow, runPhase models.AgentRunPhase, runningPhase, restorePhase models.AgentPhase, visibleMessage string) (models.AgentTaskSnapshot, bool, error) {
	root, err := ResolveExecutionRoot(store, m.registry, workflow)
	if err != nil {
		return models.AgentTaskSnapshot{}, false, fmt.Errorf("%w: %v", ErrConflict, err)
	}
	if status := m.detect(ctx, m.executable); !status.Installed {
		return models.AgentTaskSnapshot{}, false, fmt.Errorf("%w: OMP is not available: %s", ErrConflict, status.Error)
	}
	if _, exists := m.active[root]; exists {
		return models.AgentTaskSnapshot{}, false, fmt.Errorf("%w: another OMP run is active for this workspace", ErrConflict)
	}
	runLock, err := store.Agent.AcquireWorkspaceRunLock(ctx, root)
	if err != nil {
		return models.AgentTaskSnapshot{}, false, fmt.Errorf("%w: %v", ErrConflict, err)
	}

	runID := uuid.NewString()
	now := m.now().UTC()
	run := models.AgentRun{
		ID:        runID,
		ProjectID: store.ProjectID,
		TaskID:    task.ID,
		Phase:     runPhase,
		Status:    models.AgentRunStatusRunning,
		StartedAt: now,
		LogPath:   store.Agent.LogPath(runID),
	}
	sessionID := workflow.OMPSessionID
	if sessionID == "" {
		sessionID = workflow.CodexSessionID
	}
	if sessionID != "" {
		run.OMPSessionID = sessionID
	}

	workflow.ActiveRunID = runID
	workflow.Phase = runningPhase
	workflow.ResumePhase = ""
	workflow.UpdatedAt = now
	state.Runs = append(state.Runs, run)
	var chat *models.ChatSession
	var chatCreated bool
	var assistantID string
	if store.Chats != nil {
		chat, chatCreated, err = ensureTaskChatLocked(store, task, workflow, now)
		if err != nil {
			_ = runLock.Close()
			return models.AgentTaskSnapshot{}, false, err
		}
		assistantID = uuid.NewString()
		chat.Messages = append(chat.Messages,
			models.ChatMessage{
				ID:        uuid.NewString(),
				Role:      "user",
				Content:   visibleMessage,
				Model:     "omp",
				CreatedAt: formatChatTime(now),
				Phase:     runPhase,
			},
			models.ChatMessage{
				ID:        assistantID,
				Role:      "assistant",
				Content:   "",
				Model:     "omp",
				CreatedAt: formatChatTime(now),
				RunID:     runID,
				Phase:     runPhase,
			},
		)
		chat.Status = "streaming"
		chat.UpdatedAt = formatChatTime(now)
		if err := store.Chats.Save(chat); err != nil {
			_ = runLock.Close()
			return models.AgentTaskSnapshot{}, false, err
		}
		if chatCreated {
			m.emitChatSession(ChatEvent{Type: "created", ProjectID: store.ProjectID, TaskID: task.ID, Session: chat})
		}
		m.emitChatSession(ChatEvent{Type: "updated", ProjectID: store.ProjectID, TaskID: task.ID, Session: chat})
	}

	if err := store.Agent.Save(*state); err != nil {
		_ = runLock.Close()
		return models.AgentTaskSnapshot{}, false, err
	}

	prompt := m.buildPrompt(task, state, workflow, runPhase)
	runCtx, cancel := context.WithCancel(context.Background())
	activeDone := make(chan struct{})
	m.active[root] = activeRun{
		cancel: cancel, lock: runLock, projectID: store.ProjectID, taskID: task.ID,
		runID: runID, phase: runPhase, store: store, done: activeDone,
	}

	go m.executeSession(runCtx, store, runID, task.ID, root, prompt, runPhase, restorePhase, assistantID, runLock, activeDone)

	m.emitUpdated(Event{Type: "updated", ProjectID: store.ProjectID, TaskID: task.ID, RunID: runID, Message: visibleMessage})
	snapshot, err := m.snapshotLocked(ctx, store, task.ID)
	return snapshot, true, err
}

func (m *Manager) executeSession(ctx context.Context, store *storage.Store, runID, taskID, root, prompt string, runPhase models.AgentRunPhase, restorePhase models.AgentPhase, assistantID string, runLock *storage.AgentRunLock, activeDone chan struct{}) {
	defer runLock.Close()
	defer close(activeDone)

	session, runErr := m.ensureSession(ctx, store, taskID, root)
	var streamed strings.Builder
	var toolCalls []models.ChatToolCall
	if runErr == nil {
		m.setActiveSession(root, runID, session)
		if setter, ok := session.(sessionLogPathSetter); ok {
			_ = setter.SetLogPath(store.Agent.LogPath(runID))
		}
		mode := ACPModePlan
		if runPhase == models.AgentRunPhaseImplementation || runPhase == models.AgentRunPhaseFix {
			mode = ACPModeDefault
		}
		_ = session.SetMode(ctx, mode)

		_, runErr = session.Prompt(ctx, prompt, func(update ACPUpdate) {
			hasChange := false
			if update.ToolCallID != "" {
				hasChange = true
				found := false
				for i := range toolCalls {
					if toolCalls[i].ID == update.ToolCallID {
						if update.ToolStatus != "" {
							toolCalls[i].Status = update.ToolStatus
						}
						if update.ToolOutput != "" {
							toolCalls[i].Output = update.ToolOutput
						}
						if update.ToolTitle != "" {
							toolCalls[i].Title = update.ToolTitle
						}
						if update.ToolInput != nil {
							toolCalls[i].Input = update.ToolInput
						}
						found = true
						break
					}
				}
				if !found {
					toolName := update.ToolKind
					if toolName == "" {
						toolName = "tool"
					}
					toolCalls = append(toolCalls, models.ChatToolCall{
						ID:     update.ToolCallID,
						Name:   toolName,
						Title:  update.ToolTitle,
						Input:  update.ToolInput,
						Output: update.ToolOutput,
						Status: update.ToolStatus,
					})
				}
			}
			if update.Text != "" {
				hasChange = true
				streamed.WriteString(update.Text)
				m.emitProgress(Event{Type: "progress", ProjectID: store.ProjectID, TaskID: taskID, RunID: runID, Message: update.Text})
			}
			if hasChange && assistantID != "" {
				displayContent := shortPreview(streamed.String(), 120)
				_ = m.saveChatMessage(store, taskID, assistantID, displayContent, runID, toolCalls)
				m.emitChatMessage(ChatEvent{
					Type:      "message",
					ProjectID: store.ProjectID,
					TaskID:    taskID,
					ChatID:    taskID,
					Message: &models.ChatMessage{
						ID:        assistantID,
						Role:      "assistant",
						Content:   displayContent,
						Model:     "omp",
						RunID:     runID,
						Phase:     runPhase,
						ToolCalls: toolCalls,
						CreatedAt: formatChatTime(m.now().UTC()),
					},
				})
			}
		})
		if runErr == nil && streamed.Len() > 0 {
			result, parseErr := parseResult(runPhase, streamed.String())
			if parseErr == nil {
				m.applyResult(store, taskID, runPhase, result)
			}
		}
	}

	m.finishRun(store, taskID, root, runID, runPhase, restorePhase, assistantID, streamed.String(), session, toolCalls, runErr)
}
func (m *Manager) finishRun(store *storage.Store, taskID, root, runID string, runPhase models.AgentRunPhase, restorePhase models.AgentPhase, assistantID, streamedText string, session acpSession, toolCalls []models.ChatToolCall, runErr error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	delete(m.active, root)

	state, err := store.Agent.Load()
	if err != nil {
		return
	}
	workflow := findWorkflow(&state, store.ProjectID, taskID)
	run := findRun(&state, store.ProjectID, runID)
	if workflow == nil || run == nil {
		return
	}
	now := m.now().UTC()
	run.FinishedAt = &now
	workflow.ActiveRunID = ""
	workflow.UpdatedAt = now

	if session != nil && session.SessionID() != "" {
		workflow.OMPSessionID = session.SessionID()
		run.OMPSessionID = session.SessionID()
	}

	if runErr != nil {
		if errors.Is(runErr, context.Canceled) {
			run.Status = models.AgentRunStatusCancelled
			workflow.Phase = restorePhase
		} else {
			run.Status = models.AgentRunStatusFailed
			run.Error = runErr.Error()
			workflow.Phase = models.AgentPhaseInterrupted
			workflow.ResumePhase = runPhase
		}
	} else {
		run.Status = models.AgentRunStatusSucceeded
		switch runPhase {
		case models.AgentRunPhaseInvestigation:
			workflow.Phase = models.AgentPhasePlanReview
		case models.AgentRunPhaseImplementation, models.AgentRunPhaseFix:
			workflow.Phase = models.AgentPhaseCodeReview
		}
	}

	finalContent := streamedText
	taskChanged := false
	savedField := ""
	if result, parseErr := parseResult(runPhase, streamedText); parseErr == nil {
		if runPhase == models.AgentRunPhaseInvestigation {
			if result.ImplementationPlan != "" {
				finalContent = fmt.Sprintf("### Summary\n%s\n\n%s", result.Summary, result.ImplementationPlan)
				savedField = "Implementation Plan"
			} else {
				finalContent = result.Summary
			}
			taskChanged = result.ImplementationPlan != "" || result.ImplementationNotes != ""
		} else if runPhase == models.AgentRunPhaseImplementation || runPhase == models.AgentRunPhaseFix {
			if result.ImplementationNotes != "" {
				finalContent = fmt.Sprintf("### Summary\n%s\n\n%s", result.Summary, result.ImplementationNotes)
				savedField = "Implementation Notes"
			} else {
				finalContent = result.Summary
			}
			taskChanged = result.ImplementationNotes != ""
		}
	}
	if runErr != nil {
		taskChanged = false
		savedField = ""
	}
	const maxFinalChatChars = 6000
	if len(finalContent) > maxFinalChatChars {
		marker := "\n\n... [truncated]"
		if savedField != "" {
			marker = fmt.Sprintf("\n\n... [truncated — full text saved to the task's %s]", savedField)
		}
		finalContent = finalContent[:maxFinalChatChars] + marker
	}

	_ = store.Agent.Save(state)

	if assistantID != "" {
		status := "idle"
		if runErr != nil {
			status = "error"
		}
		_ = m.finalizeChatMessage(store, taskID, assistantID, finalContent, status, runErr, toolCalls)
	}
	m.emitUpdated(Event{Type: "updated", ProjectID: store.ProjectID, TaskID: taskID, RunID: runID, TaskChanged: taskChanged})
}

func shortPreview(text string, maxLen int) string {
	trimmed := strings.TrimSpace(text)
	if trimmed == "" {
		return ""
	}
	lines := strings.Split(trimmed, "\n")
	for _, line := range lines {
		l := strings.TrimSpace(line)
		if l != "" && !strings.HasPrefix(l, "```") && !strings.HasPrefix(l, "{") && !strings.HasPrefix(l, "}") && !strings.HasPrefix(l, "#") {
			if len(l) > maxLen {
				return l[:maxLen] + "..."
			}
			return l
		}
	}
	if len(trimmed) > maxLen {
		return trimmed[:maxLen] + "..."
	}
	return trimmed
}

func (m *Manager) applyResult(store *storage.Store, taskID string, phase models.AgentRunPhase, result PhaseResult) {
	_, _ = m.updateTask(context.Background(), store, taskID, func(task *models.Task) error {
		if phase == models.AgentRunPhaseInvestigation && result.ImplementationPlan != "" {
			task.ImplementationPlan = result.ImplementationPlan
		}
		if result.ImplementationNotes != "" {
			task.ImplementationNotes = result.ImplementationNotes
		}
		return nil
	})
}

func (m *Manager) ensureSession(ctx context.Context, store *storage.Store, taskID, root string) (acpSession, error) {
	key := store.ProjectID + ":" + taskID
	if s, ok := m.sessions[key]; ok {
		return s, nil
	}
	command, err := configuredACPCommand(m.executable)
	if err != nil {
		return nil, err
	}
	session, err := m.sessionFactory(ctx, root, command)
	if err != nil {
		return nil, err
	}
	state, _ := store.Agent.Load()
	workflow := findWorkflow(&state, store.ProjectID, taskID)
	sessionID := ""
	if workflow != nil {
		sessionID = workflow.OMPSessionID
		if sessionID == "" {
			sessionID = workflow.CodexSessionID
		}
	}
	if sessionID != "" {
		if err := session.LoadSession(ctx, sessionID); err != nil {
			_ = session.NewSession(ctx)
		}
	} else {
		if err := session.NewSession(ctx); err != nil {
			return nil, err
		}
	}
	m.sessions[key] = session
	return session, nil
}

func (m *Manager) removeSessionLocked(projectID, taskID string) acpSession {
	key := projectID + ":" + taskID
	s, ok := m.sessions[key]
	if ok {
		delete(m.sessions, key)
	}
	return s
}

func (m *Manager) setActiveSession(root, runID string, session acpSession) {
	if a, ok := m.active[root]; ok && a.runID == runID {
		a.session = session
		m.active[root] = a
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
	data, err := os.ReadFile(store.Agent.LogPath(run.ID))
	if errors.Is(err, os.ErrNotExist) {
		return "", fmt.Errorf("%w: run log %q", ErrNotFound, runID)
	}
	return string(data), err
}

func (m *Manager) Close() error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.closing = true
	for _, a := range m.active {
		a.cancel()
		if a.session != nil {
			_ = a.session.Close(context.Background())
		}
	}
	for _, s := range m.sessions {
		_ = s.Close(context.Background())
	}
	m.active = make(map[string]activeRun)
	m.sessions = make(map[string]acpSession)
	return nil
}

func (m *Manager) emitUpdated(event Event) {
	if m.emit != nil {
		m.emit(event)
	}
}


func (m *Manager) emitProgress(event Event) {
	if m.emit != nil {
		m.emit(event)
	}
}
func (m *Manager) updateTask(ctx context.Context, store *storage.Store, taskID string, mutate func(*models.Task) error) (*models.Task, error) {
	service := tasklifecycle.New(store)
	return service.UpdateTask(ctx, taskID, tasklifecycle.TaskUpdateOptions{Actor: "omp-agent", Mutate: mutate})
}
func loadWorkflowSkillInstructions() string {
	data, err := instructionskills.Files.ReadFile("kn-workflow/SKILL.md")
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(data))
}


func (m *Manager) buildPrompt(task *models.Task, state *models.AgentState, workflow *models.AgentWorkflow, phase models.AgentRunPhase) string {
	var sb strings.Builder
	if skill := loadWorkflowSkillInstructions(); skill != "" {
		sb.WriteString(skill)
		sb.WriteString("\n\n---\n\n")
	}
	sb.WriteString(fmt.Sprintf("Task: %s\n", task.Title))
	if task.Description != "" {
		sb.WriteString(fmt.Sprintf("Description:\n%s\n", task.Description))
	}
	if len(task.AcceptanceCriteria) > 0 {
		sb.WriteString("Acceptance Criteria:\n")
		for _, ac := range task.AcceptanceCriteria {
			sb.WriteString(fmt.Sprintf("- %s\n", ac.Text))
		}
	}
	if len(state.ReviewComments) > 0 {
		sb.WriteString("\nReview Feedback:\n")
		for _, rc := range state.ReviewComments {
			if rc.TaskID == task.ID {
				sb.WriteString(fmt.Sprintf("- [%s] %s\n", rc.Stage, rc.Body))
			}
		}
	}
	switch phase {
	case models.AgentRunPhaseInvestigation:
		sb.WriteString("\nActive Phase: INVESTIGATION\nPlease investigate this task and codebase. Output a detailed implementation plan in markdown, proposing files to modify and tests to run. Propose only; do not edit files. End your response with the required fenced ```json block with fields 'summary', 'implementationPlan', and 'tests'.")
	case models.AgentRunPhaseImplementation:
		sb.WriteString("\nActive Phase: IMPLEMENTATION\nPlease implement the approved plan. Modify files, run tests, and verify the changes. End your response with the required fenced ```json block with fields 'summary', 'implementationNotes', and 'tests'.")
	case models.AgentRunPhaseFix:
		sb.WriteString("\nActive Phase: FIX\nPlease fix the implementation based on the review feedback. Modify files, run tests, and verify. End your response with the required fenced ```json block with fields 'summary', 'implementationNotes', and 'tests'.")
	}
	return sb.String()
}

func ensureWorkflow(state *models.AgentState, projectID, taskID string, now time.Time) *models.AgentWorkflow {
	for i := range state.Workflows {
		if state.Workflows[i].ProjectID == projectID && state.Workflows[i].TaskID == taskID {
			return &state.Workflows[i]
		}
	}
	wf := models.AgentWorkflow{
		ProjectID: projectID,
		TaskID:    taskID,
		Phase:     models.AgentPhaseIdle,
		UpdatedAt: now,
	}
	state.Workflows = append(state.Workflows, wf)
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

func findRun(state *models.AgentState, projectID, runID string) *models.AgentRun {
	for i := range state.Runs {
		if state.Runs[i].ProjectID == projectID && state.Runs[i].ID == runID {
			return &state.Runs[i]
		}
	}
	return nil
}

func runningPhaseForRun(phase models.AgentRunPhase) models.AgentPhase {
	switch phase {
	case models.AgentRunPhaseInvestigation:
		return models.AgentPhaseInvestigating
	case models.AgentRunPhaseImplementation, models.AgentRunPhaseFix:
		return models.AgentPhaseImplementing
	default:
		return models.AgentPhaseIdle
	}
}

func restorePhaseForRun(phase models.AgentRunPhase) models.AgentPhase {
	switch phase {
	case models.AgentRunPhaseInvestigation:
		return models.AgentPhaseIdle
	case models.AgentRunPhaseImplementation:
		return models.AgentPhasePlanReview
	case models.AgentRunPhaseFix:
		return models.AgentPhaseFixReady
	default:
		return models.AgentPhaseIdle
	}
}
