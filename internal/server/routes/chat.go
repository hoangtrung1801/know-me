package routes

import (
	"context"
	"errors"
	"fmt"
	"log"
	"net/http"
	"sort"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/hoangtrung1801/know-me/internal/agents/codex"
	"github.com/hoangtrung1801/know-me/internal/models"
	"github.com/hoangtrung1801/know-me/internal/storage"
)

type agentInfo struct {
	Name        string `json:"name"`
	DisplayName string `json:"displayName"`
	Available   bool   `json:"available"`
}

type CodexChatRunner interface {
	StartChat(context.Context, *storage.Store, string, string) error
	StopChat(context.Context, *storage.Store, string) error
}

// ChatRoutes handles /api/chats endpoints.
type ChatRoutes struct {
	store       *storage.Store
	mgr         *storage.Manager
	sse         Broadcaster
	projectRoot string
	codexChat   CodexChatRunner
}

func (cr *ChatRoutes) getStore() *storage.Store {
	if cr.mgr != nil {
		return cr.mgr.GetStore()
	}
	return cr.store
}

func (cr *ChatRoutes) sessionForRequest(id string) (*models.ChatSession, error) {
	store := cr.getStore()
	session, err := store.Chats.Get(id)
	if err != nil {
		return nil, err
	}
	if session.AgentType == "codex" && session.TaskID != "" && session.ProjectID != store.ProjectID {
		return nil, fmt.Errorf("%w: %q", storage.ErrChatNotFound, id)
	}
	return session, nil
}

// Register registers all chat routes on the given router.
func (cr *ChatRoutes) Register(r chi.Router) {
	r.Get("/chats", cr.listSessions)
	r.Post("/chats", cr.createSession)
	r.Get("/chats/agents", cr.listAgents)
	r.Get("/chats/{id}", cr.getSession)
	r.Patch("/chats/{id}", cr.updateSession)
	r.Delete("/chats/{id}", cr.deleteSession)
	r.Post("/chats/{id}/send", cr.sendMessage)
	r.Post("/chats/{id}/stop", cr.stopChat)
	r.Get("/chats/{id}/queue", cr.getQueue)
	r.Post("/chats/{id}/process-queue", cr.processQueue)
}

// GET /api/chats — list sessions sorted by updatedAt desc
func (cr *ChatRoutes) listSessions(w http.ResponseWriter, r *http.Request) {
	sessions, err := cr.getStore().Chats.List()
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if projectID := cr.getStore().ProjectID; projectID != "" {
		filtered := sessions[:0]
		for _, session := range sessions {
			if session.AgentType == "codex" && session.TaskID != "" && session.ProjectID != projectID {
				continue
			}
			filtered = append(filtered, session)
		}
		sessions = filtered
	}
	sort.Slice(sessions, func(i, j int) bool {
		return sessions[i].UpdatedAt > sessions[j].UpdatedAt
	})
	respondJSON(w, http.StatusOK, sessions)
}

// POST /api/chats — create session
func (cr *ChatRoutes) createSession(w http.ResponseWriter, r *http.Request) {
	var input struct {
		AgentType string `json:"agentType"`
		Model     string `json:"model"`
		Title     string `json:"title"`
		TaskID    string `json:"taskId"`
	}
	if err := decodeJSON(r, &input); err != nil {
		respondError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}

	if input.AgentType == "" {
		input.AgentType = "claude"
	}
	if input.AgentType != "claude" && input.AgentType != "opencode" && input.AgentType != "codex" {
		respondError(w, http.StatusBadRequest, fmt.Sprintf("unsupported agent type %q (use claude, opencode, or codex)", input.AgentType))
		return
	}
	if input.AgentType == "codex" {
		if input.TaskID == "" {
			respondError(w, http.StatusBadRequest, "taskId is required for Codex sessions")
			return
		}
		if _, err := cr.getStore().Tasks.Get(input.TaskID); err != nil {
			respondError(w, http.StatusNotFound, err.Error())
			return
		}
		if existing, err := cr.getStore().Chats.FindTaskSession(cr.getStore().ProjectID, input.TaskID, "codex"); err == nil {
			respondJSON(w, http.StatusOK, existing)
			return
		}
	}
	if input.Title == "" {
		input.Title = "New Chat"
	}

	now := time.Now().UTC().Format(time.RFC3339)
	session := &models.ChatSession{
		ID:        models.NewTaskID(),
		SessionID: uuid.New().String(),
		Title:     input.Title,
		AgentType: input.AgentType,
		Model:     input.Model,
		Status:    "idle",
		ProjectID: cr.getStore().ProjectID,
		TaskID:    input.TaskID,
		CreatedAt: now,
		UpdatedAt: now,
		Messages:  []models.ChatMessage{},
	}

	if err := cr.getStore().Chats.Save(session); err != nil {
		status := http.StatusInternalServerError
		if errors.Is(err, storage.ErrChatConflict) {
			status = http.StatusConflict
		}
		respondError(w, status, err.Error())
		return
	}

	cr.sse.Broadcast(SSEEvent{Type: "chats:created", Data: map[string]interface{}{"session": session}})
	respondJSON(w, http.StatusCreated, session)
}

