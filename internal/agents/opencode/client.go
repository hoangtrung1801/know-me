// Package opencode provides a client for the OpenCode server API.
package opencode

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"
)

type healthResponse struct {
	Healthy bool   `json:"healthy"`
	Version string `json:"version,omitempty"`
}

// Config holds the OpenCode server configuration.
type Config struct {
	Host     string
	Port     int
	Username string
	Password string
}

// DefaultConfig returns a Config with default values.
func DefaultConfig() Config {
	return Config{
		Host:     "127.0.0.1",
		Port:     4096,
		Username: "opencode",
		Password: "",
	}
}

// Client is an HTTP client for the OpenCode server API.
type Client struct {
	config       Config
	baseURL      string
	httpClient   *http.Client
	healthClient *http.Client
	sseClient    *http.Client
	mu           sync.RWMutex
}

// NewClient creates a new OpenCode API client.
func NewClient(cfg Config) *Client {
	if cfg.Host == "" {
		cfg.Host = "127.0.0.1"
	}
	if cfg.Port == 0 {
		cfg.Port = 4096
	}
	if cfg.Username == "" {
		cfg.Username = "opencode"
	}

	return &Client{
		config:  cfg,
		baseURL: fmt.Sprintf("http://%s:%d", cfg.Host, cfg.Port),
		httpClient: &http.Client{
			Timeout: 5 * time.Second,
		},
		healthClient: &http.Client{
			Timeout: 3 * time.Second,
		},
		sseClient: &http.Client{
			Timeout: 0, // no timeout for long-lived SSE connections
		},
	}
}

// Session represents an OpenCode session.
type Session struct {
	ID     string `json:"id"`
	Status string `json:"status"`
}

// SessionResponse is the response from session endpoints.
// API returns session directly (not wrapped in "session" key)
type SessionResponse struct {
	Session
}

// SessionListResponse is the response from listing sessions.
type SessionListResponse struct {
	Sessions []Session `json:"sessions"`
}

// CreateSessionRequest is the request body for creating a session.
type CreateSessionRequest struct {
	Model   *ModelConfig `json:"model,omitempty"`
	Prompt  string       `json:"prompt,omitempty"`
	Context string       `json:"context,omitempty"`
}

// SendMessageRequest is the request body for sending a message.
// API: POST /session/:id/message
// Body: { messageID?, model?, agent?, noReply?, system?, tools?, parts, stream? }
type SendMessageRequest struct {
	// Model is the model configuration object
	Model *ModelConfig `json:"model,omitempty"`
	// Agent specifies the agent mode (e.g., "build", "ask")
	Agent string `json:"agent,omitempty"`
	// NoReply if true, sends without waiting for response
	NoReply bool `json:"noReply,omitempty"`
	// System is additional system prompt
	System string `json:"system,omitempty"`
	// Tools is custom tools configuration
	Tools any `json:"tools,omitempty"`
	// Parts is the message content as array of parts
	Parts []MessagePart `json:"parts"`
	// Stream if true, returns immediately while processing continues
	Stream bool `json:"stream,omitempty"`
}

// ModelConfig represents the model configuration.
type ModelConfig struct {
	ProviderID string `json:"providerID"`
	ModelID    string `json:"modelID"`
}

// MessagePart represents a part of a message.
type MessagePart struct {
	Type string `json:"type"`
	Text string `json:"text"`
}

// SendMessageResponse is the response from sending a message.
type SendMessageResponse struct {
	Info  MessageInfo   `json:"info"`
	Parts []MessagePart `json:"parts"`
}

// MessageInfo contains message metadata.
type MessageInfo struct {
	ID         string `json:"id"`
	SessionID  string `json:"sessionID"`
	Role       string `json:"role"`
	ModelID    string `json:"modelID"`
	ProviderID string `json:"providerID"`
}

// AsyncPromptRequest is the request body for async prompt.
// OpenCode currently accepts the same message payload shape as /session/:id/message.
type AsyncPromptRequest = SendMessageRequest

