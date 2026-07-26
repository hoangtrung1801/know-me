package routes

import (
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/howznguyen/knowns/internal/storage"
)

// ActivityRoutes handles /api/activities endpoints.
type ActivityRoutes struct {
	store *storage.Store
	mgr   *storage.Manager
}

func (ar *ActivityRoutes) getStore() *storage.Store {
	if ar.mgr != nil {
		return ar.mgr.GetStore()
	}
	return ar.store
}

// Register wires the activity routes onto r.
func (ar *ActivityRoutes) Register(r chi.Router) {
	r.Get("/activities", ar.list)
}

// list returns recent activity from task version histories.
//
// GET /api/activities?limit=20&type=status
func (ar *ActivityRoutes) list(w http.ResponseWriter, r *http.Request) {
	limit := 20
	if v := r.URL.Query().Get("limit"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			limit = n
		}
	}

	typeFilter := r.URL.Query().Get("type")

	entries, err := ar.getStore().Versions.ListRecentActivities(limit, typeFilter)
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"activities": entries,
	})
}
