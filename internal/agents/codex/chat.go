package codex

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/hoangtrung1801/know-me/internal/models"
	"github.com/hoangtrung1801/know-me/internal/storage"
)

// ChatEvent contains a full persisted session or message snapshot for the
// server's existing SSE chat events.
type ChatEvent struct {
	Type      string
	ProjectID string
	TaskID    string
	ChatID    string
	Session   *models.ChatSession
	Message   *models.ChatMessage
}

func (m *Manager) StartChat(ctx context.Context, store *storage.Store, taskID, content string) error {
	if store == nil || store.Agent == nil || store.Chats == nil {
		return errors.New("chat store is unavailable")
	}
	content = strings.TrimSpace(content)
	if content == "" {
		return fmt.Errorf("%w: chat message is required", ErrInvalid)
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.closing {
		return fmt.Errorf("%w: Codex manager is shutting down", ErrConflict)
	}
	task, err := store.Tasks.Get(taskID)
	if err != nil {
		return fmt.Errorf("%w: %v", ErrNotFound, err)
	}
	state, err := store.Agent.Load()
	if err != nil {
		return err
	}
	workflow := ensureWorkflow(&state, store.ProjectID, taskID, m.now().UTC())
	root, err := executionRoot(store, workflow)
	if err != nil {
		return fmt.Errorf("%w: %v", ErrConflict, err)
	}
	if task.Status != "in-progress" || !chatPhaseAllowed(workflow.Phase) {
		return fmt.Errorf("%w: Auto chat requires an in-progress task outside an active investigation or implementation", ErrConflict)
	}
	if workflow.ActiveRunID != "" {
		active, ok := m.active[root]
		if !ok || active.taskID != taskID || active.phase != models.AgentRunPhaseChat {
			return fmt.Errorf("%w: another Codex run owns this task", ErrConflict)
		}
		return m.queueChatLocked(store, workflow, content)
	}
	if active, ok := m.active[root]; ok {
		if active.taskID == taskID && active.phase == models.AgentRunPhaseChat {
			return m.queueChatLocked(store, workflow, content)
		}
		return fmt.Errorf("%w: another Codex run is active for this project", ErrConflict)
	}
	return m.startChatLocked(ctx, store, task, &state, workflow, content, true)
}

func (m *Manager) StopChat(_ context.Context, store *storage.Store, taskID string) error {
	if store == nil || store.Agent == nil {
		return errors.New("agent store is unavailable")
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	state, err := store.Agent.Load()
	if err != nil {
		return err
	}
	workflow := findWorkflow(&state, store.ProjectID, taskID)
	root, err := executionRoot(store, workflow)
	if err != nil {
		return fmt.Errorf("%w: %v", ErrConflict, err)
	}
	active, ok := m.active[root]
	if !ok || active.taskID != taskID || active.phase != models.AgentRunPhaseChat {
		return fmt.Errorf("%w: no active Auto chat", ErrConflict)
	}
	if active.session != nil {
		_ = active.session.Cancel(context.Background())
	}
	active.cancel()
	return nil
}

func (m *Manager) startChatLocked(ctx context.Context, store *storage.Store, task *models.Task, state *models.AgentState, workflow *models.AgentWorkflow, content string, appendUser bool) error {
	root, err := executionRoot(store, workflow)
	if err != nil {
		return fmt.Errorf("%w: %v", ErrConflict, err)
	}
	status := m.detect(ctx, m.executable)
	if !status.Installed || !status.LoggedIn {
		return fmt.Errorf("%w: Codex is not installed or logged in", ErrConflict)
	}
	if _, exists := m.active[root]; exists {
		return fmt.Errorf("%w: another Codex run is active for this project", ErrConflict)
	}
	runLock, err := store.Agent.AcquireRunLock(ctx)
	if err != nil {
		return fmt.Errorf("%w: another Codex run is active for this project: %v", ErrConflict, err)
	}
	now := m.now().UTC()
	session, created, err := ensureTaskChatLocked(store, task, workflow, now)
	if err != nil {
		_ = runLock.Close()
		return err
	}
	previousSession := cloneChatSession(session)
	if appendUser {
		session.Messages = append(session.Messages, models.ChatMessage{
			ID: uuid.NewString(), Role: "user", Content: content, Model: "codex",
			CreatedAt: formatChatTime(now), Phase: models.AgentRunPhaseChat,
		})
	}
	assistant := models.ChatMessage{
		ID: uuid.NewString(), Role: "assistant", Content: "", Model: "codex",
		CreatedAt: formatChatTime(now), Phase: models.AgentRunPhaseChat,
	}
	runID := uuid.NewString()
	assistant.RunID = runID
	session.Messages = append(session.Messages, assistant)
	session.Status = "streaming"
	session.UpdatedAt = formatChatTime(now)
	workflow.ChatSessionID = session.ID
	run := models.AgentRun{
		ID: runID, ProjectID: store.ProjectID, TaskID: task.ID, Phase: models.AgentRunPhaseChat,
		Status: models.AgentRunStatusRunning, StartedAt: now, LogPath: store.Agent.LogPath(runID),
	}
	workflow.ActiveRunID = runID
	workflow.UpdatedAt = now
	state.Runs = append(state.Runs, run)
	if err := store.Chats.Save(session); err != nil {
		_ = runLock.Close()
		return err
	}
	if err := store.Agent.Save(*state); err != nil {
		if created {
			_ = store.Chats.Delete(session.ID)
		} else {
			_ = store.Chats.Save(previousSession)
		}
		_ = runLock.Close()
		return err
	}
	runCtx, cancel := context.WithCancel(context.Background())
	activeDone := make(chan struct{})
	m.active[root] = activeRun{
		cancel: cancel, lock: runLock, projectID: store.ProjectID, taskID: task.ID,
		runID: runID, phase: models.AgentRunPhaseChat, store: store, done: activeDone,
	}
	m.emitChatSession(ChatEvent{Type: "created", ProjectID: store.ProjectID, TaskID: task.ID, Session: session})
	m.emitChatSession(ChatEvent{Type: "updated", ProjectID: store.ProjectID, TaskID: task.ID, Session: session})
	go m.executeChatSession(runCtx, store, task.ID, root, content, runID, assistant.ID, workflow.Phase, runLock, activeDone)
	return nil
}

func (m *Manager) executeChatSession(ctx context.Context, store *storage.Store, taskID, root, content, runID, assistantID string, restorePhase models.AgentPhase, runLock *storage.AgentRunLock, activeDone chan struct{}) {
	defer func() {
		_ = runLock.Close()
		close(activeDone)
		m.startNextQueuedChat(store, taskID)
	}()

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
		runErr = session.SetMode(ctx, ACPModeAgent)
	}
	var streamed strings.Builder
	var response string
	if runErr == nil {
		var persistErr error
		response, runErr = session.PromptText(ctx, content, func(update ACPUpdate) {
			if update.Kind != "agent_message_chunk" || update.Text == "" {
				return
			}
			streamed.WriteString(update.Text)
			if err := m.saveChatMessage(store, taskID, assistantID, streamed.String(), runID); err != nil && persistErr == nil {
				persistErr = err
			}
		})
		if runErr == nil && persistErr != nil {
			runErr = persistErr
		}
	}
	if response == "" {
		response = streamed.String()
	}
	m.finishChatRun(ctx, store, taskID, root, runID, assistantID, restorePhase, session, response, runErr)
}

func (m *Manager) finishChatRun(_ context.Context, store *storage.Store, taskID, root, runID, assistantID string, restorePhase models.AgentPhase, session acpSession, response string, runErr error) {
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
	if session != nil && session.SessionID() != "" {
		run.CodexSessionID = session.SessionID()
		workflow.CodexSessionID = session.SessionID()
	}
	exitCode := 0
	run.ExitCode = &exitCode
	run.FinishedAt = &now
	chatStatus := "idle"
	if runErr != nil {
		switch {
		case m.closing || isACPInterruption(runErr):
			run.Status = models.AgentRunStatusInterrupted
			run.Error = runErr.Error()
			workflow.Phase = models.AgentPhaseInterrupted
			workflow.ResumePhase = models.AgentRunPhaseChat
			chatStatus = "error"
		case errors.Is(runErr, context.Canceled):
			run.Status = models.AgentRunStatusCancelled
			run.Error = "Codex chat cancelled"
			workflow.Phase = restorePhase
			workflow.ResumePhase = ""
			chatStatus = "idle"
		default:
			run.Status = models.AgentRunStatusFailed
			run.Error = runErr.Error()
			workflow.Phase = restorePhase
			workflow.ResumePhase = ""
			chatStatus = "error"
		}
	} else {
		run.Status = models.AgentRunStatusSucceeded
		run.Summary = response
		run.Error = ""
		workflow.Phase = restorePhase
		workflow.ResumePhase = ""
	}
	workflow.ActiveRunID = ""
	workflow.UpdatedAt = now
	chat, chatErr := store.Chats.Update(workflow.ChatSessionID, func(chat *models.ChatSession) error {
		if message := findChatMessage(chat, assistantID); message != nil {
			message.Content = response
			message.RunID = runID
		}
		chat.Status = chatStatus
		chat.UpdatedAt = formatChatTime(now)
		return nil
	})
	if err := store.Agent.Save(state); err != nil {
		m.mu.Unlock()
		return
	}
	m.mu.Unlock()
	if chatErr == nil {
		m.emitChatSession(ChatEvent{Type: "updated", ProjectID: store.ProjectID, TaskID: taskID, Session: chat})
		if message := findChatMessage(chat, assistantID); message != nil {
			m.emitChatSession(ChatEvent{Type: "message", ProjectID: store.ProjectID, TaskID: taskID, ChatID: chat.ID, Message: message})
		}
	}
	m.emitUpdated(Event{ProjectID: store.ProjectID, TaskID: taskID, RunID: runID, Type: "updated"})
}

func (m *Manager) queueChatLocked(store *storage.Store, workflow *models.AgentWorkflow, content string) error {
	if len(workflow.ChatSessionID) == 0 {
		return fmt.Errorf("%w: task chat is not initialized", ErrConflict)
	}
	now := formatChatTime(m.now().UTC())
	session, err := store.Chats.Update(workflow.ChatSessionID, func(session *models.ChatSession) error {
		if len(session.MessageQueue) >= 10 {
			return fmt.Errorf("%w: chat queue is full", ErrConflict)
		}
		session.Messages = append(session.Messages, models.ChatMessage{
			ID: uuid.NewString(), Role: "user", Content: content, Model: "codex",
			CreatedAt: now, Phase: models.AgentRunPhaseChat,
		})
		session.MessageQueue = append(session.MessageQueue, content)
		session.UpdatedAt = now
		return nil
	})
	if err != nil {
		return err
	}
	m.emitChatSession(ChatEvent{Type: "updated", ProjectID: store.ProjectID, TaskID: session.TaskID, Session: session})
	return nil
}

func (m *Manager) appendReviewMessageLocked(store *storage.Store, task *models.Task, workflow *models.AgentWorkflow, content string, phase models.AgentRunPhase) error {
	now := m.now().UTC()
	session, created, err := ensureTaskChatLocked(store, task, workflow, now)
	if err != nil {
		return err
	}
	session.Messages = append(session.Messages, models.ChatMessage{
		ID: uuid.NewString(), Role: "user", Content: strings.TrimSpace(content), Model: "codex",
		CreatedAt: formatChatTime(now), Phase: phase,
	})
	session.Status = "idle"
	session.UpdatedAt = formatChatTime(now)
	if err := store.Chats.Save(session); err != nil {
		return err
	}
	if created {
		m.emitChatSession(ChatEvent{Type: "created", ProjectID: store.ProjectID, TaskID: task.ID, Session: session})
	}
	m.emitChatSession(ChatEvent{Type: "updated", ProjectID: store.ProjectID, TaskID: task.ID, Session: session})
	return nil
}

func (m *Manager) startNextQueuedChat(store *storage.Store, taskID string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	state, err := store.Agent.Load()
	if err != nil {
		return
	}
	workflow := findWorkflow(&state, store.ProjectID, taskID)
	if workflow == nil || workflow.ActiveRunID != "" {
		return
	}
	task, err := store.Tasks.Get(taskID)
	if err != nil || task.Status != "in-progress" || !chatPhaseAllowed(workflow.Phase) {
		return
	}
	var content string
	if _, err := store.Chats.Update(workflow.ChatSessionID, func(session *models.ChatSession) error {
		if len(session.MessageQueue) == 0 {
			return storage.ErrChatNotFound
		}
		content = session.MessageQueue[0]
		session.MessageQueue = session.MessageQueue[1:]
		return nil
	}); err != nil {
		return
	}
	if err := m.startChatLocked(context.Background(), store, task, &state, workflow, content, false); err != nil {
		_, _ = store.Chats.Update(workflow.ChatSessionID, func(session *models.ChatSession) error {
			session.MessageQueue = append([]string{content}, session.MessageQueue...)
			return nil
		})
	}
}

func chatPhaseAllowed(phase models.AgentPhase) bool {
	return phase != models.AgentPhaseInvestigating && phase != models.AgentPhaseImplementing
}

func ensureTaskChatLocked(store *storage.Store, task *models.Task, workflow *models.AgentWorkflow, now time.Time) (*models.ChatSession, bool, error) {
	if workflow.ChatSessionID != "" {
		session, err := store.Chats.Get(workflow.ChatSessionID)
		if err == nil {
			if session.AgentType != "codex" || session.TaskID != task.ID || session.ProjectID != store.ProjectID {
				return nil, false, fmt.Errorf("%w: task chat link is invalid", ErrConflict)
			}
			return session, false, nil
		}
		if !errors.Is(err, storage.ErrChatNotFound) {
			return nil, false, err
		}
	}
	session, err := store.Chats.FindTaskSession(store.ProjectID, task.ID, "codex")
	if err == nil {
		workflow.ChatSessionID = session.ID
		return session, false, nil
	}
	if !errors.Is(err, storage.ErrChatNotFound) {
		return nil, false, err
	}
	session = &models.ChatSession{
		ID: uuid.NewString(), Title: task.Title, AgentType: "codex", Status: "idle",
		ProjectID: store.ProjectID, TaskID: task.ID, CreatedAt: formatChatTime(now), UpdatedAt: formatChatTime(now),
		Messages: []models.ChatMessage{}, MessageQueue: []string{},
	}
	workflow.ChatSessionID = session.ID
	return session, true, nil
}

func (m *Manager) saveChatMessage(store *storage.Store, taskID, messageID, content, runID string) error {
	session, err := store.Chats.FindTaskSession(store.ProjectID, taskID, "codex")
	if err != nil {
		return err
	}
	updated, err := store.Chats.Update(session.ID, func(session *models.ChatSession) error {
		message := findChatMessage(session, messageID)
		if message == nil {
			return fmt.Errorf("chat message %q not found", messageID)
		}
		message.Content = content
		message.RunID = runID
		session.UpdatedAt = formatChatTime(m.now().UTC())
		return nil
	})
	if err != nil {
		return err
	}
	m.emitChatSession(ChatEvent{Type: "message", ProjectID: store.ProjectID, TaskID: taskID, ChatID: updated.ID, Message: findChatMessage(updated, messageID)})
	return nil
}

func (m *Manager) finalizeGatedChat(store *storage.Store, taskID, runID string, phase models.AgentRunPhase, result Result, runErr error, status string) (*models.ChatSession, *models.ChatMessage) {
	session, err := store.Chats.FindTaskSession(store.ProjectID, taskID, "codex")
	if err != nil {
		return nil, nil
	}
	updated, err := store.Chats.Update(session.ID, func(session *models.ChatSession) error {
		message := findChatMessageByRun(session, runID)
		if message == nil {
			return fmt.Errorf("chat message for run %q not found", runID)
		}
		if runErr == nil {
			message.Content = formatGatedResult(phase, result.Output)
		} else if strings.TrimSpace(message.Content) == "" {
			message.Content = "Codex run failed: " + runErr.Error()
		}
		message.RunID = runID
		message.Phase = phase
		session.Status = status
		session.UpdatedAt = formatChatTime(m.now().UTC())
		return nil
	})
	if err != nil {
		return nil, nil
	}
	copy := cloneChatSession(updated)
	message := findChatMessageByRun(copy, runID)
	return copy, message
}

func findChatMessageByRun(session *models.ChatSession, runID string) *models.ChatMessage {
	if session == nil {
		return nil
	}
	for i := range session.Messages {
		if session.Messages[i].Role == "assistant" && session.Messages[i].RunID == runID {
			return &session.Messages[i]
		}
	}
	return nil
}

func formatGatedResult(phase models.AgentRunPhase, result PhaseResult) string {
	var sections []string
	if phase == models.AgentRunPhaseInvestigation && strings.TrimSpace(result.ImplementationPlan) != "" {
		sections = append(sections, "Implementation plan:\n"+strings.TrimSpace(result.ImplementationPlan))
	}
	if strings.TrimSpace(result.ImplementationNotes) != "" {
		sections = append(sections, "Implementation notes:\n"+strings.TrimSpace(result.ImplementationNotes))
	}
	if strings.TrimSpace(result.Summary) != "" {
		sections = append(sections, "Summary:\n"+strings.TrimSpace(result.Summary))
	}
	if len(result.Tests) > 0 {
		sections = append(sections, "Tests:\n- "+strings.Join(result.Tests, "\n- "))
	}
	return strings.Join(sections, "\n\n")
}

func findChatMessage(session *models.ChatSession, id string) *models.ChatMessage {
	if session == nil {
		return nil
	}
	for i := range session.Messages {
		if session.Messages[i].ID == id {
			return &session.Messages[i]
		}
	}
	return nil
}

func cloneChatSession(session *models.ChatSession) *models.ChatSession {
	if session == nil {
		return nil
	}
	copy := *session
	copy.Messages = append([]models.ChatMessage(nil), session.Messages...)
	copy.MessageQueue = append([]string(nil), session.MessageQueue...)
	return &copy
}

func formatChatTime(now time.Time) string {
	return now.UTC().Format(time.RFC3339Nano)
}

func (m *Manager) emitChatSession(event ChatEvent) {
	if m.chatEmit == nil {
		return
	}
	if event.Session != nil {
		event.Session = cloneChatSession(event.Session)
	}
	if event.Message != nil {
		message := *event.Message
		event.Message = &message
	}
	m.chatEmit(event)
}