// AsyncPromptResponse is the response from async prompt.
type AsyncPromptResponse struct {
	SessionID string `json:"sessionID"`
}

// ErrorResponse represents an API error.
type ErrorResponse struct {
	Error string `json:"error"`
}

// doRequest performs an authenticated HTTP request.
func (c *Client) doRequest(method, path string, body any) (*http.Response, error) {
	var bodyReader io.Reader
	if body != nil {
		data, err := json.Marshal(body)
		if err != nil {
			return nil, fmt.Errorf("marshal request: %w", err)
		}
		bodyReader = bytes.NewReader(data)
		log.Printf("[opencode-client] Request body: %s", string(data))
	}

	url := c.baseURL + path
	req, err := http.NewRequest(method, url, bodyReader)
	if err != nil {
		return nil, fmt.Errorf("create request: %w", err)
	}

	req.Header.Set("Content-Type", "application/json")
	if c.config.Password != "" {
		req.SetBasicAuth(c.config.Username, c.config.Password)
	}

	log.Printf("[opencode-client] %s %s", method, url)
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("request failed: %w", err)
	}

	// Check for non-2xx status
	if resp.StatusCode >= 400 {
		body, _ := io.ReadAll(resp.Body)
		log.Printf("[opencode-client] Error response: status=%d body=%s", resp.StatusCode, string(body))
	}

	return resp, nil
}

// basicAuth returns a base64 encoded Basic Auth string.
func basicAuth(username, password string) string {
	auth := username + ":" + password
	return base64.StdEncoding.EncodeToString([]byte(auth))
}

// checkError checks for API errors and returns an error if present.
func (c *Client) checkError(resp *http.Response) error {
	if resp.StatusCode >= 200 && resp.StatusCode < 300 {
		return nil
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return fmt.Errorf("status %d: failed to read body", resp.StatusCode)
	}

	var errResp ErrorResponse
	if json.Unmarshal(body, &errResp) == nil && errResp.Error != "" {
		return fmt.Errorf("API error (%d): %s", resp.StatusCode, errResp.Error)
	}

	return fmt.Errorf("status %d: %s", resp.StatusCode, string(body))
}

// CreateSession creates a new OpenCode session.
func (c *Client) CreateSession(req CreateSessionRequest) (*Session, error) {
	resp, err := c.doRequest("POST", "/session", req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if err := c.checkError(resp); err != nil {
		return nil, err
	}

	var result SessionResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("decode response: %w", err)
	}

	return &result.Session, nil
}

// GetSession returns a session by ID.
func (c *Client) GetSession(id string) (*Session, error) {
	resp, err := c.doRequest("GET", "/session/"+id, nil)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if err := c.checkError(resp); err != nil {
		return nil, err
	}

	var result SessionResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("decode response: %w", err)
	}

	return &result.Session, nil
}

// ListSessions returns all sessions.
func (c *Client) ListSessions() ([]Session, error) {
	resp, err := c.doRequest("GET", "/session", nil)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if err := c.checkError(resp); err != nil {
		return nil, err
	}

	var result SessionListResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("decode response: %w", err)
	}

	return result.Sessions, nil
}

// DeleteSession deletes a session by ID.
func (c *Client) DeleteSession(id string) error {
	resp, err := c.doRequest("DELETE", "/session/"+id, nil)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	return c.checkError(resp)
}

// ForkSession creates a forked copy of a session.
func (c *Client) ForkSession(id string) (*Session, error) {
	resp, err := c.doRequest("POST", "/session/"+id+"/fork", nil)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if err := c.checkError(resp); err != nil {
		return nil, err
	}

	var result SessionResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("decode response: %w", err)
	}

	return &result.Session, nil
}

