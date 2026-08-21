package codex

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

type helperLogEntry struct {
	Method    string `json:"method,omitempty"`
	SessionID string `json:"sessionId,omitempty"`
	Outcome   string `json:"outcome,omitempty"`
	OptionID  string `json:"optionId,omitempty"`
	ErrorCode int    `json:"errorCode,omitempty"`
}

func TestACPProcessReusesSessionAcrossPromptsAndLoad(t *testing.T) {
	command, logPath := fakeACPCommand(t, "reuse")

	first, err := NewACPProcess(context.Background(), t.TempDir(), command, nil)
	if err != nil {
		t.Fatal(err)
	}
	if err := first.NewSession(context.Background()); err != nil {
		t.Fatal(err)
	}
	sessionID := first.SessionID()
	if sessionID == "" {
		t.Fatal("session ID was not stored")
	}
	if _, err := first.Prompt(context.Background(), "first", nil); err != nil {
		t.Fatal(err)
	}
	if _, err := first.Prompt(context.Background(), "second", nil); err != nil {
		t.Fatal(err)
	}
	if err := first.Close(context.Background()); err != nil {
		t.Fatal(err)
	}

	second, err := NewACPProcess(context.Background(), t.TempDir(), command, nil)
	if err != nil {
		t.Fatal(err)
	}
	if err := second.LoadSession(context.Background(), sessionID); err != nil {
		t.Fatal(err)
	}
	if got := second.SessionID(); got != sessionID {
		t.Fatalf("session ID = %q, want %q", got, sessionID)
	}
	if _, err := second.Prompt(context.Background(), "third", nil); err != nil {
		t.Fatal(err)
	}
	if err := second.Close(context.Background()); err != nil {
		t.Fatal(err)
	}

	entries := readHelperLog(t, logPath)
	var promptSessions []string
	var loadSession string
	var newCount int
	for _, entry := range entries {
		switch entry.Method {
		case "session/new":
			newCount++
		case "session/load":
			loadSession = entry.SessionID
		case "session/prompt":
			promptSessions = append(promptSessions, entry.SessionID)
		}
	}
	if newCount != 1 {
		t.Fatalf("session/new count = %d, want 1", newCount)
	}
	if loadSession != sessionID {
		t.Fatalf("loaded session = %q, want %q", loadSession, sessionID)
	}
	for _, promptSession := range promptSessions {
		if promptSession != sessionID {
			t.Fatalf("prompt session = %q, want %q", promptSession, sessionID)
		}
	}
}

func TestACPProcessPrefersAllowAlwaysPermission(t *testing.T) {
	command, logPath := fakeACPCommand(t, "permission")

	process, err := NewACPProcess(context.Background(), t.TempDir(), command, nil)
	if err != nil {
		t.Fatal(err)
	}
	if err := process.NewSession(context.Background()); err != nil {
		t.Fatal(err)
	}
	if _, err := process.Prompt(context.Background(), "inspect", nil); err != nil {
		t.Fatal(err)
	}
	if err := process.Close(context.Background()); err != nil {
		t.Fatal(err)
	}

	entries := readHelperLog(t, logPath)
	for _, entry := range entries {
		if entry.Method == "permission-response" {
			if entry.Outcome != "selected" || entry.OptionID != "always-1" {
				t.Fatalf("permission response = %#v", entry)
			}
			return
		}
	}
	t.Fatal("permission response was not recorded")
}

func TestACPProcessStreamsAgentMessageChunkAndDecodesPhaseResult(t *testing.T) {
	command, _ := fakeACPCommand(t, "chunks")

	process, err := NewACPProcess(context.Background(), t.TempDir(), command, nil)
	if err != nil {
		t.Fatal(err)
	}
	if err := process.NewSession(context.Background()); err != nil {
		t.Fatal(err)
	}

	var updates []ACPUpdate
	raw, err := process.Prompt(context.Background(), "inspect", func(update ACPUpdate) {
		updates = append(updates, update)
	})
	if err != nil {
		t.Fatal(err)
	}
	if err := process.Close(context.Background()); err != nil {
		t.Fatal(err)
	}
	if len(updates) != 2 || updates[0].Kind != "agent_message_chunk" {
		t.Fatalf("updates = %#v", updates)
	}
	wantRaw := `{"implementationPlan":"1. Change code","implementationNotes":"looked","summary":"done","tests":[]}`
	if raw != wantRaw {
		t.Fatalf("raw result = %q, want %q", raw, wantRaw)
	}
	result, err := decodePhaseResult([]byte(raw))
	if err != nil {
		t.Fatal(err)
	}
	if got, want := result.Summary, "done"; got != want {
		t.Fatalf("summary = %q, want %q", got, want)
	}
}

