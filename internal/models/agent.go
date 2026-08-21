package models

import "time"

type AgentPhase string
type AgentRunPhase string
type AgentRunStatus string
type ReviewStage string

const (
	AgentPhaseIdle          AgentPhase = "idle"
	AgentPhaseInvestigating AgentPhase = "investigating"
	AgentPhasePlanReview    AgentPhase = "plan-review"
	AgentPhaseImplementing  AgentPhase = "implementing"
	AgentPhaseInterrupted   AgentPhase = "interrupted"
	AgentPhaseCodeReview    AgentPhase = "code-review"
	AgentPhaseFixReady      AgentPhase = "fix-ready"
	AgentPhaseCompleted     AgentPhase = "completed"

	AgentRunPhaseInvestigation  AgentRunPhase = "investigation"
	AgentRunPhaseImplementation AgentRunPhase = "implementation"
	AgentRunPhaseFix            AgentRunPhase = "fix"
	AgentRunPhaseChat           AgentRunPhase = "chat"

	AgentRunStatusRunning     AgentRunStatus = "running"
	AgentRunStatusSucceeded   AgentRunStatus = "succeeded"
	AgentRunStatusFailed      AgentRunStatus = "failed"
	AgentRunStatusCancelled   AgentRunStatus = "cancelled"
	AgentRunStatusInterrupted AgentRunStatus = "interrupted"

	ReviewStagePlan           ReviewStage = "plan"
	ReviewStageImplementation ReviewStage = "implementation"
)

type AgentWorkflow struct {
	ProjectID      string        `json:"projectId"`
	TaskID         string        `json:"taskId"`
	Phase          AgentPhase    `json:"phase"`
	ActiveRunID    string        `json:"activeRunId,omitempty"`
	CodexSessionID string        `json:"codexSessionId,omitempty"`
	ChatSessionID  string        `json:"chatSessionId,omitempty"`
	ResumePhase    AgentRunPhase `json:"resumePhase,omitempty"`
	UpdatedAt      time.Time     `json:"updatedAt"`
}

type AgentRun struct {
	ID             string         `json:"id"`
	ProjectID      string         `json:"projectId"`
	TaskID         string         `json:"taskId"`
	Phase          AgentRunPhase  `json:"phase"`
	Status         AgentRunStatus `json:"status"`
	CodexThreadID  string         `json:"codexThreadId,omitempty"`
	CodexSessionID string         `json:"codexSessionId,omitempty"`
	StartedAt      time.Time      `json:"startedAt"`
	FinishedAt     *time.Time     `json:"finishedAt,omitempty"`
	ExitCode       *int           `json:"exitCode,omitempty"`
	Summary        string         `json:"summary,omitempty"`
	Tests          []string       `json:"tests,omitempty"`
	Error          string         `json:"error,omitempty"`
	LogPath        string         `json:"logPath"`
}

type ReviewComment struct {
	ID        string      `json:"id"`
	ProjectID string      `json:"projectId"`
	TaskID    string      `json:"taskId"`
	Stage     ReviewStage `json:"stage"`
	Body      string      `json:"body"`
	CreatedAt time.Time   `json:"createdAt"`
	RunID     string      `json:"runId,omitempty"`
}

type AgentState struct {
	Workflows      []AgentWorkflow `json:"workflows"`
	Runs           []AgentRun      `json:"runs"`
	ReviewComments []ReviewComment `json:"reviewComments"`
}

type AgentTaskSnapshot struct {
	Workflow       AgentWorkflow   `json:"workflow"`
	ChatSessionID  string          `json:"chatSessionId,omitempty"`
	Runs           []AgentRun      `json:"runs"`
	ReviewComments []ReviewComment `json:"reviewComments"`
	DirtyFiles     []string        `json:"dirtyFiles"`
	AdapterState   string          `json:"adapterState"`
	Resumable      bool            `json:"resumable"`
	Interrupted    bool            `json:"interrupted"`
}