// SendMessage sends a message to a session and waits for response.
func (c *Client) SendMessage(sessionID string, req SendMessageRequest) (*SendMessageResponse, error) {
	resp, err := c.doRequest("POST", "/session/"+sessionID+"/message", req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if err := c.checkError(resp); err != nil {
		return nil, err
	}

	var result SendMessageResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("decode response: %w", err)
	}

	return &result, nil
}

// SendMessageAsync sends a message asynchronously.
func (c *Client) SendMessageAsync(sessionID string, req AsyncPromptRequest) (string, error) {
	resp, err := c.doRequest("POST", "/session/"+sessionID+"/prompt_async", req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	if err := c.checkError(resp); err != nil {
		return "", err
	}

	var result AsyncPromptResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", fmt.Errorf("decode response: %w", err)
	}

	return result.SessionID, nil
}

// SessionMessage represents a message from OpenCode session.
type SessionMessage struct {
	Info  MessageInfo   `json:"info"`
	Parts []MessagePart `json:"parts"`
}

// GetMessages returns all messages from a session.
func (c *Client) GetMessages(sessionID string) ([]SessionMessage, error) {
	resp, err := c.doRequest("GET", "/session/"+sessionID+"/message", nil)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if err := c.checkError(resp); err != nil {
		return nil, err
	}

	var result []SessionMessage
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("decode response: %w", err)
	}

	return result, nil
}

// EventURL returns the WebSocket URL for session events.
func (c *Client) EventURL(sessionID string) string {
	scheme := "ws"
	if c.config.Host == "localhost" || c.config.Host == "127.0.0.1" {
		scheme = "ws"
	}
	u := &url.URL{
		Scheme: scheme,
		Host:   fmt.Sprintf("%s:%d", c.config.Host, c.config.Port),
		Path:   fmt.Sprintf("/session/%s/event", sessionID),
	}
	if c.config.Password != "" {
		u.User = url.UserPassword(c.config.Username, c.config.Password)
	}
	return u.String()
}

// BaseURL returns the HTTP base URL for the OpenCode server.
func (c *Client) BaseURL() string {
	return fmt.Sprintf("%s:%d", c.config.Host, c.config.Port)
}

// EventHandler is a callback for processing events.
type EventHandler func(event map[string]any)

// StreamEvents connects to the session event stream using SSE and calls handler for each event.
func (c *Client) StreamEvents(sessionID string, handler EventHandler) error {
	// Use SSE endpoint instead of WebSocket
	url := fmt.Sprintf("%s/event?sessionID=%s", c.baseURL, sessionID)
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return fmt.Errorf("create request: %w", err)
	}
	if c.config.Password != "" {
		req.SetBasicAuth(c.config.Username, c.config.Password)
	}

	resp, err := c.sseClient.Do(req)
	if err != nil {
		return fmt.Errorf("request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("SSE error: %s", string(body))
	}

	// Read SSE stream
	reader := io.Reader(resp.Body)
	buf := make([]byte, 0, 4096)
	chunk := make([]byte, 4096)

	for {
		n, err := reader.Read(chunk)
		if err != nil {
			break
		}
		buf = append(buf, chunk[:n]...)

		// Process complete lines
		for len(buf) > 0 {
			lineEnd := bytes.IndexByte(buf, '\n')
			if lineEnd == -1 {
				break
			}
			line := string(buf[:lineEnd])
			buf = buf[lineEnd+1:]

			// Parse SSE line: "data: {...}"
			if len(line) > 6 && line[:6] == "data: " {
				data := line[6:]
				var event map[string]any
				if err := json.Unmarshal([]byte(data), &event); err == nil {
					handler(event)
				}
			}
		}
	}

	return nil
}

