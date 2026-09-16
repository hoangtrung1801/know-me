package omp

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
		return fmt.Errorf("%w: OMP manager is shutting down", ErrConflict)
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
	root, err := ResolveExecutionRoot(store, m.registry, workflow)
	if err != nil {
		return fmt.Errorf("%w: %v", ErrConflict, err)
	}
	if task.Status != "in-progress" || !chatPhaseAllowed(workflow.Phase) {
		return fmt.Errorf("%w: chat requires an in-progress task outside active investigation or implementation", ErrConflict)
	}
	if workflow.ActiveRunID != "" {
		active, ok := m.active[root]
		if !ok || active.taskID != taskID || active.phase != models.AgentRunPhaseChat {
			return fmt.Errorf("%w: another OMP run owns this task", ErrConflict)
		}
		return m.queueChatLocked(store, workflow, content)
	}
	if active, ok := m.active[root]; ok {
		if active.taskID == taskID && active.phase == models.AgentRunPhaseChat {
			return m.queueChatLocked(store, workflow, content)
		}
		return fmt.Errorf("%w: another OMP run is active for this workspace", ErrConflict)
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
	root, err := ResolveExecutionRoot(store, m.registry, workflow)
	if err != nil {
		return fmt.Errorf("%w: %v", ErrConflict, err)
	}
	active, ok := m.active[root]
	if !ok || active.taskID != taskID || active.phase != models.AgentRunPhaseChat {
		return fmt.Errorf("%w: no active chat run", ErrConflict)
	}
	if active.session != nil {
		_ = active.session.Cancel(context.Background())
	}
	active.cancel()
	return nil
}

