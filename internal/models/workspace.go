package models

// Workspace represents an AI-agent execution context tied to a git worktree.
// It is persisted in .knowns/workspaces/<id>.json.
//
// Status values: "creating", "idle", "running", "stopped", "error".
type Workspace struct {
	ID   string `json:"id"`
	Name string `json:"name"`

	// TaskID optionally links this workspace to a Knowns task.
	TaskID string `json:"taskId,omitempty"`

	// UseWorktree indicates whether the workspace runs in an isolated git
	// worktree (true) or directly in the project directory (false, default).
	UseWorktree    bool   `json:"useWorktree"`
	WorktreePath   string `json:"worktreePath,omitempty"`
	WorktreeBranch string `json:"worktreeBranch,omitempty"`

	// Status is one of: "creating", "idle", "running", "stopped", "error".
	Status string `json:"status"`

	Phases            []WorkspacePhase `json:"phases"`
	CurrentPhaseIndex int              `json:"currentPhaseIndex"`

	// PID is the OS process ID of the currently running agent, if any.
	PID *int `json:"pid,omitempty"`

	// Timestamps are stored as ISO-8601 strings to match the TypeScript model.
	CreatedAt string `json:"createdAt"`
	StartedAt string `json:"startedAt,omitempty"`
	StoppedAt string `json:"stoppedAt,omitempty"`

	Error string `json:"error,omitempty"`
}

// WorkspacePhase is a single step in the multi-phase agent pipeline.
//
// Type values: "research", "plan", "implement", "review".
// Status values: "pending", "running", "completed", "failed", "skipped".
type WorkspacePhase struct {
	// Type is one of: "research", "plan", "implement", "review".
	Type string `json:"type"`

	// AgentType is a free-form string identifying the agent (e.g., "claude",
	// "codex", "opencode").
	AgentType string `json:"agentType"`

	Model   string `json:"model,omitempty"`
	APIBase string `json:"apiBase,omitempty"`

	// Status is one of: "pending", "running", "completed", "failed", "skipped".
	Status string `json:"status"`

	Prompt string `json:"prompt,omitempty"`
	Output string `json:"output,omitempty"`

	// Timestamps are ISO-8601 strings.
	StartedAt   string `json:"startedAt,omitempty"`
	CompletedAt string `json:"completedAt,omitempty"`

	ExitCode *int `json:"exitCode,omitempty"`

	Error      string `json:"error,omitempty"`
	RetryCount int    `json:"retryCount,omitempty"`
}

// ProxyEvent is a normalised event emitted by the agent-proxy Go binary as
// newline-delimited JSON on stdout.
//
// Type values: "init", "thinking", "text", "tool_use", "tool_result",
// "result", "error", "stderr", "exit".
type ProxyEvent struct {
	// Type categorises the event payload.
	Type string `json:"type"`

	Text string `json:"text,omitempty"`

	// Agent is the agent identifier that produced this event.
	Agent string `json:"agent"`

	// Ts is a Unix millisecond timestamp.
	Ts int64 `json:"ts"`

	// Raw carries the unmodified upstream JSON when additional fields need to
	// be forwarded to the UI.
	Raw any `json:"raw,omitempty"`
}