// StreamGlobalEvents connects to the global event stream (/global/event) using
// SSE and calls handler for each event. It blocks until the stream ends or ctx
// is cancelled. The caller is responsible for reconnection logic.
func (c *Client) StreamGlobalEvents(ctx context.Context, handler EventHandler) error {
	url := fmt.Sprintf("%s/global/event", c.baseURL)
	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return fmt.Errorf("create request: %w", err)
	}
	if c.config.Password != "" {
		req.SetBasicAuth(c.config.Username, c.config.Password)
	}

	resp, err := c.sseClient.Do(req)
	if err != nil {
		return fmt.Errorf("request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("SSE error: %s", string(body))
	}

	buf := make([]byte, 0, 4096)
	chunk := make([]byte, 4096)

	for {
		n, readErr := resp.Body.Read(chunk)
		if n > 0 {
			buf = append(buf, chunk[:n]...)
			for len(buf) > 0 {
				lineEnd := bytes.IndexByte(buf, '\n')
				if lineEnd == -1 {
					break
				}
				line := string(buf[:lineEnd])
				buf = buf[lineEnd+1:]

				if len(line) > 6 && line[:6] == "data: " {
					data := line[6:]
					var event map[string]any
					if err := json.Unmarshal([]byte(data), &event); err == nil {
						handler(event)
					}
				}
			}
		}
		if readErr != nil {
			if ctx.Err() != nil {
				return ctx.Err()
			}
			return readErr
		}
	}
}

// IsServerAvailable checks if the OpenCode server is running and accessible.
// Uses a short 3s timeout to avoid blocking the caller.
func (c *Client) IsServerAvailable() bool {
	return c.Readiness().Healthy
}

// Readiness performs staged probes so callers can distinguish shallow health
// from a runtime that is fully ready for chat use.
func (c *Client) Readiness() RuntimeReadiness {
	readiness := RuntimeReadiness{}

	var health healthResponse
	if err := c.probe("/global/health", &health); err != nil {
		readiness.Error = err.Error()
		return readiness
	}
	readiness.Healthy = health.Healthy
	readiness.Version = health.Version
	if !health.Healthy {
		readiness.Error = "OpenCode health check reported unhealthy"
		return readiness
	}

	if err := c.probe("/config", nil); err != nil {
		readiness.Error = err.Error()
		return readiness
	}
	readiness.ConfigOK = true

	if err := c.probe("/agent", nil); err != nil {
		readiness.Error = err.Error()
		return readiness
	}
	readiness.AgentOK = true
	readiness.Ready = true
	return readiness
}

func (c *Client) probe(path string, target any) error {
	req, err := http.NewRequest("GET", c.baseURL+"/global/health", nil)
	if err != nil {
		return fmt.Errorf("create %s request: %w", path, err)
	}
	req.URL.Path = path
	if c.config.Password != "" {
		req.SetBasicAuth(c.config.Username, c.config.Password)
	}
	resp, err := c.healthClient.Do(req)
	if err != nil {
		return fmt.Errorf("request %s failed: %w", path, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		body, _ := io.ReadAll(resp.Body)
		msg := strings.TrimSpace(string(body))
		if msg == "" {
			msg = resp.Status
		}
		return fmt.Errorf("%s returned %d: %s", path, resp.StatusCode, msg)
	}

	if target == nil {
		return nil
	}
	if err := json.NewDecoder(resp.Body).Decode(target); err != nil {
		return fmt.Errorf("decode %s response: %w", path, err)
	}
	return nil
}

// ProviderResponse is the response from the provider endpoint.
type ProviderResponse struct {
	All       []Provider        `json:"all"`
	Default   map[string]string `json:"default"`
	Connected []string          `json:"connected"`
}

// Provider represents an AI provider.
type Provider struct {
	ID     string               `json:"id"`
	Name   string               `json:"name"`
	Models map[string]ModelInfo `json:"models"`
}

// ModelInfo represents information about a model.
type ModelInfo struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Family      string `json:"family"`
	ReleaseDate string `json:"release_date"`
}

// ListProviders returns all available AI providers.
func (c *Client) ListProviders() (*ProviderResponse, error) {
	resp, err := c.doRequest("GET", "/provider", nil)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if err := c.checkError(resp); err != nil {
		return nil, err
	}

	var result ProviderResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("decode response: %w", err)
	}

	return &result, nil
}
