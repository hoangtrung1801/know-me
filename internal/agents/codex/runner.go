package codex

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"time"

	"github.com/hoangtrung1801/known-me/internal/models"
)

const codexDocsURL = "https://developers.openai.com/codex/cli"

type Status struct {
	Installed      bool   `json:"installed"`
	LoggedIn       bool   `json:"loggedIn"`
	Version        string `json:"version,omitempty"`
	Error          string `json:"error,omitempty"`
	InstallCommand string `json:"installCommand,omitempty"`
	LoginCommand   string `json:"loginCommand"`
	DocsURL        string `json:"docsUrl"`
}

func Detect(ctx context.Context, executable string) Status {
	status := Status{
		LoginCommand: "codex",
		DocsURL:      codexDocsURL,
	}
	if runtime.GOOS == "darwin" || runtime.GOOS == "linux" {
		status.InstallCommand = "curl -fsSL https://chatgpt.com/codex/install.sh | sh"
	}
	if executable == "" {
		executable = "codex"
	}
	path, err := exec.LookPath(executable)
	if err != nil {
		status.Error = "Codex executable was not found"
		return status
	}
	status.Installed = true

	versionOutput, err := exec.CommandContext(ctx, path, "--version").Output()
	if err != nil {
		status.Error = "Codex version check failed"
		return status
	}
	status.Version = strings.TrimSpace(string(versionOutput))

	loginCtx, cancel := context.WithTimeout(ctx, 3*time.Second)
	defer cancel()
	status.LoggedIn = exec.CommandContext(loginCtx, path, "login", "status").Run() == nil
	return status
}

type Request struct {
	Root, Prompt, SchemaPath, ResultPath, LogPath string
	Phase                                         models.AgentRunPhase
}

type Runner struct {
	Executable string
}

func (r Runner) BuildArgs(req Request) []string {
	sandbox := "read-only"
	if req.Phase != models.AgentRunPhaseInvestigation {
		sandbox = "workspace-write"
	}
	return []string{
		"exec",
		"--json",
		"--cd", req.Root,
		"--sandbox", sandbox,
		"--output-schema", req.SchemaPath,
		"--output-last-message", req.ResultPath,
		req.Prompt,
	}
}

type StreamEvent struct {
	Type     string
	ThreadID string
	Message  string
}

func (r Runner) Run(ctx context.Context, req Request, onEvent func(StreamEvent)) (Result, error) {
	if req.Root == "" {
		return Result{}, errors.New("Codex workspace root is required")
	}
	if req.SchemaPath == "" || req.ResultPath == "" {
		return Result{}, errors.New("Codex result paths are required")
	}
	if r.Executable == "" {
		r.Executable = "codex"
	}
	if err := os.MkdirAll(filepath.Dir(req.SchemaPath), 0o755); err != nil {
		return Result{}, fmt.Errorf("create Codex schema directory: %w", err)
	}
	if err := os.MkdirAll(filepath.Dir(req.ResultPath), 0o755); err != nil {
		return Result{}, fmt.Errorf("create Codex result directory: %w", err)
	}
	if err := os.WriteFile(req.SchemaPath, []byte(strictResultSchema), 0o600); err != nil {
		return Result{}, fmt.Errorf("write Codex result schema: %w", err)
	}

	var logFile *os.File
	if req.LogPath != "" {
		if err := os.MkdirAll(filepath.Dir(req.LogPath), 0o755); err != nil {
			return Result{}, fmt.Errorf("create Codex log directory: %w", err)
		}
		var err error
		logFile, err = os.OpenFile(req.LogPath, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o600)
		if err != nil {
			return Result{}, fmt.Errorf("open Codex log: %w", err)
		}
		defer logFile.Close()
	}

	cmd := exec.CommandContext(ctx, r.Executable, r.BuildArgs(req)...)
	cmd.Dir = req.Root
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return Result{}, fmt.Errorf("open Codex stdout: %w", err)
	}
	stderr, err := cmd.StderrPipe()
	if err != nil {
		return Result{}, fmt.Errorf("open Codex stderr: %w", err)
	}
	if err := cmd.Start(); err != nil {
		return Result{}, fmt.Errorf("start Codex: %w", err)
	}

	var logMu sync.Mutex
	writeLog := func(line []byte) error {
		if logFile == nil {
			return nil
		}
		logMu.Lock()
		defer logMu.Unlock()
		if _, err := logFile.Write(line); err != nil {
			return err
		}
		_, err := logFile.Write([]byte("\n"))
		return err
	}

	var threadID string
	var parseErr error
	var stdoutErr, stderrErr error
	var wg sync.WaitGroup
	wg.Add(2)
	go func() {
		defer wg.Done()
		scanner := bufio.NewScanner(stdout)
		scanner.Buffer(make([]byte, 64*1024), 4*1024*1024)
		for scanner.Scan() {
			line := append([]byte(nil), scanner.Bytes()...)
			if err := writeLog(line); err != nil && stdoutErr == nil {
				stdoutErr = err
			}
			event, err := parseStreamEvent(line)
			if err != nil {
				if parseErr == nil {
					parseErr = err
				}
				continue
			}
			if event.ThreadID != "" {
				threadID = event.ThreadID
			}
			if onEvent != nil {
				onEvent(event)
			}
		}
		if err := scanner.Err(); err != nil && stdoutErr == nil {
			stdoutErr = err
		}
	}()
	go func() {
		defer wg.Done()
		scanner := bufio.NewScanner(stderr)
		scanner.Buffer(make([]byte, 64*1024), 4*1024*1024)
		for scanner.Scan() {
			if err := writeLog(scanner.Bytes()); err != nil && stderrErr == nil {
				stderrErr = err
			}
		}
		stderrErr = scanner.Err()
	}()

	waitErr := cmd.Wait()
	wg.Wait()
	result := Result{ThreadID: threadID}
	if cmd.ProcessState != nil {
		result.ExitCode = cmd.ProcessState.ExitCode()
	}
	if stdoutErr != nil {
		return result, fmt.Errorf("read Codex output: %w", stdoutErr)
	}
	if stderrErr != nil {
		return result, fmt.Errorf("read Codex diagnostics: %w", stderrErr)
	}
	if waitErr != nil {
		if parseErr != nil {
			return result, fmt.Errorf("parse Codex output: %w", parseErr)
		}
		return result, fmt.Errorf("Codex exited with code %d: %w", result.ExitCode, waitErr)
	}
	if parseErr != nil {
		return result, fmt.Errorf("parse Codex output: %w", parseErr)
	}

	data, err := os.ReadFile(req.ResultPath)
	if err != nil {
		return result, fmt.Errorf("read Codex result: %w", err)
	}
	if err := json.Unmarshal(data, &result.Output); err != nil {
		return result, fmt.Errorf("decode Codex result: %w", err)
	}
	if err := validateResult(req.Phase, result.Output); err != nil {
		return result, err
	}
	return result, nil
}

