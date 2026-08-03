package routes

import (
	"errors"
	"io"
	"mime"
	"net/http"
	"os"

	"github.com/go-chi/chi/v5"
	"github.com/hoangtrung1801/known-me/internal/links"
	"github.com/hoangtrung1801/known-me/internal/models"
)

const maxLinkMultipartBytes = 11 << 20

type LinkRoutes struct{ service *links.Service }

func (lr *LinkRoutes) Register(r chi.Router) {
	r.Get("/links", lr.list)
	r.Post("/links", lr.create)
	r.Patch("/links/{id}", lr.update)
	r.Get("/links/{id}/image", lr.image)
}

func (lr *LinkRoutes) list(w http.ResponseWriter, _ *http.Request) {
	items, err := lr.service.List()
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}
	respondJSON(w, http.StatusOK, items)
}

func (lr *LinkRoutes) create(w http.ResponseWriter, r *http.Request) {
	var urlValue string
	var image io.Reader
	mediaType, _, _ := mime.ParseMediaType(r.Header.Get("Content-Type"))
	if mediaType == "multipart/form-data" {
		r.Body = http.MaxBytesReader(w, r.Body, maxLinkMultipartBytes)
		if err := r.ParseMultipartForm(maxLinkMultipartBytes); err != nil {
			respondError(w, http.StatusBadRequest, err.Error())
			return
		}
		urlValue = r.FormValue("url")
		file, _, err := r.FormFile("image")
		if err == nil {
			defer file.Close()
			image = file
		}
	} else {
		var input struct {
			URL string `json:"url"`
		}
		if err := decodeJSON(r, &input); err != nil {
			respondError(w, http.StatusBadRequest, "invalid JSON body")
			return
		}
		urlValue = input.URL
	}
	link, err := lr.service.Add(r.Context(), urlValue, image)
	if err != nil {
		linkError(w, err)
		return
	}
	respondJSON(w, http.StatusCreated, link)
}

func (lr *LinkRoutes) update(w http.ResponseWriter, r *http.Request) {
	var title, description *string
	var image io.Reader
	mediaType, _, _ := mime.ParseMediaType(r.Header.Get("Content-Type"))
	if mediaType == "multipart/form-data" {
		r.Body = http.MaxBytesReader(w, r.Body, maxLinkMultipartBytes)
		if err := r.ParseMultipartForm(maxLinkMultipartBytes); err != nil {
			respondError(w, http.StatusBadRequest, err.Error())
			return
		}
		if r.Form.Has("title") {
			value := r.FormValue("title")
			title = &value
		}
		if r.Form.Has("description") {
			value := r.FormValue("description")
			description = &value
		}
		file, _, err := r.FormFile("image")
		if err == nil {
			defer file.Close()
			image = file
		}
	} else {
		var input struct {
			Title       *string `json:"title"`
			Description *string `json:"description"`
		}
		if err := decodeJSON(r, &input); err != nil {
			respondError(w, http.StatusBadRequest, "invalid JSON body")
			return
		}
		title, description = input.Title, input.Description
	}
	link, err := lr.service.Update(r.Context(), chi.URLParam(r, "id"), title, description, image)
	if err != nil {
		linkError(w, err)
		return
	}
	respondJSON(w, http.StatusOK, link)
}

func (lr *LinkRoutes) image(w http.ResponseWriter, r *http.Request) {
	path, err := lr.service.LocalImagePath(chi.URLParam(r, "id"))
	if err != nil {
		respondError(w, http.StatusNotFound, "image not found")
		return
	}
	if _, err := os.Stat(path); err != nil {
		respondError(w, http.StatusNotFound, "image not found")
		return
	}
	w.Header().Set("X-Content-Type-Options", "nosniff")
	http.ServeFile(w, r, path)
}

func linkError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, links.ErrInvalidURL):
		respondError(w, http.StatusBadRequest, err.Error())
	case errors.Is(err, links.ErrUnsafeURL):
		respondError(w, http.StatusBadRequest, err.Error())
	case errors.Is(err, models.ErrInvalidLinkImage):
		respondError(w, http.StatusBadRequest, err.Error())
	case errors.Is(err, models.ErrLinkNotFound):
		respondError(w, http.StatusNotFound, "link not found")
	default:
		respondError(w, http.StatusInternalServerError, err.Error())
	}
}
