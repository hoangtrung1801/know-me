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
	"strings"
	"sync"
	"time"
)

const (
	ACPModeReadOnly ACPMode = "read-only"
	ACPModeAgent    ACPMode = "agent"
)

type ACPMode string

type ACPUpdate struct {
	Kind  string
	Text  string
	Phase string
}

type acpUpdateContent struct {
	Text string `json:"text"`
}

func (content *acpUpdateContent) UnmarshalJSON(data []byte) error {
	data = bytes.TrimSpace(data)
	content.Text = ""
	if len(data) == 0 || bytes.Equal(data, []byte("null")) {
		return nil
	}
	if data[0] != '[' {
		var block struct {
			Text string `json:"text"`
		}
		if err := json.Unmarshal(data, &block); err != nil {
			return err
		}
		content.Text = block.Text
		return nil
	}

	var blocks []struct {
		Text string `json:"text"`
	}
	if err := json.Unmarshal(data, &blocks); err != nil {
		return err
	}
	for _, block := range blocks {
		content.Text += block.Text
	}
	return nil
}

type acpRPCMessage struct {
	JSONRPC string       `json:"jsonrpc"`
	ID      *int64       `json:"id,omitempty"`
	Method  string       `json:"method,omitempty"`
	Params  any          `json:"params,omitempty"`
	Result  any          `json:"result,omitempty"`
	Error   *acpRPCError `json:"error,omitempty"`
}

type acpRPCError struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
}

type acpRPCResponse struct {
	result json.RawMessage
	err    error
}

type acpUpdateEvent struct {
	seq      uint64
	update   ACPUpdate
	callback func(ACPUpdate)
}

type ACPProcess struct {
	root     string
	command  []string
	cmd      *exec.Cmd
	stdin    io.WriteCloser
	stdout   io.ReadCloser
	logger   *runLogger
	loggerMu sync.RWMutex

	writeMu sync.Mutex

	pendingMu sync.Mutex
	pending   map[int64]chan acpRPCResponse
	nextID    int64

	stateMu      sync.RWMutex
	terminal     bool
	closing      bool
	transportErr error
	done         chan struct{}
	doneOnce     sync.Once

	waitDone   chan struct{}
	stdoutDone chan struct{}
	stderrDone chan struct{}

	sessionMu sync.RWMutex
	sessionID string

	promptMu sync.Mutex

	updateMu        sync.Mutex
	updateCallback  func(ACPUpdate)
	updateNext      uint64
	updateDelivered uint64
	updateDone      chan struct{}
	updateQueue     []acpUpdateEvent
	updateSignal    chan struct{}

	closeOnce  sync.Once
	closeDone  chan struct{}
	closeErrMu sync.Mutex
	closeErr   error
}

func NewACPProcess(ctx context.Context, root string, command []string, logger *runLogger) (*ACPProcess, error) {
	if root == "" {
		return nil, errors.New("ACP workspace root is required")
	}
	if len(command) == 0 || strings.TrimSpace(command[0]) == "" {
		return nil, errors.New("ACP adapter command is required")
	}

	cmd := exec.CommandContext(ctx, command[0], command[1:]...)
	cmd.Dir = root
	stdin, err := cmd.StdinPipe()
	if err != nil {
		return nil, fmt.Errorf("open ACP stdin: %w", err)
	}
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		_ = stdin.Close()
		return nil, fmt.Errorf("open ACP stdout: %w", err)
	}
	stderr, err := cmd.StderrPipe()
	if err != nil {
		_ = stdin.Close()
		_ = stdout.Close()
		return nil, fmt.Errorf("open ACP stderr: %w", err)
	}
	if err := cmd.Start(); err != nil {
		_ = stdin.Close()
		_ = stdout.Close()
		_ = stderr.Close()
		return nil, fmt.Errorf("start ACP adapter: %w", err)
	}

	process := &ACPProcess{
		root:         root,
		command:      append([]string(nil), command...),
		cmd:          cmd,
		stdin:        stdin,
		stdout:       stdout,
		logger:       logger,
		pending:      make(map[int64]chan acpRPCResponse),
		done:         make(chan struct{}),
		waitDone:     make(chan struct{}),
		stdoutDone:   make(chan struct{}),
		stderrDone:   make(chan struct{}),
		updateDone:   make(chan struct{}),
		updateSignal: make(chan struct{}, 1),
		closeDone:    make(chan struct{}),
	}
	go process.readStdout()
	go process.readStderr(stderr)
	go process.wait()
	go process.dispatchUpdates()

	if _, err := process.request(ctx, "initialize", map[string]any{
		"protocolVersion": 1,
		"clientInfo": map[string]any{
			"name":    "knowns",
			"title":   "Know-Me",
			"version": "dev",
		},
		"clientCapabilities": map[string]any{
			"fs": map[string]any{
				"readTextFile":  false,
				"writeTextFile": false,
			},
			"terminal": false,
		},
	}); err != nil {
		closeCtx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		_ = process.Close(closeCtx)
		cancel()
		return nil, fmt.Errorf("ACP initialize: %w", err)
	}
	return process, nil
}