func TestACPProcessPromptTextDoesNotRequireJSONObject(t *testing.T) {
	command, _ := fakeACPCommand(t, "text")

	process, err := NewACPProcess(context.Background(), t.TempDir(), command, nil)
	if err != nil {
		t.Fatal(err)
	}
	if err := process.NewSession(context.Background()); err != nil {
		t.Fatal(err)
	}
	text, err := process.PromptText(context.Background(), "respond normally", nil)
	if err != nil {
		t.Fatal(err)
	}
	if text != "ordinary assistant text" {
		t.Fatalf("text = %q, want ordinary assistant text", text)
	}
	if err := process.Close(context.Background()); err != nil {
		t.Fatal(err)
	}
}

func TestACPProcessCollectsOnlyFinalAnswerChunks(t *testing.T) {
	command, _ := fakeACPCommand(t, "phased-message")

	process, err := NewACPProcess(context.Background(), t.TempDir(), command, nil)
	if err != nil {
		t.Fatal(err)
	}
	if err := process.NewSession(context.Background()); err != nil {
		t.Fatal(err)
	}

	raw, err := process.Prompt(context.Background(), "inspect", nil)
	if err != nil {
		t.Fatal(err)
	}
	if err := process.Close(context.Background()); err != nil {
		t.Fatal(err)
	}
	want := `{"implementationPlan":"1. Change code","implementationNotes":"looked","summary":"done","tests":[]}`
	if raw != want {
		t.Fatalf("raw result = %q, want %q", raw, want)
	}
}

func TestACPProcessAcceptsArrayContentUpdate(t *testing.T) {
	command, _ := fakeACPCommand(t, "array-content")

	process, err := NewACPProcess(context.Background(), t.TempDir(), command, nil)
	if err != nil {
		t.Fatal(err)
	}
	if err := process.NewSession(context.Background()); err != nil {
		t.Fatal(err)
	}

	var updates []ACPUpdate
	if _, err := process.Prompt(context.Background(), "inspect", func(update ACPUpdate) {
		updates = append(updates, update)
	}); err != nil {
		t.Fatal(err)
	}
	if err := process.Close(context.Background()); err != nil {
		t.Fatal(err)
	}
	if len(updates) != 2 {
		t.Fatalf("updates = %#v", updates)
	}
	if got, want := updates[0].Kind, "tool_call"; got != want {
		t.Fatalf("first update kind = %q, want %q", got, want)
	}
	if got, want := updates[0].Text, "running"; got != want {
		t.Fatalf("first update text = %q, want %q", got, want)
	}
}

func TestACPProcessReportsPendingExit(t *testing.T) {
	command, _ := fakeACPCommand(t, "exit")
	process, err := NewACPProcess(context.Background(), t.TempDir(), command, nil)
	if err != nil {
		t.Fatal(err)
	}
	if err := process.NewSession(context.Background()); err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	if _, err := process.Prompt(ctx, "inspect", nil); err == nil {
		t.Fatal("expected pending prompt to fail when child exits")
	}
	if err := process.Close(context.Background()); err != nil {
		t.Logf("close after child exit: %v", err)
	}
}

func TestACPProcessAcceptsResponseBeforeChildExit(t *testing.T) {
	command, _ := fakeACPCommand(t, "exit-after-response")
	process, err := NewACPProcess(context.Background(), t.TempDir(), command, nil)
	if err != nil {
		t.Fatal(err)
	}
	if err := process.NewSession(context.Background()); err != nil {
		t.Fatal(err)
	}
	if _, err := process.Prompt(context.Background(), "inspect", nil); err != nil {
		t.Fatal(err)
	}
	if err := process.Close(context.Background()); err != nil {
		t.Logf("close after child exit: %v", err)
	}
}

