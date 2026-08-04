package routes

import (
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/hoangtrung1801/known-me/internal/registry"
	"github.com/hoangtrung1801/known-me/internal/storage"
)

// WorkspaceRoutes exposes the global logical-project registry.
type WorkspaceRoutes struct{ manager *storage.Manager }

func (wr *WorkspaceRoutes) Register(r chi.Router) {
	r.Get("/workspaces", wr.list)
	r.Post("/workspaces", wr.create)
	r.Post("/workspaces/switch", wr.switchWorkspace)
	r.Delete("/workspaces/{id}", wr.remove)
}

func (wr *WorkspaceRoutes) switchWorkspace(w http.ResponseWriter, r *http.Request) {
	var body struct {
		ID string `json:"id"`
	}
	if err := decodeJSON(r, &body); err != nil || body.ID == "" {
		respondError(w, http.StatusBadRequest, "id is required")
		return
	}
	if err := wr.manager.GetRegistry().SetActive(body.ID); err != nil {
		respondError(w, http.StatusNotFound, err.Error())
		return
	}
	respondJSON(w, http.StatusOK, map[string]string{"status": "selected"})
}

func (wr *WorkspaceRoutes) list(w http.ResponseWriter, _ *http.Request) {
	if wr.manager == nil || wr.manager.GetRegistry() == nil {
		respondJSON(w, http.StatusOK, []struct{}{})
		return
	}
	projects := wr.manager.GetRegistry().Projects
	if projects == nil {
		projects = []registry.Project{}
	}
	respondJSON(w, http.StatusOK, projects)
}

func (wr *WorkspaceRoutes) create(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Name string `json:"name"`
	}
	if err := decodeJSON(r, &body); err != nil || strings.TrimSpace(body.Name) == "" {
		respondError(w, http.StatusBadRequest, "project name is required")
		return
	}
	if wr.manager == nil || wr.manager.GetRegistry() == nil {
		respondError(w, http.StatusInternalServerError, "registry not available")
		return
	}
	project, err := wr.manager.GetRegistry().Create(body.Name)
	if err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}
	respondJSON(w, http.StatusCreated, project)
}

func (wr *WorkspaceRoutes) remove(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if id == "" {
		respondError(w, http.StatusBadRequest, "id is required")
		return
	}
	if wr.manager == nil || wr.manager.GetRegistry() == nil {
		respondError(w, http.StatusInternalServerError, "registry not available")
		return
	}
	if err := wr.manager.GetRegistry().Remove(id); err != nil {
		respondError(w, http.StatusNotFound, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
