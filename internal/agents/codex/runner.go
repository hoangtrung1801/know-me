package codex

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime"
	"strings"
	"sync"
	"time"

	"github.com/hoangtrung1801/known-me/internal/models"
)

const codexDocsURL = "https://developers.openai.com/codex/cli"

const maxRunLogBytes = 4 * 1024 * 1024

const logTruncatedMarker = "[Codex log truncated after 4 MiB]"

var logSecretPattern = regexp.MustCompile(`(?i)((?:"?(?:api[_-]?key|token|password|secret|authorization)"?\s*[:=]\s*"?))([^"\s,}]+)`)

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

type runLogger struct {
	file      *os.File
	mu        sync.Mutex
	written   int
	truncated bool
}

func newRunLogger(file *os.File) *runLogger {
	return &runLogger{file: file}
}

func (logger *runLogger) write(line []byte) error {
	logger.mu.Lock()
	defer logger.mu.Unlock()
	if logger.truncated || logger.file == nil {
		return nil
	}
	safeLine := logSecretPattern.ReplaceAll(line, []byte(`$1[REDACTED]`))
	remaining := maxRunLogBytes - logger.written
	if len(safeLine)+1 > remaining {
		marker := []byte(logTruncatedMarker)
		if len(marker) > remaining {
			marker = marker[:remaining]
		}
		if _, err := logger.file.Write(marker); err != nil {
			return err
		}
		logger.written += len(marker)
		logger.truncated = true
		return nil
	}
	if _, err := logger.file.Write(safeLine); err != nil {
		return err
	}
	if _, err := logger.file.Write([]byte("\n")); err != nil {
		return err
	}
	logger.written += len(safeLine) + 1
	return nil
}

func (logger *runLogger) close() error {
	if logger == nil || logger.file == nil {
		return nil
	}
	err := logger.file.Close()
	logger.file = nil
	return err
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

	var logger *runLogger
	if req.LogPath != "" {
		if err := os.MkdirAll(filepath.Dir(req.LogPath), 0o755); err != nil {
			return Result{}, fmt.Errorf("create Codex log directory: %w", err)
		}
		var err error
		logFile, err := os.OpenFile(req.LogPath, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o600)
		if err != nil {
			return Result{}, fmt.Errorf("open Codex log: %w", err)
		}
		logger = newRunLogger(logFile)
		defer logger.close()
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

	writeLog := func(line []byte) error {
		if logger == nil {
			return nil
		}
		return logger.write(line)
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
	decoded, err := decodePhaseResult(data)
	if err != nil {
		return result, fmt.Errorf("decode Codex result: %w", err)
	}
	result.Output = decoded
	if err := validateResult(req.Phase, result.Output); err != nil {
		return result, err
	}
	return result, nil
}

func decodePhaseResult(data []byte) (PhaseResult, error) {
	var fields map[string]json.RawMessage
	if err := json.Unmarshal(data, &fields); err != nil {
		return PhaseResult{}, err
	}
	for _, field := range []string{"implementationPlan", "implementationNotes", "summary", "tests"} {
		if _, ok := fields[field]; !ok {
			return PhaseResult{}, fmt.Errorf("required field %q is missing", field)
		}
	}
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.DisallowUnknownFields()
	var result PhaseResult
	if err := decoder.Decode(&result); err != nil {
		return PhaseResult{}, err
	}
	var extra any
	if err := decoder.Decode(&extra); err != io.EOF {
		if err == nil {
			return PhaseResult{}, errors.New("multiple JSON values are not allowed")
		}
		return PhaseResult{}, err
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
	if result.Tests == nil {
		return errors.New("Codex result tests is required")
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