func TestNewACPProcessBoundsInitializeCleanup(t *testing.T) {
	command, _ := fakeACPCommand(t, "init-error-hang")
	started := time.Now()
	if _, err := NewACPProcess(context.Background(), t.TempDir(), command, nil); err == nil {
		t.Fatal("expected initialize failure")
	}
	if elapsed := time.Since(started); elapsed > 5*time.Second {
		t.Fatalf("initialize cleanup took %s", elapsed)
	}
}

func TestACPProcessRespondsMethodNotFound(t *testing.T) {
	command, logPath := fakeACPCommand(t, "unsupported")
	process, err := NewACPProcess(context.Background(), t.TempDir(), command, nil)
	if err != nil {
		t.Fatal(err)
	}
	if err := process.NewSession(context.Background()); err != nil {
		t.Fatal(err)
	}
	if _, err := process.Prompt(context.Background(), "inspect", nil); err != nil {
		t.Fatal(err)
	}
	if err := process.Close(context.Background()); err != nil {
		t.Fatal(err)
	}
	for _, entry := range readHelperLog(t, logPath) {
		if entry.Method == "unsupported-response" {
			if entry.ErrorCode != -32601 {
				t.Fatalf("error code = %d, want -32601", entry.ErrorCode)
			}
			return
		}
	}
	t.Fatal("method-not-found response was not recorded")
}

func TestACPProcessPermissionFallbacks(t *testing.T) {
	for _, test := range []struct {
		scenario string
		outcome  string
		optionID string
	}{
		{scenario: "once", outcome: "selected", optionID: "once-1"},
		{scenario: "no-permission", outcome: "cancelled"},
	} {
		t.Run(test.scenario, func(t *testing.T) {
			command, logPath := fakeACPCommand(t, test.scenario)
			process, err := NewACPProcess(context.Background(), t.TempDir(), command, nil)
			if err != nil {
				t.Fatal(err)
			}
			if err := process.NewSession(context.Background()); err != nil {
				t.Fatal(err)
			}
			if _, err := process.Prompt(context.Background(), "inspect", nil); err != nil {
				t.Fatal(err)
			}
			if err := process.Close(context.Background()); err != nil {
				t.Fatal(err)
			}
			for _, entry := range readHelperLog(t, logPath) {
				if entry.Method == "permission-response" {
					if entry.Outcome != test.outcome || entry.OptionID != test.optionID {
						t.Fatalf("permission response = %#v", entry)
					}
					return
				}
			}
			t.Fatal("permission response was not recorded")
		})
	}
}

func TestACPProcessRejectsMalformedOrCancelledPrompt(t *testing.T) {
	tests := []struct {
		name     string
		scenario string
		want     string
	}{
		{name: "malformed", scenario: "malformed", want: "JSON"},
		{name: "cancelled", scenario: "cancelled", want: "cancel"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			command, _ := fakeACPCommand(t, tt.scenario)
			process, err := NewACPProcess(context.Background(), t.TempDir(), command, nil)
			if err != nil {
				t.Fatal(err)
			}
			if err := process.NewSession(context.Background()); err != nil {
				t.Fatal(err)
			}
			_, err = process.Prompt(context.Background(), "inspect", nil)
			if err == nil || !strings.Contains(strings.ToLower(err.Error()), strings.ToLower(tt.want)) {
				t.Fatalf("err = %v, want substring %q", err, tt.want)
			}
			_ = process.Close(context.Background())
		})
	}
}

