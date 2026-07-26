package models

import (
	"fmt"
	"strconv"
	"strings"
	"time"
)

// TimeEntry records a single interval of work logged against a task.
// Entries are stored in .knowns/time-entries.json, keyed by task ID.
//
// The ID format is "te-{unix-ms}-{taskId}" (e.g., "te-1700000000000-abc123").
type TimeEntry struct {
	// ID uniquely identifies this entry: "te-{timestamp}-{taskId}".
	ID string `json:"id"`

	StartedAt time.Time  `json:"startedAt"`
	EndedAt   *time.Time `json:"endedAt,omitempty"`

	// Duration is the elapsed wall-clock time in seconds.
	Duration int    `json:"duration"`
	Note     string `json:"note,omitempty"`
}

// ActiveTimer represents a running (or paused) timer stored in
// .knowns/time.json.  Multiple concurrent timers are supported – one per task.
//
// Timestamps are stored as ISO-8601 strings to match the TypeScript
// representation.  PausedAt uses a pointer so that it serialises to JSON null
// when the timer is not paused (matching the TypeScript null literal).
type ActiveTimer struct {
	TaskID    string `json:"taskId"`
	TaskTitle string `json:"taskTitle,omitempty"`

	// StartedAt is an ISO-8601 string, e.g. "2026-01-02T15:04:05.000Z".
	StartedAt string `json:"startedAt"`

	// PausedAt is the ISO-8601 timestamp at which the timer was paused, or
	// null when the timer is currently running.
	PausedAt *string `json:"pausedAt"`

	// TotalPausedMs is the cumulative milliseconds spent paused so far.
	TotalPausedMs int64 `json:"totalPausedMs"`
}

// TimeState is the root object persisted to .knowns/time.json.
type TimeState struct {
	Active []ActiveTimer `json:"active"`
}

// ParseDuration parses human-readable duration strings into seconds.
// Supported formats: "2h", "30m", "1h30m", "90s", "1h30m45s".
// Returns an error for unrecognised input.
func ParseDuration(s string) (int, error) {
	s = strings.TrimSpace(s)
	if s == "" {
		return 0, fmt.Errorf("empty duration string")
	}

	total := 0
	rest := s

	// Extract hours
	if hi := strings.Index(rest, "h"); hi >= 0 {
		h, err := strconv.Atoi(rest[:hi])
		if err != nil {
			return 0, fmt.Errorf("invalid hours in %q: %w", s, err)
		}
		total += h * 3600
		rest = rest[hi+1:]
	}

	// Extract minutes
	if mi := strings.Index(rest, "m"); mi >= 0 {
		m, err := strconv.Atoi(rest[:mi])
		if err != nil {
			return 0, fmt.Errorf("invalid minutes in %q: %w", s, err)
		}
		total += m * 60
		rest = rest[mi+1:]
	}

	// Extract seconds
	if si := strings.Index(rest, "s"); si >= 0 {
		sec, err := strconv.Atoi(rest[:si])
		if err != nil {
			return 0, fmt.Errorf("invalid seconds in %q: %w", s, err)
		}
		total += sec
		rest = rest[si+1:]
	}

	if rest != "" {
		return 0, fmt.Errorf("unrecognised duration format: %q (use e.g. \"2h\", \"30m\", \"1h30m\")", s)
	}
	if total == 0 && s != "0s" && s != "0m" && s != "0h" {
		return 0, fmt.Errorf("duration parsed to zero from %q – check the format", s)
	}

	return total, nil
}
