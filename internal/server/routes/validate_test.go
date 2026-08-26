package routes

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/hoangtrung1801/known-me/internal/models"
	"github.com/hoangtrung1801/known-me/internal/storage"
)

func TestValidateSDDIncludesDecisionContractStats(t *testing.T) {
	t.Setenv("HOME", t.TempDir())
	store := storage.NewStore(filepath.Join(t.TempDir(), ".known-me"))
	if err := store.Init("validate-route-test"); err != nil {
		t.Fatalf("init store: %v", err)
	}
	now := time.Now().UTC()
	if err := store.Docs.Create(&models.Doc{
		Path: "specs/decision-contract", Title: "Decision contract", Tags: []string{"spec", "approved"}, CreatedAt: now, UpdatedAt: now,
		Content: "## Locked Decisions\n\n- D1: Keep the contract stable.\n\n## System Decision Impact\n\n- Impact: none.",
	}); err != nil {
		t.Fatalf("create spec: %v", err)
	}
	for _, task := range []*models.Task{
		{ID: "done01", Title: "Compliant", Status: "done", Priority: "medium", Spec: "specs/decision-contract", ImplementationNotes: "Spec Decision Compliance: D1=pass", AcceptanceCriteria: []models.AcceptanceCriterion{{Text: "Done", Completed: true}}},
		{ID: "work01", Title: "Unassessed", Status: "in-progress", Priority: "medium", Spec: "specs/decision-contract", AcceptanceCriteria: []models.AcceptanceCriterion{{Text: "Pending"}}},
	} {
		if err := store.Tasks.Create(task); err != nil {
			t.Fatalf("create task %s: %v", task.ID, err)
		}
	}

	router := chi.NewRouter()
	(&ValidateRoutes{store: store}).Register(router)
	req := httptest.NewRequest("GET", "/validate/sdd", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("GET /validate/sdd status = %d: %s", w.Code, w.Body.String())
	}
	var response struct {
		Stats struct {
			Decisions map[string]int `json:"decisions"`
		} `json:"stats"`
		Warnings []SDDWarning `json:"warnings"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &response); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if response.Stats.Decisions["compliant"] != 1 || response.Stats.Decisions["unassessed"] != 1 || response.Stats.Decisions["impactDeclared"] != 1 {
		t.Fatalf("decision stats = %#v", response.Stats.Decisions)
	}
	foundUnassessed := false
	for _, warning := range response.Warnings {
		if warning.Type == "SDD_SPEC_DECISIONS_UNASSESSED" && warning.Entity == "work01" {
			foundUnassessed = true
		}
	}
	if !foundUnassessed {
		t.Fatalf("warnings = %#v, want unassessed task warning", response.Warnings)
	}
}

func TestValidateSDDUsesProjectIDOnlyWhenProvided(t *testing.T) {
	root := t.TempDir()
	projectOne := storage.NewProjectStore(root, "p1", t.TempDir())
	projectTwo := storage.NewProjectStore(root, "p2", t.TempDir())
	if err := projectOne.Init("project one"); err != nil {
		t.Fatal(err)
	}
	if err := projectTwo.Init("project two"); err != nil {
		t.Fatal(err)
	}
	for _, project := range []*storage.Store{projectOne, projectTwo} {
		if err := project.Tasks.Create(&models.Task{ID: project.ProjectID + "-task", Title: project.ProjectID, Status: "todo", Priority: "medium"}); err != nil {
			t.Fatal(err)
		}
	}

	router := chi.NewRouter()
	(&ValidateRoutes{store: projectOne}).Register(router)
	readTotal := func(path string) int {
		t.Helper()
		w := httptest.NewRecorder()
		router.ServeHTTP(w, httptest.NewRequest(http.MethodGet, path, nil))
		if w.Code != http.StatusOK {
			t.Fatalf("GET %s status=%d body=%s", path, w.Code, w.Body.String())
		}
		var response struct {
			Stats struct {
				Tasks struct {
					Total int `json:"total"`
				} `json:"tasks"`
			} `json:"stats"`
		}
		if err := json.Unmarshal(w.Body.Bytes(), &response); err != nil {
			t.Fatal(err)
		}
		return response.Stats.Tasks.Total
	}

	if got := readTotal("/validate/sdd"); got != 2 {
		t.Fatalf("global task total = %d, want 2", got)
	}
	if got := readTotal("/validate/sdd?projectId=p2"); got != 1 {
		t.Fatalf("filtered task total = %d, want 1", got)
	}
}