func TestACPHelperProcess(t *testing.T) {
	if os.Getenv("GO_WANT_ACP_HELPER_PROCESS") != "1" {
		return
	}

	if hasArg(os.Args[1:], "--version") {
		fmt.Fprintln(os.Stdout, "codex-acp 0.1.0")
		os.Exit(0)
	}

	logPath := os.Getenv("GO_ACP_HELPER_LOG")
	scenario := os.Getenv("GO_ACP_HELPER_SCENARIO")
	sessionID := "session-test-1"

	writeLog := func(entry helperLogEntry) {
		if logPath == "" {
			return
		}
		file, err := os.OpenFile(logPath, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o600)
		if err != nil {
			panic(err)
		}
		defer file.Close()
		if err := json.NewEncoder(file).Encode(entry); err != nil {
			panic(err)
		}
	}

	writeResponse := func(id any, result any) {
		if err := json.NewEncoder(os.Stdout).Encode(map[string]any{
			"jsonrpc": "2.0",
			"id":      id,
			"result":  result,
		}); err != nil {
			panic(err)
		}
	}

	scanner := bufio.NewScanner(os.Stdin)
	scanner.Buffer(make([]byte, 1024), 4*1024*1024)
	for scanner.Scan() {
		var message struct {
			ID     any             `json:"id"`
			Method string          `json:"method"`
			Params json.RawMessage `json:"params"`
			Result json.RawMessage `json:"result"`
		}
		if err := json.Unmarshal(scanner.Bytes(), &message); err != nil {
			panic(err)
		}
		switch message.Method {
		case "initialize":
			if scenario == "init-error-hang" {
				if err := json.NewEncoder(os.Stdout).Encode(map[string]any{
					"jsonrpc": "2.0",
					"id":      message.ID,
					"error":   map[string]any{"code": 401, "message": "not authenticated"},
				}); err != nil {
					panic(err)
				}
				time.Sleep(10 * time.Second)
			}
			writeResponse(message.ID, map[string]any{"protocolVersion": 1})
		case "session/new":
			writeLog(helperLogEntry{Method: "session/new", SessionID: sessionID})
			writeResponse(message.ID, map[string]any{"sessionId": sessionID})
		case "session/load":
			var params struct {
				SessionID string `json:"sessionId"`
			}
			if err := json.Unmarshal(message.Params, &params); err != nil {
				panic(err)
			}
			writeLog(helperLogEntry{Method: "session/load", SessionID: params.SessionID})
			writeResponse(message.ID, map[string]any{"sessionId": params.SessionID})
		case "session/set_mode":
			writeResponse(message.ID, map[string]any{})
		case "session/prompt":
			var params struct {
				SessionID string `json:"sessionId"`
			}
			if err := json.Unmarshal(message.Params, &params); err != nil {
				panic(err)
			}
			writeLog(helperLogEntry{Method: "session/prompt", SessionID: params.SessionID})
			switch scenario {
			case "text":
				emitMessageChunk(t, params.SessionID, "ordinary assistant text", "final_answer")
				writeResponse(message.ID, map[string]any{"stopReason": "completed"})
			case "permission", "once", "no-permission":
				options := []map[string]any{
					{"id": "once-1", "outcome": "allow_once"},
					{"id": "always-1", "outcome": "allow_always"},
				}
				if scenario == "once" {
					options = options[:1]
				}
				if scenario == "no-permission" {
					options = nil
				}
				if err := json.NewEncoder(os.Stdout).Encode(map[string]any{
					"jsonrpc": "2.0",
					"id":      9001,
					"method":  "session/request_permission",
					"params": map[string]any{
						"sessionId": params.SessionID,
						"options":   options,
					},
				}); err != nil {
					panic(err)
				}
				if !scanner.Scan() {
					panic("missing permission response")
				}
				var response struct {
					Result struct {
						Outcome  string `json:"outcome"`
						OptionID string `json:"optionId"`
					} `json:"result"`
				}
				if err := json.Unmarshal(scanner.Bytes(), &response); err != nil {
					panic(err)
				}
				writeLog(helperLogEntry{
					Method:   "permission-response",
					Outcome:  response.Result.Outcome,
					OptionID: response.Result.OptionID,
				})
				emitChunk(t, params.SessionID, `{"implementationPlan":"1. Change code","implementationNotes":"looked","summary":"done","tests":[]}`)
				writeResponse(message.ID, map[string]any{"stopReason": "completed"})
			case "unsupported":
				if err := json.NewEncoder(os.Stdout).Encode(map[string]any{
					"jsonrpc": "2.0",
					"id":      9002,
					"method":  "session/unknown",
					"params":  map[string]any{},
				}); err != nil {
					panic(err)
				}
				if !scanner.Scan() {
					panic("missing method-not-found response")
				}
				var response struct {
					Error struct {
						Code int `json:"code"`
					} `json:"error"`
				}
				if err := json.Unmarshal(scanner.Bytes(), &response); err != nil {
					panic(err)
				}
				writeLog(helperLogEntry{Method: "unsupported-response", ErrorCode: response.Error.Code})
				emitChunk(t, params.SessionID, `{"implementationPlan":"1. Change code","implementationNotes":"looked","summary":"done","tests":[]}`)
				writeResponse(message.ID, map[string]any{"stopReason": "completed"})
			case "exit":
				os.Exit(0)
			case "array-content":
				emitContentUpdate(t, params.SessionID)
				emitChunk(t, params.SessionID, `{"implementationPlan":"1. Change code","implementationNotes":"looked","summary":"done","tests":[]}`)
				writeResponse(message.ID, map[string]any{"stopReason": "completed"})
			case "phased-message":
				emitMessageChunk(t, params.SessionID, "I'm applying the approved plan.", "commentary")
				emitMessageChunk(t, params.SessionID, `{"implementationPlan":"1. Change code","implementationNotes":"looked","summary":"done","tests":[]}`, "final_answer")
				writeResponse(message.ID, map[string]any{"stopReason": "completed"})
			case "chunks", "reuse", "version", "exit-after-response":
				emitChunk(t, params.SessionID, `{"implementationPlan":"1. Change code",`)
				emitChunk(t, params.SessionID, `"implementationNotes":"looked","summary":"done","tests":[]}`)
				writeResponse(message.ID, map[string]any{"stopReason": "completed"})
				if scenario == "exit-after-response" {
					os.Exit(0)
				}
			case "malformed":
				emitChunk(t, params.SessionID, "```json\n{}\n```")
				writeResponse(message.ID, map[string]any{"stopReason": "completed"})
			case "cancelled":
				writeResponse(message.ID, map[string]any{"stopReason": "cancelled"})
			default:
				panic("unknown scenario: " + scenario)
			}
		case "session/cancel":
		case "session/close":
			writeResponse(message.ID, map[string]any{})
			os.Exit(0)
		default:
			if message.Result != nil {
				continue
			}
			panic("unexpected method: " + message.Method)
		}
	}
	if err := scanner.Err(); err != nil {
		panic(err)
	}
	os.Exit(0)
}

