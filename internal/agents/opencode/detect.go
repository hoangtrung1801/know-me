package opencode

import (
	"os/exec"
	"regexp"
	"strings"

	"github.com/howznguyen/knowns/internal/util"
)

// MinOpenCodeVersion is the minimum required OpenCode version.
const MinOpenCodeVersion = "1.3.0"

// AgentStatus describes the OpenCode installation state.
type AgentStatus struct {
	Installed  bool   `json:"installed"`
	Version    string `json:"version,omitempty"`
	MinVersion string `json:"minVersion"`
	Compatible bool   `json:"compatible"`
}

// semverRe matches the first semver-like string (e.g. "1.3.0", "v2.1.0-beta").
var semverRe = regexp.MustCompile(`v?(\d+\.\d+\.\d+)`)

// DetectOpenCode checks whether the opencode CLI is installed and whether
// its version meets the minimum requirement.
func DetectOpenCode() *AgentStatus {
	path, err := exec.LookPath("opencode")
	if err != nil {
		return &AgentStatus{
			Installed:  false,
			MinVersion: MinOpenCodeVersion,
		}
	}

	out, err := exec.Command(path, "--version").Output()
	if err != nil {
		return &AgentStatus{
			Installed:  true,
			Version:    "unknown",
			MinVersion: MinOpenCodeVersion,
			Compatible: false,
		}
	}

	version := parseVersion(strings.TrimSpace(string(out)))
	compatible := version != "" && util.CompareVersions(version, MinOpenCodeVersion) >= 0

	return &AgentStatus{
		Installed:  true,
		Version:    version,
		MinVersion: MinOpenCodeVersion,
		Compatible: compatible,
	}
}

// parseVersion extracts a semver string from opencode --version output.
// Output may look like "opencode v1.5.0" or just "1.5.0".
func parseVersion(output string) string {
	m := semverRe.FindStringSubmatch(output)
	if len(m) >= 2 {
		return m[1]
	}
	return ""
}
