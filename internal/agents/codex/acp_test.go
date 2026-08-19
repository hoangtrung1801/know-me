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
)

type helperLogEntry struct {
	Method    string `json:"method,omitempty"`
	SessionID string `json:"sessionId,omitempty"`
	Outcome   string `json:"outcome,omitempty"`
	OptionID  string `json:"optionId,omitempty"`
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
	result, err := decodePhaseResult([]byte(raw))
	if err != nil {
		t.Fatal(err)
	}
	if got, want := result.Summary, "done"; got != want {
		t.Fatalf("summary = %q, want %q", got, want)
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
			case "permission":
				if err := json.NewEncoder(os.Stdout).Encode(map[string]any{
					"jsonrpc": "2.0",
					"id":      9001,
					"method":  "session/request_permission",
					"params": map[string]any{
						"sessionId": params.SessionID,
						"options": []map[string]any{
							{"id": "once-1", "outcome": "allow_once"},
							{"id": "always-1", "outcome": "allow_always"},
						},
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
			case "chunks", "reuse", "version":
				emitChunk(t, params.SessionID, `{"implementationPlan":"1. Change code",`)
				emitChunk(t, params.SessionID, `"implementationNotes":"looked","summary":"done","tests":[]}`)
				writeResponse(message.ID, map[string]any{"stopReason": "completed"})
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
	t.Helper()
	if err := json.NewEncoder(os.Stdout).Encode(map[string]any{
		"jsonrpc": "2.0",
		"method":  "session/update",
		"params": map[string]any{
			"sessionId": sessionID,
			"update": map[string]any{
				"type": "agent_message_chunk",
				"text": text,
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