// GET /api/chats/agents — available agents + models
func (cr *ChatRoutes) listAgents(w http.ResponseWriter, r *http.Request) {
	respondJSON(w, http.StatusOK, map[string]interface{}{
		"agents": []agentInfo{},
		"models": []string{},
	})
}

// GET /api/chats/{id} — get session
func (cr *ChatRoutes) getSession(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	session, err := cr.sessionForRequest(id)
	if err != nil {
		respondError(w, http.StatusNotFound, err.Error())
		return
	}

	// If session has OpenCode sessionID, load messages from OpenCode
	if session.SessionID != "" && session.AgentType == "opencode" {
		respondError(w, http.StatusServiceUnavailable, "OpenCode integration not available")
		return
	}

	respondJSON(w, http.StatusOK, session)
}

// PATCH /api/chats/{id} — update title or model (reject agentType changes)
func (cr *ChatRoutes) updateSession(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	session, err := cr.sessionForRequest(id)
	if err != nil {
		respondError(w, http.StatusNotFound, err.Error())
		return
	}

	var input struct {
		Title     *string `json:"title"`
		Model     *string `json:"model"`
		AgentType *string `json:"agentType"`
	}
	if err := decodeJSON(r, &input); err != nil {
		respondError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}

	if input.AgentType != nil && *input.AgentType != session.AgentType {
		respondError(w, http.StatusBadRequest, "agentType is immutable per session")
		return
	}
	updated, err := cr.getStore().Chats.Update(id, func(session *models.ChatSession) error {
		if input.Title != nil {
			session.Title = *input.Title
		}
		if input.Model != nil {
			session.Model = *input.Model
		}
		session.UpdatedAt = time.Now().UTC().Format(time.RFC3339)
		return nil
	})
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}

	cr.sse.Broadcast(SSEEvent{Type: "chats:updated", Data: map[string]interface{}{"session": updated}})
	respondJSON(w, http.StatusOK, updated)
}

// DELETE /api/chats/{id} — delete session + stop if streaming
func (cr *ChatRoutes) deleteSession(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	session, err := cr.sessionForRequest(id)
	if err != nil {
		respondError(w, http.StatusNotFound, err.Error())
		return
	}
	if session.AgentType == "codex" && session.TaskID != "" {
		respondError(w, http.StatusConflict, "task-bound Codex chats are deleted with their task")
		return
	}

	if err := cr.getStore().Chats.Delete(id); err != nil {
		respondError(w, http.StatusNotFound, err.Error())
		return
	}

	cr.sse.Broadcast(SSEEvent{Type: "chats:deleted", Data: map[string]interface{}{"chatId": id}})
	respondJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
}

const maxQueueSize = 10

