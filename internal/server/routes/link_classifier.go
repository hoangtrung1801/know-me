package routes

import (
	"errors"
	"net/http"
	"net/url"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/howznguyen/knowns/internal/links"
	"github.com/howznguyen/knowns/internal/storage"
)

type LinkClassifierRoutes struct {
	store *storage.LinkClassifierSettingsStore
}

type linkClassifierResponse struct {
	APIBase    string `json:"apiBase"`
	Model      string `json:"model"`
	Configured bool   `json:"configured"`
}

func (lr *LinkClassifierRoutes) Register(r chi.Router) {
	r.Get("/link-classifier", lr.get)
	r.Put("/link-classifier", lr.save)
	r.Post("/link-classifier/test", lr.test)
}

func (lr *LinkClassifierRoutes) get(w http.ResponseWriter, _ *http.Request) {
	config, err := lr.store.Load()
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}
	respondJSON(w, http.StatusOK, linkClassifierResponse{APIBase: config.APIBase, Model: config.Model, Configured: config.APIBase != "" && config.Model != ""})
}

func (lr *LinkClassifierRoutes) save(w http.ResponseWriter, r *http.Request) {
	var input struct {
		APIBase string `json:"apiBase"`
		APIKey  string `json:"apiKey"`
		Model   string `json:"model"`
	}
	if err := decodeJSON(r, &input); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	input.APIBase = strings.TrimSpace(input.APIBase)
	input.Model = strings.TrimSpace(input.Model)
	if err := validateClassifierBase(input.APIBase); err != nil || input.Model == "" {
		respondError(w, http.StatusBadRequest, "apiBase and model are required")
		return
	}
	config, err := lr.store.Load()
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}
	config.APIBase, config.Model = input.APIBase, input.Model
	if strings.TrimSpace(input.APIKey) != "" {
		config.APIKey = strings.TrimSpace(input.APIKey)
	}
	if err := lr.store.Save(*config); err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}
	respondJSON(w, http.StatusOK, linkClassifierResponse{APIBase: config.APIBase, Model: config.Model, Configured: true})
}

func (lr *LinkClassifierRoutes) test(w http.ResponseWriter, r *http.Request) {
	var config links.LinkClassifierConfig
	if err := decodeJSON(r, &config); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	_, err := links.NewOpenAIClassifier(config).Classify(r.Context(), "https://example.com", links.Metadata{Title: "Example", Description: "Example page"}, nil)
	if err != nil {
		respondJSON(w, http.StatusOK, map[string]any{"success": false, "error": err.Error()})
		return
	}
	respondJSON(w, http.StatusOK, map[string]any{"success": true})
}

func validateClassifierBase(raw string) error {
	parsed, err := url.Parse(raw)
	if err != nil || parsed.User != nil || parsed.Hostname() == "" || (parsed.Scheme != "http" && parsed.Scheme != "https") {
		return errors.New("invalid classifier API base")
	}
	return nil
}
