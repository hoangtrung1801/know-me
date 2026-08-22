package routes

import (
	"fmt"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/hoangtrung1801/known-me/internal/models"
	"github.com/hoangtrung1801/known-me/internal/storage"
	"github.com/hoangtrung1801/known-me/internal/tasklifecycle"
)

// TimeRoutes handles /api/time endpoints.
type TimeRoutes struct {
	store *storage.Store
	mgr   *storage.Manager
	sse   Broadcaster
}

func (tr *TimeRoutes) getStore() *storage.Store {
	if tr.mgr != nil {
		return tr.mgr.GetStore()
	}
	return tr.store
}

// Register wires the time-tracking routes onto r.
func (tr *TimeRoutes) Register(r chi.Router) {
	r.Get("/time/status", tr.status)
	r.Post("/time/start", tr.start)
	r.Post("/time/stop", tr.stop)
	r.Post("/time/add", tr.add)
	r.Post("/time/pause", tr.pause)
	r.Post("/time/resume", tr.resume)
}

// status lists all active timers.
//
// GET /api/time/status
func (tr *TimeRoutes) status(w http.ResponseWriter, r *http.Request) {
	state, err := tr.getStore().Time.GetState()
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}
	respondJSON(w, http.StatusOK, state)
}

// startRequest is the body for POST /api/time/start.
type startRequest struct {
	TaskID string `json:"taskId"`
}

// start begins a timer for a task.
//
// POST /api/time/start
func (tr *TimeRoutes) start(w http.ResponseWriter, r *http.Request) {
	var req startRequest
	if err := decodeJSON(r, &req); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body: "+err.Error())
		return
	}
	if req.TaskID == "" {
		respondError(w, http.StatusBadRequest, "taskId is required")
		return
	}

	task, err := resolveHTTPTask(tr.getStore(), r, req.TaskID)
	if err != nil {
		respondError(w, http.StatusNotFound, "task not found: "+err.Error())
		return
	}
	target := taskStoreForHTTP(tr.getStore(), task, tr.mgr)

	if err := target.Time.Start(httpTaskID(task), task.Title); err != nil {
		respondError(w, http.StatusConflict, err.Error())
		return
	}

	state, _ := target.Time.GetState()
	tr.sse.Broadcast(SSEEvent{Type: "time:updated", Data: state})
	respondJSON(w, http.StatusOK, map[string]interface{}{
		"taskId": req.TaskID,
		"status": "started",
		"active": state.Active,
	})
}

// stopRequest is the body for POST /api/time/stop.
type stopRequest struct {
	TaskID string `json:"taskId"`
	All    bool   `json:"all"`
}

// stop terminates one or all active timers.
//
// POST /api/time/stop
func (tr *TimeRoutes) stop(w http.ResponseWriter, r *http.Request) {
	var req stopRequest
	if err := decodeJSON(r, &req); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body: "+err.Error())
		return
	}

	if req.All {
		state, err := tr.getStore().Time.GetState()
		if err != nil {
			respondError(w, http.StatusInternalServerError, err.Error())
			return
		}
		var stopped []string
		target := storage.NewStore(tr.getStore().Root)
		for _, a := range state.Active {
			entry, err := tasklifecycle.New(target).StopTimer(r.Context(), a.TaskID, "api")
			if err == nil {
				stopped = append(stopped, a.TaskID)
				_ = entry
			}
		}
		newState, _ := tr.getStore().Time.GetState()
		tr.sse.Broadcast(SSEEvent{Type: "time:updated", Data: newState})
		respondJSON(w, http.StatusOK, map[string]interface{}{
			"stopped": stopped,
			"active":  newState.Active,
		})
		return
	}

	if req.TaskID == "" {
		respondError(w, http.StatusBadRequest, "taskId is required (or set all:true)")
		return
	}
	task, err := resolveHTTPTask(tr.getStore(), r, req.TaskID)
	if err != nil {
		respondError(w, http.StatusNotFound, err.Error())
		return
	}
	entry, err := tasklifecycle.New(taskStoreForHTTP(tr.getStore(), task, tr.mgr)).StopTimer(r.Context(), httpTaskID(task), "api")
	if err != nil {
		respondError(w, http.StatusNotFound, err.Error())
		return
	}
	state, _ := tr.getStore().Time.GetState()
	tr.sse.Broadcast(SSEEvent{Type: "time:updated", Data: state})
	respondJSON(w, http.StatusOK, map[string]interface{}{
		"stopped": []interface{}{entry},
		"active":  state.Active,
	})
}