// POST /api/chats/{id}/send — send message, spawn process, stream via WS
func (cr *ChatRoutes) sendMessage(w http.ResponseWriter, r *http.Request) {
	log.Printf("[chat] sendMessage handler called")
	id := chi.URLParam(r, "id")
	session, err := cr.sessionForRequest(id)
	if err != nil {
		respondError(w, http.StatusNotFound, err.Error())
		return
	}

	var input struct {
		Content string `json:"content"`
	}
	if err := decodeJSON(r, &input); err != nil {
		respondError(w, http.StatusBadRequest, "content is required")
		return
	}
	input.Content = strings.TrimSpace(input.Content)
	if input.Content == "" {
		respondError(w, http.StatusBadRequest, "content is required")
		return
	}

	if session.AgentType == "codex" {
		if session.TaskID == "" {
			respondError(w, http.StatusConflict, "Codex chat is not linked to a task")
			return
		}
		if cr.codexChat == nil {
			respondError(w, http.StatusServiceUnavailable, "Codex chat integration is not available")
			return
		}
		store := cr.getStore()
		if _, err := store.Tasks.Get(session.TaskID); err != nil {
			respondError(w, http.StatusNotFound, err.Error())
			return
		}
		if snapshot, err := store.Agent.TaskSnapshot(session.TaskID); err == nil && snapshot.Workflow.ActiveRunID != "" {
			for _, run := range snapshot.Runs {
				if run.ID == snapshot.Workflow.ActiveRunID && run.Phase != models.AgentRunPhaseChat {
					respondError(w, http.StatusConflict, "a gated Codex run currently owns this task")
					return
				}
			}
		}
		wasStreaming := session.Status == "streaming"
		if err := cr.codexChat.StartChat(r.Context(), store, session.TaskID, input.Content); err != nil {
			respondCodexChatError(w, err)
			return
		}
		respondJSON(w, http.StatusAccepted, map[string]interface{}{"accepted": true, "queued": wasStreaming})
		return
	}

	if session.Status == "streaming" {
		if session.MessageQueue == nil {
			session.MessageQueue = []string{}
		}
		if len(session.MessageQueue) >= maxQueueSize {
			respondError(w, http.StatusTooManyRequests, "Queue full, max 10 messages")
			return
		}
		position := len(session.MessageQueue) + 1
		session.MessageQueue = append(session.MessageQueue, input.Content)
		session.UpdatedAt = time.Now().UTC().Format(time.RFC3339)
		if err := cr.getStore().Chats.Save(session); err != nil {
			respondError(w, http.StatusInternalServerError, err.Error())
			return
		}
		respondJSON(w, http.StatusAccepted, map[string]interface{}{
			"queued":    true,
			"position":  position,
			"queueSize": len(session.MessageQueue),
		})
		return
	}

	respondError(w, http.StatusServiceUnavailable, "chat streaming not available")
}

// POST /api/chats/{id}/stop — kill running process
func (cr *ChatRoutes) stopChat(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	session, err := cr.sessionForRequest(id)
	if err != nil {
		respondError(w, http.StatusNotFound, err.Error())
		return
	}
	if session.AgentType == "codex" {
		if cr.codexChat == nil {
			respondError(w, http.StatusServiceUnavailable, "Codex chat integration is not available")
			return
		}
		if err := cr.codexChat.StopChat(r.Context(), cr.getStore(), session.TaskID); err != nil {
			respondCodexChatError(w, err)
			return
		}
		respondJSON(w, http.StatusOK, map[string]string{"status": "stopped"})
		return
	}

	session.Status = "idle"
	session.UpdatedAt = time.Now().UTC().Format(time.RFC3339)
	_ = cr.getStore().Chats.Save(session)
	cr.sse.Broadcast(SSEEvent{Type: "chats:updated", Data: map[string]interface{}{"session": session}})

	respondJSON(w, http.StatusOK, map[string]string{"status": "stopped"})
}

// GET /api/chats/{id}/queue — get queue status
func (cr *ChatRoutes) getQueue(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	session, err := cr.sessionForRequest(id)
	if err != nil {
		respondError(w, http.StatusNotFound, err.Error())
		return
	}

	queueSize := 0
	if session.MessageQueue != nil {
		queueSize = len(session.MessageQueue)
	}

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"queueSize": queueSize,
		"maxSize":   maxQueueSize,
		"messages":  session.MessageQueue,
	})
}

// POST /api/chats/{id}/process-queue — get and remove next message from queue
func (cr *ChatRoutes) processQueue(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	session, err := cr.sessionForRequest(id)
	if err != nil {
		respondError(w, http.StatusNotFound, err.Error())
		return
	}
	if session.AgentType == "codex" {
		respondJSON(w, http.StatusAccepted, map[string]interface{}{
			"hasMore":   len(session.MessageQueue) > 0,
			"message":   "",
			"queueSize": len(session.MessageQueue),
		})
		return
	}

	if session.MessageQueue == nil || len(session.MessageQueue) == 0 {
		respondJSON(w, http.StatusOK, map[string]interface{}{
			"hasMore": false,
			"message": "",
		})
		return
	}

	nextMessage := session.MessageQueue[0]
	session.MessageQueue = session.MessageQueue[1:]
	session.UpdatedAt = time.Now().UTC().Format(time.RFC3339)
	if err := cr.getStore().Chats.Save(session); err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}

	hasMore := len(session.MessageQueue) > 0
	respondJSON(w, http.StatusOK, map[string]interface{}{
		"hasMore":   hasMore,
		"message":   nextMessage,
		"queueSize": len(session.MessageQueue),
	})
}

func respondCodexChatError(w http.ResponseWriter, err error) {
	status := http.StatusInternalServerError
	switch {
	case errors.Is(err, codex.ErrInvalid):
		status = http.StatusBadRequest
	case errors.Is(err, codex.ErrNotFound):
		status = http.StatusNotFound
	case errors.Is(err, codex.ErrConflict):
		status = http.StatusConflict
	}
	respondError(w, status, err.Error())
}
