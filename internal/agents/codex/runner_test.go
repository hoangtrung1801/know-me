package codex

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"

	"github.com/hoangtrung1801/known-me/internal/models"
)

func TestBuildArgsUsesLeastPrivilegeSandbox(t *testing.T) {
	runner := Runner{Executable: "codex"}
	readArgs := strings.Join(runner.BuildArgs(Request{
		Root: "/repo", Phase: models.AgentRunPhaseInvestigation,
		SchemaPath: "/tmp/schema.json", ResultPath: "/tmp/result.json", Prompt: "inspect",
	}), " ")
	writeArgs := strings.Join(runner.BuildArgs(Request{
		Root: "/repo", Phase: models.AgentRunPhaseImplementation,
		SchemaPath: "/tmp/schema.json", ResultPath: "/tmp/result.json", Prompt: "implement",
	}), " ")

	if !strings.Contains(readArgs, "--sandbox read-only") {
		t.Fatalf("read args = %s", readArgs)
	}
	if !strings.Contains(writeArgs, "--sandbox workspace-write") {
		t.Fatalf("write args = %s", writeArgs)
	}
	if strings.Contains(readArgs+writeArgs, "danger-full-access") {
		t.Fatal("unsafe sandbox present")
	}
}

func TestParseStreamEventCapturesThreadAndMessage(t *testing.T) {
	event, err := parseStreamEvent([]byte(`{"type":"thread.started","thread_id":"thread-1"}`))
	if err != nil || event.ThreadID != "thread-1" {
		t.Fatalf("event = %#v, err = %v", event, err)
	}
	event, err = parseStreamEvent([]byte(`{"type":"item.completed","item":{"type":"agent_message","text":"done"}}`))
	if err != nil || event.Message != "done" {
		t.Fatalf("event = %#v, err = %v", event, err)
	}
}

func TestValidateResultRequiresInvestigationPlan(t *testing.T) {
	err := validateResult(models.AgentRunPhaseInvestigation, PhaseResult{Summary: "looked"})
	if err == nil || !strings.Contains(err.Error(), "implementationPlan") {
		t.Fatalf("err = %v", err)
	}
}

func TestDetectReportsVersionAndLogin(t *testing.T) {
	codex := fakeCodex(t)
	status := Detect(context.Background(), codex)
	if !status.Installed || !status.LoggedIn || status.Version != "codex 0.1.0" {
		t.Fatalf("status = %#v", status)
	}
}

func TestRunnerReadsStructuredOutputWithoutLiveCodex(t *testing.T) {
	codex := fakeCodex(t)
	root := t.TempDir()
	resultPath := filepath.Join(root, "result.json")
	result, err := (Runner{Executable: codex}).Run(context.Background(), Request{
		Root: root, Phase: models.AgentRunPhaseInvestigation,
		SchemaPath: filepath.Join(root, "schema.json"), ResultPath: resultPath,
		LogPath: filepath.Join(root, "run.jsonl"), Prompt: "inspect",
	}, nil)
	if err != nil {
		t.Fatal(err)
	}
	if result.ThreadID != "thread-test" || result.Output.ImplementationPlan != "1. Change code" {
		t.Fatalf("result = %#v", result)
	}
	if _, err := os.Stat(resultPath); err != nil {
		t.Fatalf("result file: %v", err)
	}
}

func TestRunnerRejectsInvalidStructuredOutput(t *testing.T) {
	codex := fakeCodex(t)
	root := t.TempDir()
	t.Setenv("CODEX_TEST_RESULT", `{"implementationPlan":"","implementationNotes":"","summary":"","tests":[]}`)
	_, err := (Runner{Executable: codex}).Run(context.Background(), Request{
		Root: root, Phase: models.AgentRunPhaseImplementation,
		SchemaPath: filepath.Join(root, "schema.json"), ResultPath: filepath.Join(root, "result.json"),
		Prompt: "implement",
	}, nil)
	if err == nil || !strings.Contains(err.Error(), "summary") {
		t.Fatalf("err = %v", err)
	}
}

func TestRunnerRedactsAndBoundsLogs(t *testing.T) {
	logPath := filepath.Join(t.TempDir(), "run.jsonl")
	logFile, err := os.Create(logPath)
	if err != nil {
		t.Fatal(err)
	}
	logger := newRunLogger(logFile)
	if err := logger.write([]byte(`{"token":"secret-value"}`)); err != nil {
		t.Fatal(err)
	}
	if err := logger.write([]byte(strings.Repeat("x", maxRunLogBytes))); err != nil {
		t.Fatal(err)
	}
	if err := logger.close(); err != nil {
		t.Fatal(err)
	}
	data, err := os.ReadFile(logPath)
	if err != nil {
		t.Fatal(err)
	}
	if len(data) > maxRunLogBytes+len(logTruncatedMarker)+2 {
		t.Fatalf("log size = %d, want bounded", len(data))
	}
	if strings.Contains(string(data), "secret-value") || !strings.Contains(string(data), "[REDACTED]") {
		t.Fatalf("log was not redacted: %s", data)
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

func fakeCodex(t *testing.T) string {
	t.Helper()
	path := filepath.Join(t.TempDir(), "codex")
	script := `#!/bin/sh
if [ "$1" = "--version" ]; then printf 'codex 0.1.0\n'; exit 0; fi
if [ "$1" = "login" ]; then exit 0; fi
last=""
previous=""
for arg in "$@"; do
  if [ "$previous" = "--output-last-message" ]; then last="$arg"; fi
  previous="$arg"
done
printf '%s\n' '{"type":"thread.started","thread_id":"thread-test"}'
printf '%s\n' '{"type":"item.completed","item":{"type":"agent_message","text":"done"}}'
printf '%s' "$CODEX_TEST_RESULT" > "$last"
`
	if err := os.WriteFile(path, []byte(script), 0o755); err != nil {
		t.Fatal(err)
	}
	t.Setenv("CODEX_TEST_RESULT", `{"implementationPlan":"1. Change code","implementationNotes":"looked","summary":"done","tests":["go test ./..."]}`)
	return path
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