func (p *ACPProcess) NewSession(ctx context.Context) error {
	result, err := p.request(ctx, "session/new", map[string]any{
		"cwd":        p.root,
		"mcpServers": []any{},
	})
	if err != nil {
		return fmt.Errorf("ACP session/new: %w", err)
	}
	var response struct {
		SessionID string `json:"sessionId"`
	}
	if err := json.Unmarshal(result, &response); err != nil {
		return fmt.Errorf("decode ACP session/new: %w", err)
	}
	if response.SessionID == "" {
		return errors.New("ACP session/new returned no session ID")
	}
	p.setSessionID(response.SessionID)
	return nil
}

func (p *ACPProcess) LoadSession(ctx context.Context, sessionID string) error {
	if strings.TrimSpace(sessionID) == "" {
		return errors.New("ACP session ID is required")
	}
	result, err := p.request(ctx, "session/load", map[string]any{
		"sessionId":  sessionID,
		"cwd":        p.root,
		"mcpServers": []any{},
	})
	if err != nil {
		return fmt.Errorf("ACP session/load: %w", err)
	}
	var response struct {
		SessionID string `json:"sessionId"`
	}
	if err := json.Unmarshal(result, &response); err != nil {
		return fmt.Errorf("decode ACP session/load: %w", err)
	}
	if response.SessionID == "" {
		response.SessionID = sessionID
	}
	p.setSessionID(response.SessionID)
	return nil
}

func (p *ACPProcess) SetMode(ctx context.Context, mode ACPMode) error {
	if mode != ACPModeReadOnly && mode != ACPModeAgent {
		return fmt.Errorf("unsupported ACP mode %q", mode)
	}
	sessionID := p.SessionID()
	if sessionID == "" {
		return errors.New("ACP session is not initialized")
	}
	if _, err := p.request(ctx, "session/set_mode", map[string]any{
		"sessionId": sessionID,
		"modeId":    string(mode),
	}); err != nil {
		return fmt.Errorf("ACP session/set_mode: %w", err)
	}
	return nil
}

func (p *ACPProcess) Prompt(ctx context.Context, prompt string, onUpdate func(ACPUpdate)) (string, error) {
	raw, err := p.PromptText(ctx, prompt, onUpdate)
	if err != nil {
		return "", err
	}
	if err := validateJSONObject([]byte(raw)); err != nil {
		return "", fmt.Errorf("decode ACP prompt result JSON: %w", err)
	}
	return raw, nil
}

