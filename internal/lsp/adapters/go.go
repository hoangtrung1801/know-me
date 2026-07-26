package adapters

import (
	"context"
	"fmt"

	"github.com/howznguyen/knowns/internal/lsp"
)

type GoAdapter struct{ lsp.BaseAdapter }

func NewGoAdapter() *GoAdapter { return &GoAdapter{} }

func (a *GoAdapter) ID() string           { return "go" }
func (a *GoAdapter) Name() string         { return "Go" }
func (a *GoAdapter) Extensions() []string { return []string{".go"} }
func (a *GoAdapter) Binaries() []lsp.BinaryCandidate {
	return []lsp.BinaryCandidate{{Name: "gopls", Args: []string{"serve"}, CheckArgs: []string{"version"}}}
}
func (a *GoAdapter) Prerequisites() []lsp.Prerequisite {
	return []lsp.Prerequisite{{Name: "Go 1.21+", CheckCmd: "go version", InstallHint: "Install Go from https://go.dev/dl/"}}
}
func (a *GoAdapter) CheckPrerequisites(ctx context.Context) error {
	output, err := commandOutput(ctx, "go", "version")
	if err != nil {
		return err
	}
	return requireMinVersion(output, "Go", 1, 21)
}
func (a *GoAdapter) InstallGuide() lsp.InstallGuide {
	return lsp.InstallGuide{Command: "go install golang.org/x/tools/gopls@latest", URL: "https://pkg.go.dev/golang.org/x/tools/gopls", Notes: "Requires Go 1.21+ installed"}
}
func (a *GoAdapter) CanInstall() bool                     { return false }
func (a *GoAdapter) RuntimeDeps() []lsp.RuntimeDependency { return nil }
func (a *GoAdapter) Install(ctx context.Context, targetDir string) (string, error) {
	return "", fmt.Errorf("go adapter is not auto-installable; run %q", a.InstallGuide().Command)
}
func (a *GoAdapter) InstalledPath() (string, bool) { return installedPath(a.ID(), a.RuntimeDeps()) }
func (a *GoAdapter) DefaultArgs() []string         { return []string{"serve"} }
func (a *GoAdapter) InitializeParams(root string, settings map[string]any) map[string]any {
	return initializeParams(root, settings)
}
func (a *GoAdapter) InitializationOptions(settings map[string]any) map[string]any {
	return initializationOptions(settings)
}
func (a *GoAdapter) IsIgnoredDir(name string) bool {
	return isIgnoredDir(name, map[string]struct{}{"vendor": {}, "node_modules": {}, "dist": {}, "build": {}})
}