func (m *Manager) startChatLocked(ctx context.Context, store *storage.Store, task *models.Task, state *models.AgentState, workflow *models.AgentWorkflow, content string, appendUser bool) error {
	root, err := ResolveExecutionRoot(store, m.registry, workflow)
	if err != nil {
		return fmt.Errorf("%w: %v", ErrConflict, err)
	}
	status := m.detect(ctx, m.executable)
	if !status.Installed || !status.LoggedIn {
		return fmt.Errorf("%w: OMP is not available", ErrConflict)
	}
	if _, exists := m.active[root]; exists {
		return fmt.Errorf("%w: another OMP run is active for this workspace", ErrConflict)
	}
	runLock, err := store.Agent.AcquireWorkspaceRunLock(ctx, root)
	if err != nil {
		return fmt.Errorf("%w: acquire workspace run lock: %v", ErrConflict, err)
	}
	now := m.now().UTC()
	session, created, err := ensureTaskChatLocked(store, task, workflow, now)
	if err != nil {
		_ = runLock.Close()
		return err
	}
	if appendUser {
		session.Messages = append(session.Messages, models.ChatMessage{
			ID: uuid.NewString(), Role: "user", Content: content, Model: "omp",
			CreatedAt: formatChatTime(now), Phase: models.AgentRunPhaseChat,
		})
	}
	assistant := models.ChatMessage{
		ID: uuid.NewString(), Role: "assistant", Content: "", Model: "omp",
		CreatedAt: formatChatTime(now), Phase: models.AgentRunPhaseChat,
	}
	runID := uuid.NewString()
	assistant.RunID = runID
	session.Messages = append(session.Messages, assistant)
	session.Status = "streaming"
	session.UpdatedAt = formatChatTime(now)
	if err := store.Chats.Save(session); err != nil {
		_ = runLock.Close()
		return err
	}

	workflow.ChatSessionID = session.ID
	workflow.ActiveRunID = runID
	workflow.UpdatedAt = now
	run := models.AgentRun{
		ID:        runID,
		ProjectID: store.ProjectID,
		TaskID:    task.ID,
		Phase:     models.AgentRunPhaseChat,
		Status:    models.AgentRunStatusRunning,
		StartedAt: now,
		LogPath:   store.Agent.LogPath(runID),
	}
	if workflow.OMPSessionID != "" {
		run.OMPSessionID = workflow.OMPSessionID
	} else if workflow.CodexSessionID != "" {
		run.OMPSessionID = workflow.CodexSessionID
	}
	state.Runs = append(state.Runs, run)
	if err := store.Agent.Save(*state); err != nil {
		_ = runLock.Close()
		return err
	}

	runCtx, cancel := context.WithCancel(context.Background())
	activeDone := make(chan struct{})
	m.active[root] = activeRun{
		cancel: cancel, lock: runLock, projectID: store.ProjectID, taskID: task.ID,
		runID: runID, phase: models.AgentRunPhaseChat, store: store, done: activeDone,
	}

	if created {
		m.emitChatSession(ChatEvent{Type: "created", ProjectID: store.ProjectID, TaskID: task.ID, ChatID: session.ID, Session: session})
	}
	m.emitChatSession(ChatEvent{Type: "updated", ProjectID: store.ProjectID, TaskID: task.ID, ChatID: session.ID, Session: session})
	go m.executeChatSession(runCtx, store, task.ID, root, content, runID, assistant.ID, session.ID, workflow.Phase, runLock, activeDone)
	return nil
}
func (m *Manager) executeChatSession(ctx context.Context, store *storage.Store, taskID, root, content, runID, assistantID, chatID string, restorePhase models.AgentPhase, runLock *storage.AgentRunLock, activeDone chan struct{}) {
	defer func() {
		_ = runLock.Close()
		close(activeDone)
	}()

	session, runErr := m.ensureSession(ctx, store, taskID, root)
	var response string
	var toolCalls []models.ChatToolCall
	if runErr == nil {
		m.setActiveSession(root, runID, session)
		if setter, ok := session.(sessionLogPathSetter); ok {
			_ = setter.SetLogPath(store.Agent.LogPath(runID))
		}
		var streamed strings.Builder
		response, runErr = session.PromptText(ctx, content, func(update ACPUpdate) {
			hasChange := false
			if update.ToolCallID != "" {
				hasChange = true
				toolCalls = applyToolCallUpdate(toolCalls, update)
			}
			if update.Text != "" {
				hasChange = true
				streamed.WriteString(update.Text)
			}
			if hasChange {
				displayContent := streamed.String()
				if len(toolCalls) > 0 {
					displayContent = shortPreview(streamed.String(), 120)
				}
				_ = m.saveChatMessage(store, taskID, assistantID, displayContent, runID, toolCalls)
				m.emitChatMessage(ChatEvent{
					Type: "message", ProjectID: store.ProjectID, TaskID: taskID, ChatID: chatID,
					Message: &models.ChatMessage{
						ID: assistantID, Role: "assistant", Content: displayContent, Model: "omp",
						RunID: runID, Phase: models.AgentRunPhaseChat, ToolCalls: toolCalls,
					},
				})
			}
		})
	}

	m.finishChatRun(store, taskID, root, runID, assistantID, restorePhase, session, response, toolCalls, runErr)
}
func (m *Manager) finishChatRun(store *storage.Store, taskID, root, runID, assistantID string, restorePhase models.AgentPhase, session acpSession, response string, toolCalls []models.ChatToolCall, runErr error) {
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

	status := "idle"
	if runErr != nil {
		if errors.Is(runErr, context.Canceled) {
			run.Status = models.AgentRunStatusCancelled
			workflow.Phase = restorePhase
		} else {
			run.Status = models.AgentRunStatusFailed
			run.Error = runErr.Error()
			workflow.Phase = models.AgentPhaseInterrupted
			workflow.ResumePhase = models.AgentRunPhaseChat
			status = "error"
		}
	} else {
		run.Status = models.AgentRunStatusSucceeded
	}
	finalResponse := response
	if finalResponse == "" {
		finalResponse = "Done."
	}
	_ = m.finalizeChatMessage(store, taskID, assistantID, finalResponse, status, runErr, toolCalls)
}
func (m *Manager) queueChatLocked(store *storage.Store, workflow *models.AgentWorkflow, content string) error {
	chat, err := store.Chats.FindTaskSession(store.ProjectID, workflow.TaskID, "omp")
	if err != nil {
		chat, err = store.Chats.FindTaskSession(store.ProjectID, workflow.TaskID, "codex")
	}
	if err != nil || chat == nil {
		return errors.New("chat session not found to queue message")
	}
	now := formatChatTime(m.now().UTC())
	chat.Messages = append(chat.Messages, models.ChatMessage{
		ID: uuid.NewString(), Role: "user", Content: content, Model: "omp",
		CreatedAt: now, Phase: models.AgentRunPhaseChat,
	})
	chat.MessageQueue = append(chat.MessageQueue, content)
	chat.UpdatedAt = now
	return store.Chats.Save(chat)
}

