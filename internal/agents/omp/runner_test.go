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
func TestParseResultPrefersLastFencedJSON(t *testing.T) {
	raw := "Intermediate scratchpad:\n```json\n{\n  \"summary\": \"generic placeholder\",\n  \"implementationPlan\": \"generic\"\n}\n```\n\nFinal response:\n```json\n{\n  \"summary\": \"Refactor auth for real\",\n  \"implementationPlan\": \"1. Update actual code\",\n  \"tests\": [\"vitest\"]\n}\n```"
	res, err := parseResult(models.AgentRunPhaseInvestigation, raw)
	if err != nil {
		t.Fatalf("parseResult failed: %v", err)
	}
	if res.Summary != "Refactor auth for real" {
		t.Fatalf("summary = %q, want Refactor auth for real", res.Summary)
	}
	if res.ImplementationPlan != "1. Update actual code" {
		t.Fatalf("plan = %q", res.ImplementationPlan)
	}
}

func TestHandleNotificationIgnoresAgentThoughtChunks(t *testing.T) {
	p := &ACPProcess{}
	var received []ACPUpdate
	p.updateCallback = func(u ACPUpdate) {
		received = append(received, u)
	}

	// agent_thought_chunk should be ignored
	thoughtJSON := []byte(`{"sessionId":"s1","update":{"sessionUpdate":"agent_thought_chunk","content":{"type":"text","text":"thinking scratchpad"}}}`)
	p.handleNotification(acpRPCMessage{Method: "session/update", Params: thoughtJSON})
	if len(received) != 0 {
		t.Fatalf("expected 0 updates for agent_thought_chunk, got %d", len(received))
	}

	// agent_message_chunk should be processed
	msgJSON := []byte(`{"sessionId":"s1","update":{"sessionUpdate":"agent_message_chunk","content":{"type":"text","text":"hello world"}}}`)
	p.handleNotification(acpRPCMessage{Method: "session/update", Params: msgJSON})
	if len(received) != 1 || received[0].Text != "hello world" {
		t.Fatalf("expected 1 update with 'hello world', got %#v", received)
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