func (p *ACPProcess) PromptText(ctx context.Context, prompt string, onUpdate func(ACPUpdate)) (string, error) {
	if strings.TrimSpace(prompt) == "" {
		return "", errors.New("ACP prompt is required")
	}
	sessionID := p.SessionID()
	if sessionID == "" {
		return "", errors.New("ACP session is not initialized")
	}

	p.promptMu.Lock()
	defer p.promptMu.Unlock()

	var resultMu sync.Mutex
	var result, legacyResult strings.Builder
	p.setUpdateCallback(func(update ACPUpdate) {
		if update.Kind == "agent_message_chunk" {
			resultMu.Lock()
			switch update.Phase {
			case "final_answer":
				result.WriteString(update.Text)
			case "":
				legacyResult.WriteString(update.Text)
			}
			resultMu.Unlock()
		}
		if onUpdate != nil {
			onUpdate(update)
		}
	})
	defer p.setUpdateCallback(nil)

	response, err := p.request(ctx, "session/prompt", map[string]any{
		"sessionId": sessionID,
		"prompt": []any{
			map[string]any{"type": "text", "text": prompt},
		},
	})
	if err != nil {
		return "", fmt.Errorf("ACP session/prompt: %w", err)
	}

	target := p.updateCount()
	if err := p.waitForUpdates(ctx, target); err != nil {
		return "", err
	}

	var promptResult struct {
		StopReason string `json:"stopReason"`
	}
	if err := json.Unmarshal(response, &promptResult); err != nil {
		return "", fmt.Errorf("decode ACP prompt response: %w", err)
	}
	if strings.EqualFold(promptResult.StopReason, "cancelled") {
		return "", errors.New("ACP prompt was cancelled")
	}
	if strings.TrimSpace(promptResult.StopReason) == "" {
		return "", errors.New("ACP prompt returned no stop reason")
	}

	resultMu.Lock()
	raw := result.String()
	if raw == "" {
		raw = legacyResult.String()
	}
	resultMu.Unlock()
	return raw, nil
}

func (p *ACPProcess) Cancel(ctx context.Context) error {
	sessionID := p.SessionID()
	if sessionID == "" {
		return nil
	}
	if err := p.notify(ctx, "session/cancel", map[string]any{"sessionId": sessionID}); err != nil {
		return fmt.Errorf("ACP session/cancel: %w", err)
	}
	return nil
}

func (p *ACPProcess) Close(ctx context.Context) error {
	p.closeOnce.Do(func() {
		defer close(p.closeDone)
		p.stateMu.Lock()
		p.closing = true
		p.stateMu.Unlock()

		if sessionID := p.SessionID(); sessionID != "" && !p.isTerminal() {
			_, err := p.request(ctx, "session/close", map[string]any{"sessionId": sessionID})
			p.closeErrMu.Lock()
			p.closeErr = err
			p.closeErrMu.Unlock()
		}
		_ = p.stdin.Close()
		select {
		case <-p.waitDone:
		case <-ctx.Done():
			if p.cmd.Process != nil {
				_ = p.cmd.Process.Kill()
			}
			<-p.waitDone
		}
		p.markTerminal(nil)
		if err := p.closeLogger(); err != nil {
			p.closeErrMu.Lock()
			if p.closeErr == nil {
				p.closeErr = err
			}
			p.closeErrMu.Unlock()
		}
	})
	<-p.closeDone
	p.closeErrMu.Lock()
	defer p.closeErrMu.Unlock()
	return p.closeErr
}

func (p *ACPProcess) SessionID() string {
	p.sessionMu.RLock()
	defer p.sessionMu.RUnlock()
	return p.sessionID
}

func (p *ACPProcess) setSessionID(sessionID string) {
	p.sessionMu.Lock()
	p.sessionID = sessionID
	p.sessionMu.Unlock()
}

func (p *ACPProcess) SetLogPath(path string) error {
	if path == "" {
		return nil
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return fmt.Errorf("create ACP log directory: %w", err)
	}
	file, err := os.OpenFile(path, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o600)
	if err != nil {
		return fmt.Errorf("open ACP log: %w", err)
	}
	logger := newRunLogger(file)
	p.loggerMu.Lock()
	previous := p.logger
	p.logger = logger
	p.loggerMu.Unlock()
	if previous != nil {
		_ = previous.close()
	}
	return nil
}

func (p *ACPProcess) writeLog(line []byte) error {
	p.loggerMu.RLock()
	defer p.loggerMu.RUnlock()
	if p.logger == nil {
		return nil
	}
	return p.logger.write(line)
}