func (m *Manager) saveChatMessage(store *storage.Store, taskID, messageID, content, runID string, toolCalls []models.ChatToolCall) error {
	session, err := store.Chats.FindTaskSession(store.ProjectID, taskID, "omp")
	if err != nil {
		session, err = store.Chats.FindTaskSession(store.ProjectID, taskID, "codex")
	}
	if err != nil {
		return err
	}
	for i := range session.Messages {
		if session.Messages[i].ID == messageID {
			session.Messages[i].Content = content
			session.Messages[i].RunID = runID
			if len(toolCalls) > 0 {
				session.Messages[i].ToolCalls = append([]models.ChatToolCall(nil), toolCalls...)
			}
			break
		}
	}
	return store.Chats.Save(session)
}

func (m *Manager) finalizeChatMessage(store *storage.Store, taskID, messageID, content, status string, runErr error, toolCalls []models.ChatToolCall) error {
	session, err := store.Chats.FindTaskSession(store.ProjectID, taskID, "omp")
	if err != nil {
		session, err = store.Chats.FindTaskSession(store.ProjectID, taskID, "codex")
	}
	if err != nil {
		return err
	}
	session.Status = status
	session.UpdatedAt = formatChatTime(m.now().UTC())
	for i := range session.Messages {
		if session.Messages[i].ID == messageID {
			if content != "" {
				session.Messages[i].Content = content
			}
			if runErr != nil && session.Messages[i].Content == "" {
				session.Messages[i].Content = fmt.Sprintf("Error: %v", runErr)
			}
			if len(toolCalls) > 0 {
				session.Messages[i].ToolCalls = append([]models.ChatToolCall(nil), toolCalls...)
			}
			break
		}
	}
	_ = store.Chats.Save(session)
	m.emitChatSession(ChatEvent{Type: "updated", ProjectID: store.ProjectID, TaskID: taskID, ChatID: session.ID, Session: session})
	return nil
}

func ensureTaskChatLocked(store *storage.Store, task *models.Task, workflow *models.AgentWorkflow, now time.Time) (*models.ChatSession, bool, error) {
	if workflow.ChatSessionID != "" {
		session, err := store.Chats.Get(workflow.ChatSessionID)
		if err == nil {
			return session, false, nil
		}
	}
	session, err := store.Chats.FindTaskSession(store.ProjectID, task.ID, "omp")
	if err != nil {
		session, err = store.Chats.FindTaskSession(store.ProjectID, task.ID, "codex")
	}
	if err == nil && session != nil {
		session.AgentType = "omp"
		workflow.ChatSessionID = session.ID
		return session, false, nil
	}

	session = &models.ChatSession{
		ID:           uuid.NewString(),
		Title:        task.Title,
		AgentType:    "omp",
		Status:       "idle",
		ProjectID:    store.ProjectID,
		TaskID:       task.ID,
		CreatedAt:    formatChatTime(now),
		UpdatedAt:    formatChatTime(now),
		Messages:     []models.ChatMessage{},
		MessageQueue: []string{},
	}
	workflow.ChatSessionID = session.ID
	return session, true, store.Chats.Save(session)
}

func applyToolCallUpdate(toolCalls []models.ChatToolCall, update ACPUpdate) []models.ChatToolCall {
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
			return toolCalls
		}
	}
	toolName := update.ToolKind
	if toolName == "" {
		toolName = "tool"
	}
	return append(toolCalls, models.ChatToolCall{
		ID:     update.ToolCallID,
		Name:   toolName,
		Title:  update.ToolTitle,
		Input:  update.ToolInput,
		Output: update.ToolOutput,
		Status: update.ToolStatus,
	})
}

func (m *Manager) emitChatSession(event ChatEvent) {
	if m.chatEmit != nil {
		m.chatEmit(event)
	}
}

func (m *Manager) emitChatMessage(event ChatEvent) {
	if m.chatEmit != nil {
		m.chatEmit(event)
	}
}

func chatPhaseAllowed(phase models.AgentPhase) bool {
	return phase == models.AgentPhaseIdle ||
		phase == models.AgentPhasePlanReview ||
		phase == models.AgentPhaseCodeReview ||
		phase == models.AgentPhaseFixReady ||
		phase == models.AgentPhaseCompleted
}

func formatChatTime(t time.Time) string {
	return t.UTC().Format(time.RFC3339Nano)
}
