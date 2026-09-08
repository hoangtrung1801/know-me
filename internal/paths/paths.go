package paths

import (
	"os"
	"path/filepath"
)

const (
	CLIName      = "knownme"
	StoreDirName = ".know-me"
)

func GlobalStoreRoot() string {
	if home := os.Getenv("HOME"); home != "" {
		return filepath.Join(home, StoreDirName)
	}
	home, _ := os.UserHomeDir()
	return filepath.Join(home, StoreDirName)
}

func ProjectStoreRoot(projectRoot string) string {
	return filepath.Join(projectRoot, StoreDirName)
}