func (p *ACPProcess) closeLogger() error {
	p.loggerMu.Lock()
	defer p.loggerMu.Unlock()
	if p.logger == nil {
		return nil
	}
	err := p.logger.close()
	p.logger = nil
	return err
}

func (p *ACPProcess) request(ctx context.Context, method string, params any) (json.RawMessage, error) {
	if err := p.currentError(); err != nil {
		return nil, err
	}
	p.pendingMu.Lock()
	p.nextID++
	id := p.nextID
	response := make(chan acpRPCResponse, 1)
	p.pending[id] = response
	p.pendingMu.Unlock()

	if err := p.write(acpRPCMessage{JSONRPC: "2.0", ID: &id, Method: method, Params: params}); err != nil {
		p.removePending(id)
		return nil, err
	}
	for {
		select {
		case response := <-response:
			if response.err != nil {
				return nil, response.err
			}
			return response.result, nil
		default:
		}
		select {
		case response := <-response:
			if response.err != nil {
				return nil, response.err
			}
			return response.result, nil
		case <-ctx.Done():
			p.removePending(id)
			return nil, ctx.Err()
		case <-p.done:
			select {
			case response := <-response:
				if response.err != nil {
					return nil, response.err
				}
				return response.result, nil
			default:
			}
			p.removePending(id)
			if err := p.currentError(); err != nil {
				return nil, err
			}
			return nil, errors.New("ACP process closed")
		}
	}
}

func (p *ACPProcess) notify(ctx context.Context, method string, params any) error {
	select {
	case <-ctx.Done():
		return ctx.Err()
	default:
	}
	if err := p.currentError(); err != nil {
		return err
	}
	return p.write(acpRPCMessage{JSONRPC: "2.0", Method: method, Params: params})
}

func (p *ACPProcess) write(message acpRPCMessage) error {
	data, err := json.Marshal(message)
	if err != nil {
		return fmt.Errorf("encode ACP message: %w", err)
	}
	p.writeMu.Lock()
	defer p.writeMu.Unlock()
	if err := p.currentError(); err != nil {
		return err
	}
	if _, err := p.stdin.Write(append(data, '\n')); err != nil {
		wrapped := fmt.Errorf("write ACP message: %w", err)
		p.markTerminal(wrapped)
		return wrapped
	}
	return nil
}

func (p *ACPProcess) readStdout() {
	defer close(p.stdoutDone)
	scanner := bufio.NewScanner(p.stdout)
	scanner.Buffer(make([]byte, 64*1024), maxRunLogBytes)
	for scanner.Scan() {
		line := append([]byte(nil), scanner.Bytes()...)
		if err := p.writeLog(line); err != nil {
			p.markTerminal(fmt.Errorf("write ACP log: %w", err))
			return
		}
		var message struct {
			JSONRPC string          `json:"jsonrpc"`
			ID      *int64          `json:"id"`
			Method  string          `json:"method"`
			Params  json.RawMessage `json:"params"`
			Result  json.RawMessage `json:"result"`
			Error   *acpRPCError    `json:"error"`
		}
		if err := json.Unmarshal(line, &message); err != nil {
			p.markTerminal(fmt.Errorf("decode ACP message: %w", err))
			return
		}
		if message.JSONRPC != "2.0" {
			p.markTerminal(errors.New("decode ACP message: invalid JSON-RPC version"))
			return
		}
		if message.Method != "" {
			if message.Method == "session/update" {
				p.handleAgentMessage(message.ID, message.Method, message.Params)
			} else {
				go p.handleAgentMessage(message.ID, message.Method, message.Params)
			}
			continue
		}
		if message.ID == nil {
			continue
		}
		p.pendingMu.Lock()
		response := p.pending[*message.ID]
		delete(p.pending, *message.ID)
		p.pendingMu.Unlock()
		if response == nil {
			continue
		}
		if message.Error != nil {
			response <- acpRPCResponse{err: fmt.Errorf("ACP error %d: %s", message.Error.Code, message.Error.Message)}
			continue
		}
		response <- acpRPCResponse{result: message.Result}
	}
	if err := scanner.Err(); err != nil {
		p.markTerminal(fmt.Errorf("read ACP output: %w", err))
		return
	}
	if !p.isClosing() {
		p.markTerminal(errors.New("ACP adapter output closed"))
	}
}

