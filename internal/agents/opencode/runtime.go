package opencode

import "time"

// RuntimeMode describes who owns the OpenCode runtime.
type RuntimeMode string

const (
	RuntimeModeManaged  RuntimeMode = "managed"
	RuntimeModeExternal RuntimeMode = "external"
)

// RuntimeState describes the current health of the selected runtime.
type RuntimeState string

const (
	RuntimeStateReady       RuntimeState = "ready"
	RuntimeStateDegraded    RuntimeState = "degraded"
	RuntimeStateUnavailable RuntimeState = "unavailable"
)

// RuntimeReadiness captures staged readiness probes for the runtime.
type RuntimeReadiness struct {
	Healthy  bool   `json:"healthy"`
	ConfigOK bool   `json:"configOk"`
	AgentOK  bool   `json:"agentOk"`
	Ready    bool   `json:"ready"`
	Version  string `json:"version,omitempty"`
	Error    string `json:"error,omitempty"`
}

// RuntimeStatus is the stable payload surfaced to the UI.
type RuntimeStatus struct {
	Configured    bool             `json:"configured"`
	Mode          RuntimeMode      `json:"mode"`
	State         RuntimeState     `json:"state"`
	Available     bool             `json:"available"`
	Ready         bool             `json:"ready"`
	Host          string           `json:"host"`
	Port          int              `json:"port"`
	CLIInstalled  bool             `json:"cliInstalled"`
	Compatible    bool             `json:"compatible"`
	Version       string           `json:"version,omitempty"`
	MinVersion    string           `json:"minVersion,omitempty"`
	LastError     string           `json:"lastError,omitempty"`
	LastHealthyAt *time.Time       `json:"lastHealthyAt,omitempty"`
	RestartCount  int              `json:"restartCount"`
	Readiness     RuntimeReadiness `json:"readiness"`
}

func NormalizeRuntimeMode(mode string) RuntimeMode {
	switch mode {
	case string(RuntimeModeExternal):
		return RuntimeModeExternal
	default:
		return RuntimeModeManaged
	}
}
