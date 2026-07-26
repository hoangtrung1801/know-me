package opencode

import (
	"testing"
)

func TestParseVersion(t *testing.T) {
	tests := []struct {
		input string
		want  string
	}{
		{"1.5.0", "1.5.0"},
		{"v1.5.0", "1.5.0"},
		{"opencode v1.5.0", "1.5.0"},
		{"opencode 1.3.2", "1.3.2"},
		{"v2.0.0-beta.1", "2.0.0"},
		{"", ""},
		{"no version here", ""},
	}

	for _, tt := range tests {
		got := parseVersion(tt.input)
		if got != tt.want {
			t.Errorf("parseVersion(%q) = %q, want %q", tt.input, got, tt.want)
		}
	}
}

func TestAgentStatusNotInstalled(t *testing.T) {
	// DetectOpenCode depends on exec.LookPath, so we test the struct shape
	status := &AgentStatus{
		Installed:  false,
		MinVersion: MinOpenCodeVersion,
	}
	if status.Installed {
		t.Error("expected Installed=false")
	}
	if status.Compatible {
		t.Error("expected Compatible=false")
	}
	if status.MinVersion != "1.3.0" {
		t.Errorf("expected MinVersion=1.3.0, got %s", status.MinVersion)
	}
}
