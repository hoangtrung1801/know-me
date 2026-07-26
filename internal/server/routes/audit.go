package routes

import (
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/howznguyen/knowns/internal/models"
	"github.com/howznguyen/knowns/internal/storage"
)

// AuditRoutes handles /api/audit endpoints.
// Audit data is global (not project-scoped), so it uses its own AuditStore.
type AuditRoutes struct {
	auditStore *storage.AuditStore
}

// Register wires the audit routes onto r.
func (ar *AuditRoutes) Register(r chi.Router) {
	r.Get("/audit/recent", ar.recent)
	r.Get("/audit/stats", ar.stats)
}

// recent returns recent MCP audit events.
//
// GET /api/audit/recent?limit=50&tool=tasks&result=success&project=/path
func (ar *AuditRoutes) recent(w http.ResponseWriter, r *http.Request) {
	limit := 50
	if v := r.URL.Query().Get("limit"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			limit = n
		}
	}

	filter := buildAuditFilter(r)

	events, err := ar.auditStore.Recent(limit, filter)
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}

	if events == nil {
		events = make([]*models.AuditEvent, 0)
	}

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"events": events,
		"count":  len(events),
	})
}

// stats returns aggregate audit statistics.
//
// GET /api/audit/stats?project=/path&tool=tasks
func (ar *AuditRoutes) stats(w http.ResponseWriter, r *http.Request) {
	filter := buildAuditFilter(r)

	stats, err := ar.auditStore.Stats(filter)
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}

	respondJSON(w, http.StatusOK, stats)
}

func buildAuditFilter(r *http.Request) *storage.AuditFilter {
	q := r.URL.Query()
	tool := q.Get("tool")
	result := q.Get("result")
	project := q.Get("project")

	if tool == "" && result == "" && project == "" {
		return nil
	}

	return &storage.AuditFilter{
		ToolName: tool,
		Result:   result,
		Project:  project,
	}
}
