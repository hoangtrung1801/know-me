package util

import (
	"encoding/json"
	"os"
	"path/filepath"
	"runtime"
)

// Version is set by the linker at build time via:
//
//	go build -ldflags "-X github.com/howznguyen/knowns/internal/util.Version=0.12.4"
//
// When built via CI/CD, this comes from the git tag (e.g. v0.12.4).
// When built locally without a tag, it defaults to "dev" and falls back
// to reading the version from the npm package.json.
var Version = "dev"

func init() {
	if Version != "dev" {
		return
	}
	// Try to read version from package.json next to the binary
	if v := readNpmVersion(); v != "" {
		Version = v
	}
}

// readNpmVersion attempts to find the npm package.json that shipped
// alongside the Go binary and extract the "version" field.
func readNpmVersion() string {
	exe, err := os.Executable()
	if err != nil {
		return ""
	}
	dir := filepath.Dir(exe)

	// Check common locations relative to the binary:
	// 1. ../package.json  (npm/knowns/bin/knowns → npm/knowns/package.json)
	// 2. ../../package.json
	candidates := []string{
		filepath.Join(dir, "..", "package.json"),
		filepath.Join(dir, "..", "..", "package.json"),
	}

	// Also check the source project root (for local dev)
	if runtime.GOOS != "windows" {
		candidates = append(candidates,
			filepath.Join(dir, "..", "..", "..", "package.json"),
		)
	}

	for _, path := range candidates {
		data, err := os.ReadFile(path)
		if err != nil {
			continue
		}
		var pkg struct {
			Name    string `json:"name"`
			Version string `json:"version"`
		}
		if err := json.Unmarshal(data, &pkg); err != nil {
			continue
		}
		// Only use it if it's actually the knowns package
		if pkg.Version != "" && (pkg.Name == "knowns" || pkg.Name == "@anthropic/knowns" || pkg.Name == "") {
			return pkg.Version
		}
	}
	return ""
}
