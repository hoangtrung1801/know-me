package routes

import (
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/hoangtrung1801/known-me/internal/memos"
	"github.com/hoangtrung1801/known-me/internal/models"
)

type MemoRoutes struct {
	service *memos.Service
}

func (mr *MemoRoutes) Register(r chi.Router) {
	r.Get("/memos", mr.list)
	r.Post("/memos", mr.create)
	r.Patch("/memos/{id}", mr.update)
	r.Delete("/memos/{id}", mr.delete)
}

func (mr *MemoRoutes) list(w http.ResponseWriter, r *http.Request) {
	items, err := mr.service.List(r.URL.Query().Get("q"))
	if err != nil {
		memoError(w, err)
		return
	}
	respondJSON(w, http.StatusOK, items)
}

func (mr *MemoRoutes) create(w http.ResponseWriter, r *http.Request) {
	var input struct {
		Content string `json:"content"`
	}
	if err := decodeJSON(r, &input); err != nil {
		respondError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	memo, err := mr.service.Add(input.Content)
	if err != nil {
		memoError(w, err)
		return
	}
	respondJSON(w, http.StatusCreated, memo)
}

func (mr *MemoRoutes) update(w http.ResponseWriter, r *http.Request) {
	var input struct {
		Content string `json:"content"`
	}
	if err := decodeJSON(r, &input); err != nil {
		respondError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	memo, err := mr.service.Update(chi.URLParam(r, "id"), input.Content)
	if err != nil {
		memoError(w, err)
		return
	}
	respondJSON(w, http.StatusOK, memo)
}

func (mr *MemoRoutes) delete(w http.ResponseWriter, r *http.Request) {
	if err := mr.service.Delete(chi.URLParam(r, "id")); err != nil {
		memoError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func memoError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, models.ErrInvalidMemoContent):
		respondError(w, http.StatusBadRequest, err.Error())
	case errors.Is(err, models.ErrMemoNotFound):
		respondError(w, http.StatusNotFound, err.Error())
	default:
		respondError(w, http.StatusInternalServerError, err.Error())
	}
}