func (p *ACPProcess) readStderr(stderr io.ReadCloser) {
	defer close(p.stderrDone)
	defer stderr.Close()
	scanner := bufio.NewScanner(stderr)
	scanner.Buffer(make([]byte, 64*1024), maxRunLogBytes)
	for scanner.Scan() {
		if err := p.writeLog(scanner.Bytes()); err != nil {
			p.markTerminal(fmt.Errorf("write ACP log: %w", err))
			return
		}
	}
	if err := scanner.Err(); err != nil {
		p.markTerminal(fmt.Errorf("read ACP diagnostics: %w", err))
	}
}

func (p *ACPProcess) wait() {
	err := p.cmd.Wait()
	<-p.stdoutDone
	<-p.stderrDone
	if err != nil && !p.isClosing() {
		p.markTerminal(fmt.Errorf("ACP adapter exited: %w", err))
	} else {
		p.markTerminal(nil)
	}
	close(p.waitDone)
}

func (p *ACPProcess) handleAgentMessage(id *int64, method string, params json.RawMessage) {
	if method == "session/update" {
		var payload struct {
			Update struct {
				SessionUpdate string           `json:"sessionUpdate"`
				Type          string           `json:"type"`
				Text          string           `json:"text"`
				Content       acpUpdateContent `json:"content"`
				Meta          struct {
					Codex struct {
						Phase string `json:"phase"`
					} `json:"codex"`
				} `json:"_meta"`
			} `json:"update"`
		}
		if err := json.Unmarshal(params, &payload); err != nil {
			p.markTerminal(fmt.Errorf("decode ACP session/update: %w", err))
			return
		}
		kind := payload.Update.SessionUpdate
		if kind == "" {
			kind = payload.Update.Type
		}
		text := payload.Update.Content.Text
		if text == "" {
			text = payload.Update.Text
		}
		p.dispatchUpdate(ACPUpdate{Kind: kind, Text: text, Phase: payload.Update.Meta.Codex.Phase})
		return
	}
	if method == "session/request_permission" {
		var payload struct {
			Options []struct {
				ID       string `json:"id"`
				OptionID string `json:"optionId"`
				Outcome  string `json:"outcome"`
				Kind     string `json:"kind"`
			} `json:"options"`
		}
		if err := json.Unmarshal(params, &payload); err != nil {
			p.markTerminal(fmt.Errorf("decode ACP permission request: %w", err))
			return
		}
		optionID, ok := choosePermission(payload.Options)
		outcome := map[string]any{"outcome": "cancelled"}
		if ok {
			outcome = map[string]any{"outcome": "selected", "optionId": optionID}
		}
		if id == nil {
			return
		}
		if err := p.write(acpRPCMessage{JSONRPC: "2.0", ID: id, Result: outcome}); err != nil {
			p.markTerminal(err)
		}
		return
	}
	if id == nil {
		return
	}
	if err := p.write(acpRPCMessage{JSONRPC: "2.0", ID: id, Error: &acpRPCError{Code: -32601, Message: "method not found"}}); err != nil {
		p.markTerminal(err)
	}
}

func choosePermission(options []struct {
	ID       string `json:"id"`
	OptionID string `json:"optionId"`
	Outcome  string `json:"outcome"`
	Kind     string `json:"kind"`
}) (string, bool) {
	for _, wanted := range []string{"allow_always", "allow_once"} {
		for _, option := range options {
			kind := option.Outcome
			if kind == "" {
				kind = option.Kind
			}
			if kind != wanted {
				continue
			}
			id := option.OptionID
			if id == "" {
				id = option.ID
			}
			if id != "" {
				return id, true
			}
		}
	}
	return "", false
}