type addTimeRequest struct {
	TaskID    string     `json:"taskId"`
	Duration  int        `json:"duration"`
	Note      string     `json:"note,omitempty"`
	StartedAt *time.Time `json:"startedAt,omitempty"`
}

// add appends a manual entry and updates Task.TimeSpent atomically.
func (tr *TimeRoutes) add(w http.ResponseWriter, r *http.Request) {
	var req addTimeRequest
	if err := decodeJSON(r, &req); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body: "+err.Error())
		return
	}
	if req.TaskID == "" {
		respondError(w, http.StatusBadRequest, "taskId is required")
		return
	}
	if req.Duration < 0 {
		respondError(w, http.StatusBadRequest, "duration must be non-negative")
		return
	}
	startedAt := time.Now().UTC()
	if req.StartedAt != nil {
		startedAt = req.StartedAt.UTC()
	}
	endedAt := startedAt.Add(time.Duration(req.Duration) * time.Second)
	entry := models.TimeEntry{ID: fmt.Sprintf("te-%d-%s", startedAt.UnixNano(), req.TaskID), StartedAt: startedAt, EndedAt: &endedAt, Duration: req.Duration, Note: req.Note}
	task, err := resolveHTTPTask(tr.getStore(), r, req.TaskID)
	if err != nil {
		respondError(w, http.StatusNotFound, err.Error())
		return
	}
	taskID := httpTaskID(task)
	entry.ID = fmt.Sprintf("te-%d-%s", startedAt.UnixNano(), taskID)
	recorded, err := tasklifecycle.New(taskStoreForHTTP(tr.getStore(), task, tr.mgr)).AddTimeEntry(r.Context(), taskID, tasklifecycle.TimeMutationOptions{Actor: "api", Entry: entry})
	if err != nil {
		respondError(w, http.StatusConflict, err.Error())
		return
	}
	state, _ := tr.getStore().Time.GetState()
	if tr.sse != nil {
		tr.sse.Broadcast(SSEEvent{Type: "time:updated", Data: state})
	}
	respondJSON(w, http.StatusOK, map[string]any{"taskId": req.TaskID, "entry": recorded, "duration": req.Duration})
}

// pauseResumeRequest is the body for /api/time/pause and /api/time/resume.
type pauseResumeRequest struct {
	TaskID string `json:"taskId"`
}

// pause pauses the timer for a task.
//
// POST /api/time/pause
func (tr *TimeRoutes) pause(w http.ResponseWriter, r *http.Request) {
	var req pauseResumeRequest
	if err := decodeJSON(r, &req); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body: "+err.Error())
		return
	}
	if req.TaskID == "" {
		respondError(w, http.StatusBadRequest, "taskId is required")
		return
	}
	task, err := resolveHTTPTask(tr.getStore(), r, req.TaskID)
	if err != nil {
		respondError(w, http.StatusNotFound, err.Error())
		return
	}
	if err := taskStoreForHTTP(tr.getStore(), task, tr.mgr).Time.Pause(httpTaskID(task)); err != nil {
		respondError(w, http.StatusConflict, err.Error())
		return
	}
	state, _ := tr.getStore().Time.GetState()
	tr.sse.Broadcast(SSEEvent{Type: "time:updated", Data: state})
	respondJSON(w, http.StatusOK, map[string]interface{}{
		"taskId": req.TaskID,
		"status": "paused",
		"active": state.Active,
	})
}

// resume resumes a paused timer.
//
// POST /api/time/resume
func (tr *TimeRoutes) resume(w http.ResponseWriter, r *http.Request) {
	var req pauseResumeRequest
	if err := decodeJSON(r, &req); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body: "+err.Error())
		return
	}
	if req.TaskID == "" {
		respondError(w, http.StatusBadRequest, "taskId is required")
		return
	}
	task, err := resolveHTTPTask(tr.getStore(), r, req.TaskID)
	if err != nil {
		respondError(w, http.StatusNotFound, err.Error())
		return
	}
	if err := taskStoreForHTTP(tr.getStore(), task, tr.mgr).Time.Resume(httpTaskID(task)); err != nil {
		respondError(w, http.StatusConflict, err.Error())
		return
	}
	state, _ := tr.getStore().Time.GetState()
	tr.sse.Broadcast(SSEEvent{Type: "time:updated", Data: state})
	respondJSON(w, http.StatusOK, map[string]interface{}{
		"taskId": req.TaskID,
		"status": "resumed",
		"active": state.Active,
	})
}
