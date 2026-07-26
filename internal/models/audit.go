package models

import "time"

// AuditEvent records a single MCP tool invocation for the audit trail.
// Events are stored as JSON-lines in ~/.knowns/audit.jsonl.
type AuditEvent struct {
	// Timestamp is when the tool call started.
	Timestamp time.Time `json:"timestamp"`

	// ToolName is the MCP tool name (e.g. "tasks", "docs", "code").
	ToolName string `json:"toolName"`

	// Action is the sub-action within the tool (e.g. "create", "get", "update").
	// Empty if the tool does not use an action parameter.
	Action string `json:"action,omitempty"`

	// ActionClass categorises the operation: read, write, delete, generate, admin.
	ActionClass string `json:"actionClass"`

	// ProjectRoot is the project scope at the time of the call.
	ProjectRoot string `json:"projectRoot,omitempty"`

	// DryRun indicates whether the call was a preview-only operation.
	DryRun bool `json:"dryRun,omitempty"`

	// Result is the outcome: "success", "error", or "denied".
	Result string `json:"result"`

	// DurationMs is the wall-clock duration of the tool call in milliseconds.
	DurationMs int64 `json:"durationMs"`

	// ErrorMessage captures the error text when Result is "error".
	ErrorMessage string `json:"errorMessage,omitempty"`

	// EntityRefs captures lightweight references to affected entities
	// (e.g. task IDs, doc paths) without logging full content.
	EntityRefs []string `json:"entityRefs,omitempty"`

	// ArgumentSummary is a privacy-safe summary of the call arguments.
	// It captures keys and lightweight values, truncating or omitting large content.
	ArgumentSummary map[string]string `json:"argumentSummary,omitempty"`
}

// AuditStats holds aggregate statistics over audit events.
type AuditStats struct {
	TotalCalls    int                       `json:"totalCalls"`
	ByTool        map[string]int            `json:"byTool"`
	ByActionClass map[string]int            `json:"byActionClass"`
	ByResult      map[string]int            `json:"byResult"`
	DryRunCount   int                       `json:"dryRunCount"`
	ExecuteCount  int                       `json:"executeCount"`
	ByToolResult  map[string]map[string]int `json:"byToolResult"`
}