func fakeACPCommand(t *testing.T, scenario string) ([]string, string) {
	t.Helper()
	logPath := filepath.Join(t.TempDir(), "acp-helper.jsonl")
	t.Setenv("GO_WANT_ACP_HELPER_PROCESS", "1")
	t.Setenv("GO_ACP_HELPER_SCENARIO", scenario)
	t.Setenv("GO_ACP_HELPER_LOG", logPath)
	return []string{os.Args[0], "-test.run=^TestACPHelperProcess$", "--"}, logPath
}

func readHelperLog(t *testing.T, path string) []helperLogEntry {
	t.Helper()
	file, err := os.Open(path)
	if err != nil {
		t.Fatal(err)
	}
	defer file.Close()

	var entries []helperLogEntry
	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		var entry helperLogEntry
		if err := json.Unmarshal(scanner.Bytes(), &entry); err != nil {
			t.Fatal(err)
		}
		entries = append(entries, entry)
	}
	if err := scanner.Err(); err != nil {
		t.Fatal(err)
	}
	return entries
}

func emitChunk(t *testing.T, sessionID, text string) {
	emitMessageChunk(t, sessionID, text, "")
}

func emitMessageChunk(t *testing.T, sessionID, text, phase string) {
	t.Helper()
	update := map[string]any{
		"type": "agent_message_chunk",
		"text": text,
	}
	if phase != "" {
		update["_meta"] = map[string]any{
			"codex": map[string]any{"phase": phase},
		}
	}
	if err := json.NewEncoder(os.Stdout).Encode(map[string]any{
		"jsonrpc": "2.0",
		"method":  "session/update",
		"params": map[string]any{
			"sessionId": sessionID,
			"update":    update,
		},
	}); err != nil {
		panic(err)
	}
}

func emitContentUpdate(t *testing.T, sessionID string) {
	t.Helper()
	if err := json.NewEncoder(os.Stdout).Encode(map[string]any{
		"jsonrpc": "2.0",
		"method":  "session/update",
		"params": map[string]any{
			"sessionId": sessionID,
			"update": map[string]any{
				"sessionUpdate": "tool_call",
				"content": []map[string]any{
					{"type": "terminal", "terminalId": "terminal-1"},
					{"type": "text", "text": "running"},
				},
			},
		},
	}); err != nil {
		panic(err)
	}
}

func hasArg(args []string, want string) bool {
	for _, arg := range args {
		if arg == want {
			return true
		}
	}
	return false
}
