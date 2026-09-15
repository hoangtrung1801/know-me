package omp

import (
	"context"
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"

	"github.com/hoangtrung1801/know-me/internal/models"
)

func TestDetectWithConfiguredCommand(t *testing.T) {
	command, _ := fakeACPCommand(t, "detect")
	cmdJSON, _ := json.Marshal(command)
	t.Setenv("KNOWME_OMP_COMMAND", string(cmdJSON))
	status := Detect(context.Background(), "")
	if !status.Installed || !status.LoggedIn || status.Version != "omp 18.2.0" {
		t.Fatalf("status = %#v", status)
	}
	if got, want := status.InstallCommand, "brew install can1357/tap/omp"; got != want {
		t.Fatalf("install command = %q, want %q", got, want)
	}
	if got, want := status.LoginCommand, "omp auth-broker"; got != want {
		t.Fatalf("login command = %q, want %q", got, want)
	}
}

func TestDetectMissingExecutable(t *testing.T) {
	status := Detect(context.Background(), "/nonexistent/binary/path/omp-missing")
	if status.Installed {
		t.Fatalf("expected Installed=false, got %#v", status)
	}
	if status.Error == "" {
		t.Fatalf("expected non-empty Error, got %#v", status)
	}
}

func TestParseResultFencedJSON(t *testing.T) {
	raw := "Here is my plan:\n```json\n{\n  \"summary\": \"Refactor auth\",\n  \"implementationPlan\": \"1. Update token\",\n  \"tests\": [\"go test ./...\"]\n}\n```\nHope this helps."
	res, err := parseResult(models.AgentRunPhaseInvestigation, raw)
	if err != nil {
		t.Fatalf("parseResult failed: %v", err)
	}
	if res.Summary != "Refactor auth" {
		t.Fatalf("summary = %q, want Refactor auth", res.Summary)
	}
	if res.ImplementationPlan != "1. Update token" {
		t.Fatalf("plan = %q", res.ImplementationPlan)
	}
	if len(res.Tests) != 1 || res.Tests[0] != "go test ./..." {
		t.Fatalf("tests = %v", res.Tests)
	}
}

func TestParseResultRawJSON(t *testing.T) {
	raw := `{"summary":"Fix bug","implementationPlan":"apply patch","tests":[]}`
	res, err := parseResult(models.AgentRunPhaseInvestigation, raw)
	if err != nil {
		t.Fatalf("parseResult failed: %v", err)
	}
	if res.Summary != "Fix bug" {
		t.Fatalf("summary = %q", res.Summary)
	}
}

func TestParseResultFallback(t *testing.T) {
	raw := "I investigated the issue and found that we need to update router.go\nDetails below."
	res, err := parseResult(models.AgentRunPhaseInvestigation, raw)
	if err != nil {
		t.Fatalf("parseResult failed: %v", err)
	}
	if !strings.HasPrefix(res.Summary, "I investigated") {
		t.Fatalf("summary = %q", res.Summary)
	}
	if res.ImplementationPlan != raw {
		t.Fatalf("plan = %q", res.ImplementationPlan)
	}
}

func TestDirtyFilesAndDiff(t *testing.T) {
	root := t.TempDir()
	runGit(t, root, "init")
	runGit(t, root, "config", "user.email", "test@example.com")
	runGit(t, root, "config", "user.name", "Test User")

	if err := os.WriteFile(filepath.Join(root, "tracked.txt"), []byte("v1\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	runGit(t, root, "add", "tracked.txt")
	runGit(t, root, "commit", "-m", "init")

	// Modify tracked.txt and create untracked.txt
	if err := os.WriteFile(filepath.Join(root, "tracked.txt"), []byte("v2\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, "untracked.txt"), []byte("new\n"), 0o644); err != nil {
		t.Fatal(err)
	}

	files, err := DirtyFiles(context.Background(), root)
	if err != nil {
		t.Fatalf("DirtyFiles error: %v", err)
	}
	if len(files) != 2 {
		t.Fatalf("expected 2 dirty files, got %v", files)
	}

	diffText, err := Diff(context.Background(), root)
	if err != nil {
		t.Fatalf("Diff error: %v", err)
	}
	if !strings.Contains(diffText, "-v1") || !strings.Contains(diffText, "+v2") {
		t.Fatalf("expected diff to show v1 -> v2, got:\n%s", diffText)
	}
	if !strings.Contains(diffText, "untracked.txt") {
		t.Fatalf("expected diff to list untracked.txt, got:\n%s", diffText)
	}
}

func runGit(t *testing.T, root string, args ...string) {
	t.Helper()
	cmd := exec.Command("git", append([]string{"-C", root}, args...)...)
	if out, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("git %v: %v\n%s", args, err, out)
	}
}
