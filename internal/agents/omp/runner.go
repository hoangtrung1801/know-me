package omp

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
	"sync"

	"github.com/hoangtrung1801/know-me/internal/models"
)

const ompDocsURL = "https://github.com/can1357/oh-my-pi"

const maxRunLogBytes = 4 * 1024 * 1024

const logTruncatedMarker = "[OMP log truncated after 4 MiB]"

var logSecretPattern = regexp.MustCompile(`(?i)((?:"?(?:api[_-]?key|token|password|secret|authorization)"?\s*[:=]\s*"?))([^"\s,}]+)`)

type Status struct {
	Installed      bool   `json:"installed"`
	LoggedIn       bool   `json:"loggedIn"`
	Version        string `json:"version,omitempty"`
	Executable     string `json:"executable,omitempty"`
	Error          string `json:"error,omitempty"`
	InstallCommand string `json:"installCommand,omitempty"`
	LoginCommand   string `json:"loginCommand"`
	DocsURL        string `json:"docsUrl"`
}

func Detect(ctx context.Context, executable string) Status {
	status := Status{
		LoginCommand:   "omp auth-broker",
		DocsURL:        ompDocsURL,
		InstallCommand: "brew install can1357/tap/omp",
	}
	command, err := configuredACPCommand(executable)
	if err != nil {
		status.Error = err.Error()
		return status
	}
	path, err := exec.LookPath(command[0])
	if err != nil {
		status.Error = "omp executable was not found"
		return status
	}
	status.Installed = true
	status.Executable = path

	var versionArgs []string
	if len(command) > 1 && command[len(command)-1] == "acp" {
		versionArgs = append(append([]string(nil), command[1:len(command)-1]...), "--version")
	} else {
		versionArgs = append(append([]string(nil), command[1:]...), "--version")
	}
	versionOutput, err := exec.CommandContext(ctx, path, versionArgs...).CombinedOutput()
	if err != nil {
		status.Error = fmt.Sprintf("omp version check failed: %v (%s)", err, strings.TrimSpace(string(versionOutput)))
		return status
	}
	status.Version = strings.TrimSpace(string(versionOutput))
	if status.Version == "" {
		status.Error = fmt.Sprintf("empty version output for args %v", versionArgs)
		return status
	}
	status.LoggedIn = true
	return status
}
func configuredACPCommand(executable string) ([]string, error) {
	if executable != "" {
		return []string{executable}, nil
	}
	if raw := strings.TrimSpace(os.Getenv("KNOWME_OMP_COMMAND")); raw != "" {
		return parseCommandJSON(raw, "KNOWME_OMP_COMMAND")
	}
	if raw := strings.TrimSpace(os.Getenv("KNOWS_OMP_COMMAND")); raw != "" {
		return parseCommandJSON(raw, "KNOWS_OMP_COMMAND")
	}
	if customPath := strings.TrimSpace(os.Getenv("KNOWME_OMP_PATH")); customPath != "" {
		return []string{customPath, "acp"}, nil
	}
	if customPath := strings.TrimSpace(os.Getenv("KNOWS_OMP_PATH")); customPath != "" {
		return []string{customPath, "acp"}, nil
	}
	return []string{"omp", "acp"}, nil
}

func parseCommandJSON(raw, envName string) ([]string, error) {
	var command []string
	if err := json.Unmarshal([]byte(raw), &command); err != nil {
		return nil, fmt.Errorf("%s must be a JSON array: %w", envName, err)
	}
	if len(command) == 0 {
		return nil, fmt.Errorf("%s must not be empty", envName)
	}
	for _, part := range command {
		if strings.TrimSpace(part) == "" {
			return nil, fmt.Errorf("%s must not contain empty command parts", envName)
		}
	}
	return command, nil
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
		if len(marker) > 0 {
			_, _ = logger.file.Write(marker)
			_, _ = logger.file.WriteString("\n")
		}
		logger.truncated = true
		logger.written = maxRunLogBytes
		return nil
	}
	n, err := logger.file.Write(safeLine)
	logger.written += n
	if err != nil {
		return err
	}
	n, err = logger.file.WriteString("\n")
	logger.written += n
	return err
}

func (logger *runLogger) writeStderr(line []byte) error {
	return logger.write(append([]byte("[stderr] "), line...))
}

func (logger *runLogger) close() error {
	logger.mu.Lock()
	defer logger.mu.Unlock()
	if logger.file == nil {
		return nil
	}
	err := logger.file.Close()
	logger.file = nil
	return err
}

