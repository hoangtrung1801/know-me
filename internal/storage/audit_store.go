package storage

import (
	"bufio"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"time"

	"github.com/howznguyen/knowns/internal/models"
)

const (
	auditFileName      = "audit.jsonl"
	auditMaxFileSize   = 5 * 1024 * 1024 // 5 MB before rotation
	auditMaxBackups    = 2
	auditDefaultRecent = 50
	auditMaxRecent     = 500
)

// AuditStore provides append-only storage for MCP audit events.
// Events are stored as JSON-lines in ~/.knowns/audit.jsonl (global).
type AuditStore struct {
	dir string // directory containing audit.jsonl (e.g. ~/.knowns)
	mu  sync.Mutex
}

// NewAuditStore creates an AuditStore rooted at the given directory.
func NewAuditStore(dir string) *AuditStore {
	return &AuditStore{dir: dir}
}

// NewGlobalAuditStore creates an AuditStore at the global ~/.knowns/ path.
func NewGlobalAuditStore() *AuditStore {
	return NewAuditStore(GlobalRootPath())
}

func (as *AuditStore) filePath() string {
	return filepath.Join(as.dir, auditFileName)
}

// Append writes a single audit event to the log file.
// It is safe for concurrent use.
func (as *AuditStore) Append(event *models.AuditEvent) error {
	as.mu.Lock()
	defer as.mu.Unlock()

	// Rotate if needed.
	if err := as.rotateIfNeeded(); err != nil {
		// Non-fatal: rotation failure should not block audit writes.
		_ = err
	}

	path := as.filePath()
	if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
		return fmt.Errorf("audit: create dir: %w", err)
	}

	f, err := os.OpenFile(path, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0644)
	if err != nil {
		return fmt.Errorf("audit: open file: %w", err)
	}
	defer f.Close()

	data, err := json.Marshal(event)
	if err != nil {
		return fmt.Errorf("audit: marshal event: %w", err)
	}
	data = append(data, '\n')

	if _, err := f.Write(data); err != nil {
		return fmt.Errorf("audit: write event: %w", err)
	}
	return nil
}

// rotateIfNeeded checks the current file size and rotates if it exceeds the limit.
// Must be called with as.mu held.
func (as *AuditStore) rotateIfNeeded() error {
	path := as.filePath()
	info, err := os.Stat(path)
	if err != nil {
		return nil // file doesn't exist yet
	}
	if info.Size() < auditMaxFileSize {
		return nil
	}

	// Rotate: audit.jsonl.2 -> delete, audit.jsonl.1 -> audit.jsonl.2, audit.jsonl -> audit.jsonl.1
	for i := auditMaxBackups; i >= 1; i-- {
		src := fmt.Sprintf("%s.%d", path, i)
		if i == auditMaxBackups {
			_ = os.Remove(src)
		} else {
			dst := fmt.Sprintf("%s.%d", path, i+1)
			_ = os.Rename(src, dst)
		}
	}
	_ = os.Rename(path, fmt.Sprintf("%s.1", path))
	return nil
}

// AuditFilter specifies optional filters for querying audit events.
type AuditFilter struct {
	ToolName    string
	ActionClass string
	Result      string
	Project     string
	Since       *time.Time
	Until       *time.Time
}

// Recent returns the most recent N audit events, newest first.
func (as *AuditStore) Recent(limit int, filter *AuditFilter) ([]*models.AuditEvent, error) {
	if limit <= 0 {
		limit = auditDefaultRecent
	}
	if limit > auditMaxRecent {
		limit = auditMaxRecent
	}

	events, err := as.readAll()
	if err != nil {
		return nil, err
	}

	// Apply filters.
	if filter != nil {
		events = filterEvents(events, filter)
	}

	// Reverse to newest-first.
	for i, j := 0, len(events)-1; i < j; i, j = i+1, j-1 {
		events[i], events[j] = events[j], events[i]
	}

	// Limit.
	if len(events) > limit {
		events = events[:limit]
	}

	return events, nil
}

// Stats computes aggregate statistics over all audit events, optionally filtered.
func (as *AuditStore) Stats(filter *AuditFilter) (*models.AuditStats, error) {
	events, err := as.readAll()
	if err != nil {
		return nil, err
	}

	if filter != nil {
		events = filterEvents(events, filter)
	}

	stats := &models.AuditStats{
		ByTool:        make(map[string]int),
		ByActionClass: make(map[string]int),
		ByResult:      make(map[string]int),
		ByToolResult:  make(map[string]map[string]int),
	}

	for _, e := range events {
		stats.TotalCalls++

		toolKey := e.ToolName
		if e.Action != "" {
			toolKey = e.ToolName + "." + e.Action
		}
		stats.ByTool[toolKey]++
		stats.ByActionClass[e.ActionClass]++
		stats.ByResult[e.Result]++

		if e.DryRun {
			stats.DryRunCount++
		} else {
			stats.ExecuteCount++
		}

		if _, ok := stats.ByToolResult[toolKey]; !ok {
			stats.ByToolResult[toolKey] = make(map[string]int)
		}
		stats.ByToolResult[toolKey][e.Result]++
	}

	return stats, nil
}

// readAll reads all events from the current audit file.
func (as *AuditStore) readAll() ([]*models.AuditEvent, error) {
	path := as.filePath()
	f, err := os.Open(path)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, fmt.Errorf("audit: open file: %w", err)
	}
	defer f.Close()

	var events []*models.AuditEvent
	scanner := bufio.NewScanner(f)
	// Increase buffer for potentially long lines.
	scanner.Buffer(make([]byte, 0, 64*1024), 256*1024)

	for scanner.Scan() {
		line := scanner.Bytes()
		if len(line) == 0 {
			continue
		}
		var event models.AuditEvent
		if err := json.Unmarshal(line, &event); err != nil {
			continue // skip malformed lines
		}
		events = append(events, &event)
	}
	if err := scanner.Err(); err != nil {
		return events, fmt.Errorf("audit: scan file: %w", err)
	}
	return events, nil
}

// filterEvents applies the filter criteria to a slice of events.
func filterEvents(events []*models.AuditEvent, f *AuditFilter) []*models.AuditEvent {
	result := make([]*models.AuditEvent, 0, len(events))
	for _, e := range events {
		if f.ToolName != "" && e.ToolName != f.ToolName {
			continue
		}
		if f.ActionClass != "" && e.ActionClass != f.ActionClass {
			continue
		}
		if f.Result != "" && e.Result != f.Result {
			continue
		}
		if f.Project != "" && e.ProjectRoot != f.Project {
			continue
		}
		if f.Since != nil && e.Timestamp.Before(*f.Since) {
			continue
		}
		if f.Until != nil && e.Timestamp.After(*f.Until) {
			continue
		}
		result = append(result, e)
	}
	return result
}
