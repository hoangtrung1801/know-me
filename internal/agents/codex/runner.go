package codex

import (
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
	"strings"
	"sync"
	"time"

	"github.com/hoangtrung1801/know-me/internal/models"
)

const codexDocsURL = "https://github.com/agentclientprotocol/codex-acp"

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
		LoginCommand:   "codex login",
		DocsURL:        codexDocsURL,
		InstallCommand: "npm install -g @agentclientprotocol/codex-acp",
	}
	command, err := configuredACPCommand(executable)
	if err != nil {
		status.Error = err.Error()
		return status
	}
	path, err := exec.LookPath(command[0])
	if err != nil {
		status.Error = "codex-acp adapter was not found"
		return status
	}
	status.Installed = true

	versionArgs := append(append([]string(nil), command[1:]...), "--version")
	versionOutput, err := exec.CommandContext(ctx, path, versionArgs...).Output()
	if err != nil {
		status.Error = "codex-acp adapter version check failed"
		return status
	}
	status.Version = strings.TrimSpace(string(versionOutput))
	// The adapter has no separate, stable auth-status command. The first
	// session/new call reports authentication failures; keep this field for
	// the existing setup UI and show codex login as the remediation.
	status.LoggedIn = true
	return status
}

func configuredACPCommand(executable string) ([]string, error) {
	if executable != "" {
		return []string{executable}, nil
	}
	if raw := strings.TrimSpace(os.Getenv("KNOWS_CODEX_ACP_COMMAND")); raw != "" {
		var command []string
		if err := json.Unmarshal([]byte(raw), &command); err != nil {
			return nil, fmt.Errorf("KNOWS_CODEX_ACP_COMMAND must be a JSON array: %w", err)
		}
		if len(command) == 0 {
			return nil, errors.New("KNOWS_CODEX_ACP_COMMAND must not be empty")
		}
		for _, part := range command {
			if strings.TrimSpace(part) == "" {
				return nil, errors.New("KNOWS_CODEX_ACP_COMMAND must not contain empty command parts")
			}
		}
		return command, nil
	}
	return []string{"codex-acp"}, nil
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

type StreamEvent struct {
	Type     string
	ThreadID string
	Message  string
}

func (r Runner) Run(ctx context.Context, req Request, onEvent func(StreamEvent)) (Result, error) {
	if req.Root == "" {
		return Result{}, errors.New("ACP workspace root is required")
	}
	command, err := configuredACPCommand(r.Executable)
	if err != nil {
		return Result{}, err
	}

	var logger *runLogger
	if req.LogPath != "" {
		if err := os.MkdirAll(filepath.Dir(req.LogPath), 0o755); err != nil {
			return Result{}, fmt.Errorf("create ACP log directory: %w", err)
		}
		var err error
		logFile, err := os.OpenFile(req.LogPath, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o600)
		if err != nil {
			return Result{}, fmt.Errorf("open ACP log: %w", err)
		}
		logger = newRunLogger(logFile)
		defer logger.close()
	}

	process, err := NewACPProcess(ctx, req.Root, command, logger)
	if err != nil {
		return Result{}, err
	}
	closeProcess := func() {
		closeCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = process.Close(closeCtx)
	}
	defer closeProcess()
	if err := process.NewSession(ctx); err != nil {
		return Result{}, err
	}
	mode := ACPModeAgent
	if req.Phase == models.AgentRunPhaseInvestigation {
		mode = ACPModeReadOnly
	}
	if err := process.SetMode(ctx, mode); err != nil {
		return Result{}, err
	}
	raw, err := process.Prompt(ctx, req.Prompt, func(update ACPUpdate) {
		if onEvent != nil {
			onEvent(StreamEvent{Type: update.Kind, Message: update.Text})
		}
	})
	if err != nil {
		return Result{}, err
	}
	decoded, err := decodePhaseResult([]byte(raw))
	if err != nil {
		return Result{}, fmt.Errorf("decode ACP result: %w", err)
	}
	if err := validateResult(req.Phase, decoded); err != nil {
		return Result{}, err
	}
	return Result{Output: decoded}, nil
}

func decodePhaseResult(data []byte) (PhaseResult, error) {
	decoder := json.NewDecoder(bytes.NewReader(data))
	var fields map[string]json.RawMessage
	if err := decoder.Decode(&fields); err != nil {
		return PhaseResult{}, err
	}
	if fields == nil {
		return PhaseResult{}, errors.New("result must be a JSON object")
	}
	for _, field := range []string{"implementationPlan", "implementationNotes", "summary", "tests"} {
		if _, ok := fields[field]; !ok {
			return PhaseResult{}, fmt.Errorf("required field %q is missing", field)
		}
	}
	var extra any
	if err := decoder.Decode(&extra); err != io.EOF {
		if err == nil {
			return PhaseResult{}, errors.New("multiple JSON values are not allowed")
		}
		return PhaseResult{}, err
	}
	object, err := json.Marshal(fields)
	if err != nil {
		return PhaseResult{}, err
	}
	decoder = json.NewDecoder(bytes.NewReader(object))
	decoder.DisallowUnknownFields()
	var result PhaseResult
	if err := decoder.Decode(&result); err != nil {
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
