package routes

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/hoangtrung1801/known-me/internal/agents/codex"
	"github.com/hoangtrung1801/known-me/internal/storage"
)

type AgentRoutes struct {
	store *storage.Store
	mgr   *storage.Manager
	agent *codex.Manager
}

func NewAgentRoutes(store *storage.Store, mgr *storage.Manager, agent *codex.Manager) *AgentRoutes {
	return &AgentRoutes{store: store, mgr: mgr, agent: agent}
}

func (ar *AgentRoutes) getStore() *storage.Store {
	if ar.mgr != nil {
		return ar.mgr.GetStore()
	}
	return ar.store
}

func (ar *AgentRoutes) Register(r chi.Router) {
	r.Get("/codex/status", ar.status)
	r.Get("/tasks/{id}/agent", ar.snapshot)
	r.Post("/tasks/{id}/agent/{action}", ar.action)
	r.Get("/tasks/{id}/agent/runs/{runID}/log", ar.log)
}

func (ar *AgentRoutes) status(w http.ResponseWriter, r *http.Request) {
	store := ar.getStore()
	if store == nil || ar.agent == nil {
		respondError(w, http.StatusServiceUnavailable, "Codex agent is unavailable")
		return
	}
	respondJSON(w, http.StatusOK, ar.agent.Status(r.Context(), store))
}

func (ar *AgentRoutes) snapshot(w http.ResponseWriter, r *http.Request) {
	store := ar.getStore()
	if store == nil || ar.agent == nil {
		respondError(w, http.StatusServiceUnavailable, "Codex agent is unavailable")
		return
	}
	snapshot, err := ar.agent.Snapshot(r.Context(), store, chi.URLParam(r, "id"))
	if err != nil {
		respondAgentError(w, err)
		return
	}
	respondJSON(w, http.StatusOK, snapshot)
}

func (ar *AgentRoutes) action(w http.ResponseWriter, r *http.Request) {
	store := ar.getStore()
	if store == nil || ar.agent == nil {
		respondError(w, http.StatusServiceUnavailable, "Codex agent is unavailable")
		return
	}
	var body struct {
		Comment string `json:"comment"`
	}
	if r.Body != nil {
		err := json.NewDecoder(r.Body).Decode(&body)
		if err != nil && !errors.Is(err, io.EOF) {
			respondError(w, http.StatusBadRequest, "invalid request body: "+err.Error())
			return
		}
	}
	snapshot, started, err := ar.agent.Act(r.Context(), store, chi.URLParam(r, "id"), codex.Action(chi.URLParam(r, "action")), body.Comment)
	if err != nil {
		respondAgentError(w, err)
		return
	}
	status := http.StatusOK
	if started {
		status = http.StatusAccepted
	}
	respondJSON(w, status, snapshot)
}

func (ar *AgentRoutes) log(w http.ResponseWriter, r *http.Request) {
	store := ar.getStore()
	if store == nil || ar.agent == nil {
		respondError(w, http.StatusServiceUnavailable, "Codex agent is unavailable")
		return
	}
	content, err := ar.agent.ReadLog(store, chi.URLParam(r, "id"), chi.URLParam(r, "runID"))
	if err != nil {
		respondAgentError(w, err)
		return
	}
	respondJSON(w, http.StatusOK, map[string]string{"content": content})
}

func respondAgentError(w http.ResponseWriter, err error) {
	status := http.StatusInternalServerError
	switch {
	case errors.Is(err, codex.ErrInvalid):
		status = http.StatusBadRequest
	case errors.Is(err, codex.ErrNotFound):
		status = http.StatusNotFound
	case errors.Is(err, codex.ErrConflict):
		status = http.StatusConflict
	case errors.Is(err, io.EOF):
		status = http.StatusNotFound
	}
	respondError(w, status, err.Error())
}
