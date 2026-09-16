package omp

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
	"sync/atomic"
	"time"
)

const (
	ACPModePlan    ACPMode = "plan"
	ACPModeDefault ACPMode = "default"
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
	JSONRPC string          `json:"jsonrpc"`
	ID      *int64          `json:"id,omitempty"`
	Method  string          `json:"method,omitempty"`
	Params  json.RawMessage `json:"params,omitempty"`
	Result  json.RawMessage `json:"result,omitempty"`
	Error   *acpRPCError    `json:"error,omitempty"`
}

type acpRPCError struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
}

type acpRPCResponse struct {
	result json.RawMessage
	err    error
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
	nextID    atomic.Int64

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

	updateMu       sync.Mutex
	updateCallback func(ACPUpdate)

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
		root:       root,
		command:    append([]string(nil), command...),
		cmd:        cmd,
		stdin:      stdin,
		stdout:     stdout,
		logger:     logger,
		pending:    make(map[int64]chan acpRPCResponse),
		done:       make(chan struct{}),
		waitDone:   make(chan struct{}),
		stdoutDone: make(chan struct{}),
		stderrDone: make(chan struct{}),
		closeDone:  make(chan struct{}),
	}
	go process.readStdout()
	go process.readStderr(stderr)
	go process.wait()

	initCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()

	// 1. Initialize
	initResult, err := process.request(initCtx, "initialize", map[string]any{
		"protocolVersion": 1,
		"clientInfo": map[string]any{
			"name":    "knowme",
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
	})
	if err != nil {
		_ = process.Close(context.Background())
		return nil, fmt.Errorf("ACP initialize: %w", err)
	}

	// 2. Inspect auth methods
	var initResp struct {
		ProtocolVersion int `json:"protocolVersion"`
		AuthMethods     []struct {
			ID   string `json:"id"`
			Name string `json:"name"`
		} `json:"authMethods"`
	}
	if err := json.Unmarshal(initResult, &initResp); err == nil {
		hasAgentAuth := false
		for _, method := range initResp.AuthMethods {
			if method.ID == "agent" {
				hasAgentAuth = true
				break
			}
		}
		if hasAgentAuth {
			authCtx, authCancel := context.WithTimeout(ctx, 10*time.Second)
			defer authCancel()
			if _, err := process.request(authCtx, "authenticate", map[string]any{
				"methodId": "agent",
			}); err != nil {
				_ = process.Close(context.Background())
				return nil, fmt.Errorf("ACP authenticate: %w", err)
			}
		}
	}

	return process, nil
}

