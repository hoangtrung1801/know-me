package omp

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"testing"
)
type helperLogEntry struct {
	Method    string `json:"method,omitempty"`
	SessionID string `json:"sessionId,omitempty"`
	Mode      string `json:"mode,omitempty"`
}

func fakeACPCommand(t *testing.T, scenario string) ([]string, string) {
	t.Helper()
	logPath := filepath.Join(t.TempDir(), "acp-helper.jsonl")
	t.Setenv("GO_WANT_OMP_ACP_HELPER_PROCESS", "1")
	t.Setenv("GO_OMP_ACP_HELPER_LOG", logPath)
	t.Setenv("GO_OMP_ACP_HELPER_SCENARIO", scenario)
	return []string{os.Args[0], "-test.run=TestACPHelperProcess", "--"}, logPath
}

func readHelperLog(t *testing.T, logPath string) []helperLogEntry {
	t.Helper()
	data, err := os.ReadFile(logPath)
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		t.Fatal(err)
	}
	var entries []helperLogEntry
	scanner := bufio.NewScanner(bytes.NewReader(data))
	for scanner.Scan() {
		line := scanner.Bytes()
		if len(line) == 0 {
			continue
		}
		var entry helperLogEntry
		if err := json.Unmarshal(line, &entry); err != nil {
			t.Fatal(err)
		}
		entries = append(entries, entry)
	}
	return entries
}

func TestACPProcessHandshakeAndSession(t *testing.T) {
	command, logPath := fakeACPCommand(t, "standard")

	proc, err := NewACPProcess(context.Background(), t.TempDir(), command, nil)
	if err != nil {
		t.Fatalf("NewACPProcess failed: %v", err)
	}
	defer proc.Close(context.Background())

	if err := proc.NewSession(context.Background()); err != nil {
		t.Fatalf("NewSession failed: %v", err)
	}

	sessionID := proc.SessionID()
	if sessionID == "" {
		t.Fatal("expected non-empty session ID")
	}

	if err := proc.SetMode(context.Background(), ACPModePlan); err != nil {
		t.Fatalf("SetMode failed: %v", err)
	}

	var updates []string
	response, err := proc.PromptText(context.Background(), "do work", func(u ACPUpdate) {
		updates = append(updates, u.Text)
	})
	if err != nil {
		t.Fatalf("PromptText failed: %v", err)
	}
	if response != "done" {
		t.Fatalf("response = %q, want 'done'", response)
	}
	if len(updates) == 0 {
		t.Fatal("expected stream updates, got 0")
	}

	_ = proc.Close(context.Background())

	entries := readHelperLog(t, logPath)
	methods := make(map[string]bool)
	for _, e := range entries {
		methods[e.Method] = true
	}
	if !methods["initialize"] {
		t.Fatal("expected initialize method in log")
	}
	if !methods["authenticate"] {
		t.Fatal("expected authenticate method in log")
	}
	if !methods["session/new"] {
		t.Fatal("expected session/new method in log")
	}
	if !methods["session/prompt"] {
		t.Fatal("expected session/prompt method in log")
	}
}

func TestACPProcessLoadSession(t *testing.T) {
	command, _ := fakeACPCommand(t, "standard")

	proc, err := NewACPProcess(context.Background(), t.TempDir(), command, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer proc.Close(context.Background())

	if err := proc.LoadSession(context.Background(), "existing-sess-1"); err != nil {
		t.Fatalf("LoadSession failed: %v", err)
	}
	if proc.SessionID() != "existing-sess-1" {
		t.Fatalf("SessionID = %q, want 'existing-sess-1'", proc.SessionID())
	}
}

func TestACPHelperProcess(t *testing.T) {
	if os.Getenv("GO_WANT_OMP_ACP_HELPER_PROCESS") != "1" {
		return
	}

	for _, arg := range os.Args[1:] {
		if arg == "--version" {
			fmt.Fprintln(os.Stdout, "omp 18.2.0")
			os.Exit(0)
		}
	}

	logPath := os.Getenv("GO_OMP_ACP_HELPER_LOG")
	writeLog := func(entry helperLogEntry) {
		if logPath == "" {
			return
		}
		f, err := os.OpenFile(logPath, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o600)
		if err != nil {
			return
		}
		defer f.Close()
		_ = json.NewEncoder(f).Encode(entry)
	}

	writeResponse := func(id any, result any) {
		_ = json.NewEncoder(os.Stdout).Encode(map[string]any{
			"jsonrpc": "2.0",
			"id":      id,
			"result":  result,
		})
	}

	scanner := bufio.NewScanner(os.Stdin)
	for scanner.Scan() {
		var msg struct {
			ID     any             `json:"id"`
			Method string          `json:"method"`
			Params json.RawMessage `json:"params"`
		}
		if err := json.Unmarshal(scanner.Bytes(), &msg); err != nil {
			continue
		}

		writeLog(helperLogEntry{Method: msg.Method})

		switch msg.Method {
		case "initialize":
			writeResponse(msg.ID, map[string]any{
				"protocolVersion": 1,
				"agentInfo": map[string]any{
					"name":    "oh-my-pi",
					"version": "18.2.0",
				},
				"authMethods": []map[string]any{
					{"id": "agent", "name": "Existing credentials"},
				},
			})
		case "authenticate":
			writeResponse(msg.ID, map[string]any{})
		case "session/new":
			writeResponse(msg.ID, map[string]any{
				"sessionId": "omp-session-100",
			})
		case "session/load":
			writeResponse(msg.ID, map[string]any{})
		case "session/set_mode":
			writeResponse(msg.ID, map[string]any{})
		case "session/prompt":
			// Send an update chunk notification before prompt response
			_ = json.NewEncoder(os.Stdout).Encode(map[string]any{
				"jsonrpc": "2.0",
				"method":  "session/update",
				"params": map[string]any{
					"type": "agent_message_chunk",
					"text": "done",
				},
			})
			writeResponse(msg.ID, map[string]any{
				"stopReason": "end_turn",
			})
		case "session/cancel":
			writeResponse(msg.ID, map[string]any{})
		}
	}
	os.Exit(0)
}
