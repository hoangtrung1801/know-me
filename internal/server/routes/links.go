package routes

import (
	"encoding/json"
	"errors"
	"io"
	"mime"
	"net/http"
	"os"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/hoangtrung1801/know-me/internal/links"
	"github.com/hoangtrung1801/know-me/internal/models"
)

const maxLinkMultipartBytes = 11 << 20

type LinkRoutes struct{ service *links.Service }

func (lr *LinkRoutes) Register(r chi.Router) {
	r.Get("/links", lr.list)
	r.Post("/links", lr.create)
	r.Patch("/links/{id}", lr.update)
	r.Get("/links/{id}/image", lr.image)
}

func (lr *LinkRoutes) list(w http.ResponseWriter, r *http.Request) {
	if !r.URL.Query().Has("q") {
		items, err := lr.service.List()
		if err != nil {
			respondError(w, http.StatusInternalServerError, err.Error())
			return
		}
		respondJSON(w, http.StatusOK, items)
		return
	}

	q := r.URL.Query().Get("q")
	modeParam := r.URL.Query().Get("mode")
	effectiveMode := "keyword"
	if modeParam == "semantic" || modeParam == "hybrid" {
		effectiveMode = modeParam
	}

	results, fallback, err := lr.service.Search(q, effectiveMode)
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if results == nil {
		results = []links.RankedLink{}
	}

	respondJSON(w, http.StatusOK, map[string]any{
		"links":    results,
		"mode":     effectiveMode,
		"fallback": fallback,
	})
}

func (lr *LinkRoutes) create(w http.ResponseWriter, r *http.Request) {
	var urlValue, note string
	var tags []string
	var image io.Reader
	mediaType, _, _ := mime.ParseMediaType(r.Header.Get("Content-Type"))
	if mediaType == "multipart/form-data" {
		r.Body = http.MaxBytesReader(w, r.Body, maxLinkMultipartBytes)
		if err := r.ParseMultipartForm(maxLinkMultipartBytes); err != nil {
			respondError(w, http.StatusBadRequest, err.Error())
			return
		}
		urlValue = r.FormValue("url")
		note = r.FormValue("note")
		if r.Form.Has("tags") {
			tags = append(tags, r.Form["tags"]...)
		}
		if r.Form.Has("tag") {
			tags = append(tags, r.Form["tag"]...)
		}
		file, _, err := r.FormFile("image")
		if err == nil {
			defer file.Close()
			image = file
		}
	} else {
		var input struct {
			URL  string          `json:"url"`
			Note string          `json:"note"`
			Tags json.RawMessage `json:"tags"`
			Tag  json.RawMessage `json:"tag"`
		}
		if err := decodeJSON(r, &input); err != nil {
			respondError(w, http.StatusBadRequest, "invalid JSON body")
			return
		}
		urlValue = input.URL
		note = input.Note
		tags = append(tags, parseTagsFromRaw(input.Tags)...)
		tags = append(tags, parseTagsFromRaw(input.Tag)...)
	}
	link, err := lr.service.AddWithTags(r.Context(), urlValue, note, tags, image)
	if err != nil {
		linkError(w, err)
		return
	}
	respondJSON(w, http.StatusCreated, link)
}

func (lr *LinkRoutes) update(w http.ResponseWriter, r *http.Request) {
	var title, description, note *string
	var tags []string
	var hasTags bool
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
		if r.Form.Has("note") {
			value := r.FormValue("note")
			note = &value
		}
		if r.Form.Has("tags") {
			tags = append(tags, r.Form["tags"]...)
			hasTags = true
		}
		if r.Form.Has("tag") {
			tags = append(tags, r.Form["tag"]...)
			hasTags = true
		}
		file, _, err := r.FormFile("image")
		if err == nil {
			defer file.Close()
			image = file
		}
	} else {
		var input struct {
			Title       *string         `json:"title"`
			Description *string         `json:"description"`
			Note        *string         `json:"note"`
			Tags        json.RawMessage `json:"tags"`
			Tag         json.RawMessage `json:"tag"`
		}
		if err := decodeJSON(r, &input); err != nil {
			respondError(w, http.StatusBadRequest, "invalid JSON body")
			return
		}
		title, description, note = input.Title, input.Description, input.Note
		if len(input.Tags) > 0 && string(input.Tags) != "null" {
			tags = append(tags, parseTagsFromRaw(input.Tags)...)
			hasTags = true
		}
		if len(input.Tag) > 0 && string(input.Tag) != "null" {
			tags = append(tags, parseTagsFromRaw(input.Tag)...)
			hasTags = true
		}
	}
	var updateTags []string
	if hasTags {
		updateTags = tags
	} else {
		updateTags = nil
	}
	link, err := lr.service.UpdateWithTags(r.Context(), chi.URLParam(r, "id"), title, description, note, updateTags, image)
	if err != nil {
		linkError(w, err)
		return
	}
	respondJSON(w, http.StatusOK, link)
}

func parseTagsFromRaw(raw json.RawMessage) []string {
	if len(raw) == 0 || string(raw) == "null" {
		return nil
	}
	var arr []string
	if err := json.Unmarshal(raw, &arr); err == nil {
		return arr
	}
	var s string
	if err := json.Unmarshal(raw, &s); err == nil {
		return strings.Split(s, ",")
	}
	return nil
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