func (p *ACPProcess) NewSession(ctx context.Context) error {
	sessionCtx, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()

	result, err := p.request(sessionCtx, "session/new", map[string]any{
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
		return errors.New("ACP session/new returned empty session ID")
	}

	p.sessionMu.Lock()
	p.sessionID = response.SessionID
	p.sessionMu.Unlock()
	return nil
}

func (p *ACPProcess) LoadSession(ctx context.Context, sessionID string) error {
	if sessionID == "" {
		return errors.New("session ID is required to load session")
	}
	loadCtx, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()

	_, err := p.request(loadCtx, "session/load", map[string]any{
		"sessionId":  sessionID,
		"cwd":        p.root,
		"mcpServers": []any{},
	})
	if err != nil {
		return fmt.Errorf("ACP session/load: %w", err)
	}

	p.sessionMu.Lock()
	p.sessionID = sessionID
	p.sessionMu.Unlock()
	return nil
}

func (p *ACPProcess) SetMode(ctx context.Context, mode ACPMode) error {
	p.sessionMu.RLock()
	sessionID := p.sessionID
	p.sessionMu.RUnlock()

	if sessionID == "" {
		return errors.New("ACP session ID is required to set mode")
	}
	modeCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()

	_, err := p.request(modeCtx, "session/set_mode", map[string]any{
		"sessionId": sessionID,
		"modeId":    string(mode),
	})
	if err != nil {
		return nil
	}
	return nil
}

func (p *ACPProcess) Prompt(ctx context.Context, text string, onUpdate func(ACPUpdate)) (string, error) {
	p.promptMu.Lock()
	defer p.promptMu.Unlock()

	p.sessionMu.RLock()
	sessionID := p.sessionID
	p.sessionMu.RUnlock()

	if sessionID == "" {
		return "", errors.New("ACP session is not initialized")
	}

	p.setUpdateCallback(onUpdate)
	defer p.setUpdateCallback(nil)

	result, err := p.request(ctx, "session/prompt", map[string]any{
		"sessionId": sessionID,
		"prompt": []any{
			map[string]any{
				"type": "text",
				"text": text,
			},
		},
	})
	if err != nil {
		return "", err
	}

	var response struct {
		StopReason string `json:"stopReason"`
	}
	_ = json.Unmarshal(result, &response)
	return string(result), nil
}

func (p *ACPProcess) PromptText(ctx context.Context, text string, onUpdate func(ACPUpdate)) (string, error) {
	var collected strings.Builder
	wrappedUpdate := func(update ACPUpdate) {
		if update.Text != "" {
			collected.WriteString(update.Text)
		}
		if onUpdate != nil {
			onUpdate(update)
		}
	}
	_, err := p.Prompt(ctx, text, wrappedUpdate)
	if err != nil {
		return collected.String(), err
	}
	return collected.String(), nil
}

func (p *ACPProcess) Cancel(ctx context.Context) error {
	p.sessionMu.RLock()
	sessionID := p.sessionID
	p.sessionMu.RUnlock()

	if sessionID != "" {
		cancelCtx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		defer cancel()
		_, _ = p.request(cancelCtx, "session/cancel", map[string]any{
			"sessionId": sessionID,
		})
	}
	return p.Close(ctx)
}

func (p *ACPProcess) Close(ctx context.Context) error {
	p.closeOnce.Do(func() {
		p.stateMu.Lock()
		p.closing = true
		p.stateMu.Unlock()

		_ = p.stdin.Close()

		if p.cmd != nil && p.cmd.Process != nil {
			_ = p.cmd.Process.Signal(os.Interrupt)
			timer := time.AfterFunc(2*time.Second, func() {
				if p.cmd != nil && p.cmd.Process != nil {
					_ = p.cmd.Process.Kill()
				}
			})
			select {
			case <-p.waitDone:
				timer.Stop()
			case <-ctx.Done():
				timer.Stop()
				if p.cmd != nil && p.cmd.Process != nil {
					_ = p.cmd.Process.Kill()
				}
			}
		}

		p.setTerminal(errors.New("ACP process closed"))
		close(p.closeDone)
	})
	select {
	case <-p.closeDone:
		return nil
	case <-ctx.Done():
		return ctx.Err()
	}
}

func (p *ACPProcess) SessionID() string {
	p.sessionMu.RLock()
	defer p.sessionMu.RUnlock()
	return p.sessionID
}

func (p *ACPProcess) SetLogPath(logPath string) error {
	if logPath == "" {
		return nil
	}
	if err := os.MkdirAll(filepath.Dir(logPath), 0o755); err != nil {
		return fmt.Errorf("create run log directory: %w", err)
	}
	f, err := os.OpenFile(logPath, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o600)
	if err != nil {
		return fmt.Errorf("open run log: %w", err)
	}
	p.loggerMu.Lock()
	p.logger = newRunLogger(f)
	p.loggerMu.Unlock()
	return nil
}

func (p *ACPProcess) request(ctx context.Context, method string, params any) (json.RawMessage, error) {
	id := p.nextID.Add(1)

	var paramsRaw json.RawMessage
	if params != nil {
		data, err := json.Marshal(params)
		if err != nil {
			return nil, fmt.Errorf("marshal %s params: %w", method, err)
		}
		paramsRaw = data
	}

	responseChan := make(chan acpRPCResponse, 1)
	p.pendingMu.Lock()
	p.pending[id] = responseChan
	p.pendingMu.Unlock()

	defer func() {
		p.pendingMu.Lock()
		delete(p.pending, id)
		p.pendingMu.Unlock()
	}()

	msg := acpRPCMessage{
		JSONRPC: "2.0",
		ID:      &id,
		Method:  method,
		Params:  paramsRaw,
	}
	encoded, err := json.Marshal(msg)
	if err != nil {
		return nil, fmt.Errorf("marshal %s message: %w", method, err)
	}

	p.writeMu.Lock()
	p.logLine(encoded)
	_, err = p.stdin.Write(append(encoded, '\n'))
	p.writeMu.Unlock()
	if err != nil {
		return nil, fmt.Errorf("write %s to ACP stdin: %w", method, err)
	}

	select {
	case <-ctx.Done():
		return nil, ctx.Err()
	case <-p.done:
		p.stateMu.RLock()
		defer p.stateMu.RUnlock()
		if p.transportErr != nil {
			return nil, p.transportErr
		}
		return nil, errors.New("ACP process terminated")
	case resp := <-responseChan:
		return resp.result, resp.err
	}
}

func (p *ACPProcess) readStdout() {
	defer close(p.stdoutDone)
	scanner := bufio.NewScanner(p.stdout)
	buf := make([]byte, 64*1024)
	scanner.Buffer(buf, 4*1024*1024)

	for scanner.Scan() {
		line := scanner.Bytes()
		p.logLine(line)
		p.handleIncomingMessage(line)
	}
	if err := scanner.Err(); err != nil {
		p.setTerminal(err)
	}
}

func (p *ACPProcess) readStderr(stderr io.ReadCloser) {
	defer close(p.stderrDone)
	defer stderr.Close()
	scanner := bufio.NewScanner(stderr)
	for scanner.Scan() {
		p.logStderr(scanner.Bytes())
	}
}

func (p *ACPProcess) wait() {
	defer close(p.waitDone)
	err := p.cmd.Wait()
	if err != nil {
		p.setTerminal(fmt.Errorf("ACP process exited: %w", err))
	} else {
		p.setTerminal(errors.New("ACP process exited cleanly"))
	}
}

func (p *ACPProcess) handleIncomingMessage(line []byte) {
	var msg acpRPCMessage
	if err := json.Unmarshal(line, &msg); err != nil {
		return
	}

	// 1. Response to our pending request
	if msg.ID != nil && msg.Method == "" {
		p.pendingMu.Lock()
		ch, ok := p.pending[*msg.ID]
		p.pendingMu.Unlock()
		if ok {
			var resp acpRPCResponse
			if msg.Error != nil {
				resp.err = fmt.Errorf("ACP error %d: %s", msg.Error.Code, msg.Error.Message)
			} else {
				resp.result = msg.Result
			}
			ch <- resp
		}
		return
	}

	// 2. Notification from agent
	if msg.Method == "session/update" || msg.Method == "agent_message_chunk" {
		p.handleNotification(msg)
		return
	}

	// 3. Inbound request from agent (e.g. session/request_permission)
	if msg.ID != nil && msg.Method != "" {
		go p.handleInboundRequest(msg)
	}
}

func (p *ACPProcess) handleInboundRequest(req acpRPCMessage) {
	// Auto-approve permissions if possible, or respond with safe null
	response := acpRPCMessage{
		JSONRPC: "2.0",
		ID:      req.ID,
		Result:  json.RawMessage(`{"decision":"allow_once"}`),
	}
	encoded, err := json.Marshal(response)
	if err == nil {
		p.writeMu.Lock()
		_, _ = p.stdin.Write(append(encoded, '\n'))
		p.writeMu.Unlock()
	}
}

func (p *ACPProcess) handleNotification(msg acpRPCMessage) {
	var update ACPUpdate

	// Decode session/update or direct chunks
	var payload struct {
		Type   string `json:"type"`
		Text   string `json:"text"`
		Update struct {
			Type string `json:"type"`
			Text string `json:"text"`
		} `json:"update"`
	}
	if err := json.Unmarshal(msg.Params, &payload); err == nil {
		if payload.Text != "" {
			update.Text = payload.Text
			update.Kind = payload.Type
		} else if payload.Update.Text != "" {
			update.Text = payload.Update.Text
			update.Kind = payload.Update.Type
		}
	}
	if update.Text != "" {
		p.updateMu.Lock()
		cb := p.updateCallback
		p.updateMu.Unlock()
		if cb != nil {
			cb(update)
		}
	}
}

func (p *ACPProcess) setUpdateCallback(cb func(ACPUpdate)) {
	p.updateMu.Lock()
	p.updateCallback = cb
	p.updateMu.Unlock()
}

func (p *ACPProcess) logLine(line []byte) {
	p.loggerMu.RLock()
	defer p.loggerMu.RUnlock()
	if p.logger != nil {
		_ = p.logger.write(line)
	}
}

func (p *ACPProcess) logStderr(line []byte) {
	p.loggerMu.RLock()
	defer p.loggerMu.RUnlock()
	if p.logger != nil {
		_ = p.logger.writeStderr(line)
	}
}

func (p *ACPProcess) setTerminal(err error) {
	p.stateMu.Lock()
	if !p.terminal {
		p.terminal = true
		p.transportErr = err
		p.doneOnce.Do(func() {
			close(p.done)
		})
	}
	p.stateMu.Unlock()
}