func (r *Runner) Run(ctx context.Context, req Request, onEvent func(StreamEvent)) (Result, error) {
	if req.Root == "" {
		return Result{}, errors.New("ACP workspace root is required")
	}
	command, err := configuredACPCommand(r.Executable)
	if err != nil {
		return Result{}, err
	}

	var logFile *os.File
	if req.LogPath != "" {
		if err := os.MkdirAll(filepath.Dir(req.LogPath), 0o755); err != nil {
			return Result{}, fmt.Errorf("create run log directory: %w", err)
		}
		f, err := os.OpenFile(req.LogPath, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o600)
		if err != nil {
			return Result{}, fmt.Errorf("open run log: %w", err)
		}
		logFile = f
	}
	logger := newRunLogger(logFile)
	defer logger.close()

	process, err := NewACPProcess(ctx, req.Root, command, logger)
	if err != nil {
		return Result{}, err
	}
	defer process.Close(context.Background())

	if err := process.NewSession(ctx); err != nil {
		return Result{}, err
	}

	mode := ACPModePlan
	if req.Phase == models.AgentRunPhaseImplementation || req.Phase == models.AgentRunPhaseFix {
		mode = ACPModeDefault
	}
	if err := process.SetMode(ctx, mode); err != nil {
		return Result{}, err
	}

	var streamedText strings.Builder
	response, err := process.Prompt(ctx, req.Prompt, func(update ACPUpdate) {
		if update.Text != "" {
			streamedText.WriteString(update.Text)
			if onEvent != nil {
				onEvent(StreamEvent{Type: "agent_message_chunk", Message: update.Text})
			}
		}
	})
	if err != nil {
		return Result{}, err
	}

	resultText := response
	if strings.TrimSpace(resultText) == "" {
		resultText = streamedText.String()
	}

	result, err := parseResult(req.Phase, resultText)
	if err != nil {
		return Result{}, err
	}
	return Result{
		PhaseResult: result,
		RawResponse: resultText,
	}, nil
}

type StreamEvent struct {
	Type    string `json:"type"`
	Message string `json:"message,omitempty"`
}

type Result struct {
	PhaseResult
	RawResponse string
}

type PhaseResult struct {
	ImplementationPlan  string   `json:"implementationPlan,omitempty"`
	ImplementationNotes string   `json:"implementationNotes,omitempty"`
	Summary             string   `json:"summary"`
	Tests               []string `json:"tests,omitempty"`
}

func parseResult(phase models.AgentRunPhase, raw string) (PhaseResult, error) {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return PhaseResult{}, errors.New("empty agent response")
	}

	// Try extracting from fenced json block
	if idx := strings.Index(trimmed, "```json"); idx >= 0 {
		end := strings.Index(trimmed[idx+7:], "```")
		if end >= 0 {
			jsonBlock := strings.TrimSpace(trimmed[idx+7 : idx+7+end])
			var parsed PhaseResult
			if err := json.Unmarshal([]byte(jsonBlock), &parsed); err == nil && parsed.Summary != "" {
				return parsed, nil
			}
		}
	}

	var parsed PhaseResult
	if err := json.Unmarshal([]byte(trimmed), &parsed); err == nil && parsed.Summary != "" {
		return parsed, nil
	}

	// Best-effort fallback
	lines := strings.Split(trimmed, "\n")
	summary := lines[0]
	if len(summary) > 120 {
		summary = summary[:120] + "..."
	}
	return PhaseResult{
		ImplementationPlan: trimmed,
		Summary:            summary,
		Tests:              []string{},
	}, nil
}

func DirtyFiles(ctx context.Context, root string) ([]string, error) {
	if root == "" {
		return nil, errors.New("Git workspace root is required")
	}
	out, err := exec.CommandContext(ctx, "git", "-C", root, "status", "--porcelain=v1", "--untracked-files=all").CombinedOutput()
	if err != nil {
		if strings.Contains(string(out), "not a git repository") {
			return nil, errors.New("workspace directory is not a Git repository (run 'git init')")
		}
		return nil, fmt.Errorf("read Git status: %w (%s)", err, strings.TrimSpace(string(out)))
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

// Diff returns a unified git diff of unstaged, staged, and untracked changes, capped at 256 KB.
func Diff(ctx context.Context, root string) (string, error) {
	if root == "" {
		return "", errors.New("Git workspace root is required")
	}
	const maxDiffBytes = 256 * 1024

	var buf bytes.Buffer
	// Staged and unstaged changes against HEAD
	cmdHead := exec.CommandContext(ctx, "git", "-C", root, "diff", "HEAD")
	if out, err := cmdHead.Output(); err == nil && len(out) > 0 {
		buf.Write(out)
	} else if len(out) == 0 {
		// Fallback if no commits exist yet
		cmdWork := exec.CommandContext(ctx, "git", "-C", root, "diff")
		if outWork, err := cmdWork.Output(); err == nil {
			buf.Write(outWork)
		}
	}

	// Also show status of untracked files
	dirty, _ := DirtyFiles(ctx, root)
	if len(dirty) > 0 {
		buf.WriteString("\n# Modified/Untracked files:\n")
		for _, f := range dirty {
			buf.WriteString("#   " + f + "\n")
		}
	}

	res := buf.String()
	if len(res) > maxDiffBytes {
		res = res[:maxDiffBytes] + "\n\n... [diff truncated after 256 KB]"
	}
	return res, nil
}
