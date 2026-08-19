package codex

import (
	"context"
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"

	"github.com/hoangtrung1801/known-me/internal/models"
)

func TestACPRunnerReadsStructuredOutput(t *testing.T) {
	command, _ := fakeACPCommand(t, "chunks")
	commandJSON, err := json.Marshal(command)
	if err != nil {
		t.Fatal(err)
	}
	t.Setenv("KNOWS_CODEX_ACP_COMMAND", string(commandJSON))

	root := t.TempDir()
	var events []StreamEvent
	result, err := (&Runner{}).Run(context.Background(), Request{
		Root:    root,
		Phase:   models.AgentRunPhaseInvestigation,
		LogPath: filepath.Join(root, "run.jsonl"),
		Prompt:  "inspect",
	}, func(event StreamEvent) {
		events = append(events, event)
	})
	if err != nil {
		t.Fatal(err)
	}
	if got, want := result.Output.ImplementationPlan, "1. Change code"; got != want {
		t.Fatalf("implementation plan = %q, want %q", got, want)
	}
	if len(events) != 2 || events[0].Type != "agent_message_chunk" || events[0].Message == "" {
		t.Fatalf("events = %#v", events)
	}
}

func TestDecodePhaseResultRejectsMarkdownFencesAndExtraValues(t *testing.T) {
	t.Run("markdown fences", func(t *testing.T) {
		if _, err := decodePhaseResult([]byte("```json\n{}\n```")); err == nil {
			t.Fatal("expected markdown fences to fail")
		}
	})

	t.Run("extra values", func(t *testing.T) {
		_, err := decodePhaseResult([]byte(`{"implementationPlan":"plan","implementationNotes":"notes","summary":"done","tests":[]} {}`))
		if err == nil || !strings.Contains(err.Error(), "multiple JSON values") {
			t.Fatalf("err = %v", err)
		}
	})
}

func TestValidateResultRequiresInvestigationPlanAndSummary(t *testing.T) {
	err := validateResult(models.AgentRunPhaseInvestigation, PhaseResult{Summary: "looked", Tests: []string{}})
	if err == nil || !strings.Contains(err.Error(), "implementationPlan") {
		t.Fatalf("err = %v", err)
	}

	err = validateResult(models.AgentRunPhaseImplementation, PhaseResult{ImplementationPlan: "plan", Tests: []string{}})
	if err == nil || !strings.Contains(err.Error(), "summary") {
		t.Fatalf("err = %v", err)
	}
}

func TestDetectReportsAdapterVersionAndGuidance(t *testing.T) {
	command, _ := fakeACPCommand(t, "version")
	commandJSON, err := json.Marshal(command)
	if err != nil {
		t.Fatal(err)
	}
	t.Setenv("KNOWS_CODEX_ACP_COMMAND", string(commandJSON))

	status := Detect(context.Background(), "")
	if !status.Installed || !status.LoggedIn || status.Version != "codex-acp 0.1.0" {
		t.Fatalf("status = %#v", status)
	}
	if got, want := status.InstallCommand, "npm install -g @agentclientprotocol/codex-acp"; got != want {
		t.Fatalf("install command = %q, want %q", got, want)
	}
	if got, want := status.LoginCommand, "codex login"; got != want {
		t.Fatalf("login command = %q, want %q", got, want)
	}
}

func TestDetectRejectsMalformedConfiguredCommand(t *testing.T) {
	t.Setenv("KNOWS_CODEX_ACP_COMMAND", `{"bad":true}`)

	status := Detect(context.Background(), "")
	if status.Error == "" || status.Installed {
		t.Fatalf("status = %#v", status)
	}
}

func TestDirtyFilesReturnsTrackedAndUntrackedPaths(t *testing.T) {
	root := t.TempDir()
	runGit(t, root, "init")
	runGit(t, root, "config", "user.email", "codex@example.com")
	runGit(t, root, "config", "user.name", "Codex Test")
	if err := os.WriteFile(filepath.Join(root, "tracked.txt"), []byte("one\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	runGit(t, root, "add", "tracked.txt")
	runGit(t, root, "commit", "-m", "initial")
	if err := os.WriteFile(filepath.Join(root, "tracked.txt"), []byte("two\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, "new.txt"), []byte("new\n"), 0o644); err != nil {
		t.Fatal(err)
	}

	files, err := DirtyFiles(context.Background(), root)
	if err != nil {
		t.Fatal(err)
	}
	if !containsString(files, "tracked.txt") || !containsString(files, "new.txt") {
		t.Fatalf("dirty files = %#v", files)
	}
}

func runGit(t *testing.T, root string, args ...string) {
	t.Helper()
	cmd := exec.Command("git", append([]string{"-C", root}, args...)...)
	if output, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("git %v: %v\n%s", args, err, output)
	}
}

func containsString(values []string, want string) bool {
	for _, value := range values {
		if value == want {
			return true
		}
	}
	return false
}