func parseStreamEvent(data []byte) (StreamEvent, error) {
	var raw struct {
		Type     string `json:"type"`
		ThreadID string `json:"thread_id"`
		Item     struct {
			Type string `json:"type"`
			Text string `json:"text"`
		} `json:"item"`
	}
	if err := json.Unmarshal(data, &raw); err != nil {
		return StreamEvent{}, err
	}
	return StreamEvent{Type: raw.Type, ThreadID: raw.ThreadID, Message: raw.Item.Text}, nil
}

type PhaseResult struct {
	ImplementationPlan  string   `json:"implementationPlan"`
	ImplementationNotes string   `json:"implementationNotes"`
	Summary             string   `json:"summary"`
	Tests               []string `json:"tests"`
}

type Result struct {
	ThreadID string
	ExitCode int
	Output   PhaseResult
}

func validateResult(phase models.AgentRunPhase, result PhaseResult) error {
	if phase == models.AgentRunPhaseInvestigation && strings.TrimSpace(result.ImplementationPlan) == "" {
		return errors.New("Codex result implementationPlan is required for investigation")
	}
	if strings.TrimSpace(result.Summary) == "" {
		return errors.New("Codex result summary is required")
	}
	return nil
}

func DirtyFiles(ctx context.Context, root string) ([]string, error) {
	if root == "" {
		return nil, errors.New("Git workspace root is required")
	}
	out, err := exec.CommandContext(ctx, "git", "-C", root, "status", "--porcelain=v1", "--untracked-files=all").Output()
	if err != nil {
		return nil, fmt.Errorf("read Git status: %w", err)
	}
	var files []string
	for _, line := range strings.Split(string(out), "\n") {
		if len(line) < 4 {
			continue
		}
		path := strings.TrimSpace(line[3:])
		if arrow := strings.LastIndex(path, " -> "); arrow >= 0 {
			path = strings.TrimSpace(path[arrow+4:])
		}
		if path != "" {
			files = append(files, path)
		}
	}
	return files, nil
}

const strictResultSchema = `{
  "type": "object",
  "properties": {
    "implementationPlan": {"type": "string"},
    "implementationNotes": {"type": "string"},
    "summary": {"type": "string"},
    "tests": {"type": "array", "items": {"type": "string"}}
  },
  "required": ["implementationPlan", "implementationNotes", "summary", "tests"],
  "additionalProperties": false
}`