func (p *ACPProcess) dispatchUpdates() {
	for {
		p.updateMu.Lock()
		if len(p.updateQueue) > 0 {
			event := p.updateQueue[0]
			p.updateQueue = p.updateQueue[1:]
			if len(p.updateQueue) == 0 {
				p.updateQueue = nil
			}
			p.updateMu.Unlock()
			if event.callback != nil {
				event.callback(event.update)
			}
			p.updateMu.Lock()
			if event.seq > p.updateDelivered {
				p.updateDelivered = event.seq
			}
			close(p.updateDone)
			p.updateDone = make(chan struct{})
			p.updateMu.Unlock()
			continue
		}
		p.updateMu.Unlock()
		select {
		case <-p.updateSignal:
		case <-p.done:
			return
		}
	}
}

func (p *ACPProcess) dispatchUpdate(update ACPUpdate) {
	p.updateMu.Lock()
	p.updateNext++
	event := acpUpdateEvent{seq: p.updateNext, update: update, callback: p.updateCallback}
	p.updateQueue = append(p.updateQueue, event)
	p.updateMu.Unlock()
	select {
	case p.updateSignal <- struct{}{}:
	default:
	}
}

func (p *ACPProcess) setUpdateCallback(callback func(ACPUpdate)) {
	p.updateMu.Lock()
	p.updateCallback = callback
	p.updateMu.Unlock()
}

func (p *ACPProcess) updateCount() uint64 {
	p.updateMu.Lock()
	defer p.updateMu.Unlock()
	return p.updateNext
}

func (p *ACPProcess) waitForUpdates(ctx context.Context, target uint64) error {
	for {
		p.updateMu.Lock()
		if p.updateDelivered >= target {
			p.updateMu.Unlock()
			return nil
		}
		done := p.updateDone
		p.updateMu.Unlock()
		select {
		case <-done:
		case <-ctx.Done():
			return ctx.Err()
		case <-p.done:
			p.updateMu.Lock()
			if p.updateDelivered >= target {
				p.updateMu.Unlock()
				return nil
			}
			updateDone := p.updateDone
			p.updateMu.Unlock()
			select {
			case <-updateDone:
			case <-ctx.Done():
				return ctx.Err()
			}
		}
	}
}

func (p *ACPProcess) markTerminal(err error) {
	p.stateMu.Lock()
	if p.terminal {
		p.stateMu.Unlock()
		return
	}
	p.terminal = true
	if err != nil {
		p.transportErr = err
	}
	p.stateMu.Unlock()
	p.doneOnce.Do(func() { close(p.done) })

	p.pendingMu.Lock()
	pending := p.pending
	p.pending = make(map[int64]chan acpRPCResponse)
	p.pendingMu.Unlock()
	if err == nil {
		err = errors.New("ACP process closed")
	}
	for _, response := range pending {
		response <- acpRPCResponse{err: err}
	}
	if err != nil && p.cmd.Process != nil {
		_ = p.cmd.Process.Kill()
	}
}

func (p *ACPProcess) removePending(id int64) {
	p.pendingMu.Lock()
	delete(p.pending, id)
	p.pendingMu.Unlock()
}

func (p *ACPProcess) currentError() error {
	p.stateMu.RLock()
	defer p.stateMu.RUnlock()
	if p.transportErr != nil {
		return p.transportErr
	}
	if p.terminal {
		return errors.New("ACP process closed")
	}
	return nil
}

func (p *ACPProcess) isTerminal() bool {
	p.stateMu.RLock()
	defer p.stateMu.RUnlock()
	return p.terminal
}

func (p *ACPProcess) isClosing() bool {
	p.stateMu.RLock()
	defer p.stateMu.RUnlock()
	return p.closing
}

func validateJSONObject(data []byte) error {
	decoder := json.NewDecoder(bytes.NewReader(data))
	var object map[string]json.RawMessage
	if err := decoder.Decode(&object); err != nil {
		return err
	}
	if object == nil {
		return errors.New("result must be a JSON object")
	}
	var extra any
	if err := decoder.Decode(&extra); err != io.EOF {
		if err == nil {
			return errors.New("multiple JSON values are not allowed")
		}
		return err
	}
	return nil
}
