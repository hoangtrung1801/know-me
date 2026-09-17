package cli

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/spf13/cobra"

	"github.com/hoangtrung1801/know-me/internal/models"
)

// remoteHTTPTimeout bounds every remote request so a hung server (e.g. the
// observed /api/status LSP-lock hang) fails fast instead of hanging the CLI.
const remoteHTTPTimeout = 10 * time.Second

// RemoteClient talks to a Know-Me server configured via server_url instead of
// touching the local ~/.know-me store.
type RemoteClient struct {
	BaseURL string
	Token   string
	HTTP    *http.Client
}

// NewRemoteClient validates and normalizes a server_url value.
func NewRemoteClient(serverURL string) (*RemoteClient, error) {
	trimmed := strings.TrimSpace(serverURL)
	if err := models.ValidateServerURL(trimmed); err != nil {
		return nil, err
	}
	return &RemoteClient{
		BaseURL: strings.TrimRight(trimmed, "/"),
		Token:   strings.TrimSpace(os.Getenv("KNOWME_TOKEN")),
		HTTP:    &http.Client{Timeout: remoteHTTPTimeout},
	}, nil
}

// RemoteForCommand resolves the effective server_url without requiring a
// local project store, so remote mode works even where no local project is
// initialized. Precedence: --server-url flag > KNOWME_SERVER_URL env >
// .know-me/config.json (walk-up) > local ("", false, nil).
func RemoteForCommand(cmd *cobra.Command) (*RemoteClient, bool, error) {
	for curr := cmd; curr != nil; curr = curr.Parent() {
		flagVal, err := curr.Flags().GetString("server-url")
		if err != nil {
			flagVal, err = curr.PersistentFlags().GetString("server-url")
		}
		if err == nil && (curr.Flags().Changed("server-url") || curr.PersistentFlags().Changed("server-url")) {
			trimmed := strings.TrimSpace(flagVal)
			if trimmed == "" || strings.EqualFold(trimmed, "local") {
				return nil, false, nil
			}
			client, err := NewRemoteClient(trimmed)
			if err != nil {
				return nil, false, fmt.Errorf("--server-url: %w", err)
			}
			return client, true, nil
		}
	}

	if envVal := strings.TrimSpace(os.Getenv("KNOWME_SERVER_URL")); envVal != "" {
		if strings.EqualFold(envVal, "local") {
			return nil, false, nil
		}
		client, err := NewRemoteClient(envVal)
		if err != nil {
			return nil, false, fmt.Errorf("KNOWME_SERVER_URL: %w", err)
		}
		return client, true, nil
	}
	if fileURL, src := serverURLFromConfigFile(); strings.TrimSpace(fileURL) != "" {
		client, err := NewRemoteClient(fileURL)
		if err != nil {
			return nil, false, fmt.Errorf("%s server_url: %w", src, err)
		}
		return client, true, nil
	}

	return nil, false, nil
}

// serverURLFromConfigFile searches for server_url:
// 1. Repo-local or walk-up .know-me/config.json
// 2. Main user-level configuration ~/.know-me/config.json
func serverURLFromConfigFile() (string, string) {
	// 1. Walk up from working directory
	if cwd, err := os.Getwd(); err == nil {
		if dir, err := filepath.Abs(cwd); err == nil {
			for {
				path := filepath.Join(dir, ".know-me", "config.json")
				if data, readErr := os.ReadFile(path); readErr == nil {
					var project models.Project
					if json.Unmarshal(data, &project) == nil {
						if u := strings.TrimSpace(project.Settings.ServerURL); u != "" {
							return u, path
						}
					}
				}
				parent := filepath.Dir(dir)
				if parent == dir {
					break
				}
				dir = parent
			}
		}
	}

	// 2. Fall back to main ~/.know-me/config.json
	home := os.Getenv("HOME")
	if home == "" {
		home, _ = os.UserHomeDir()
	}
	if home != "" {
		globalPath := filepath.Join(home, ".know-me", "config.json")
		if data, err := os.ReadFile(globalPath); err == nil {
			var project models.Project
			if json.Unmarshal(data, &project) == nil {
				if u := strings.TrimSpace(project.Settings.ServerURL); u != "" {
					return u, globalPath
				}
			}
		}
	}

	return "", ""
}
// buildURL joins the configured base (which may carry a sub-path) with an
// /api/* path and query values.
func (c *RemoteClient) buildURL(path string, query url.Values) string {
	base := strings.TrimRight(c.BaseURL, "/")
	if !strings.HasPrefix(path, "/") {
		path = "/" + path
	}
	u := base + path
	if len(query) > 0 {
		u += "?" + query.Encode()
	}
	return u
}

func (c *RemoteClient) newRequest(method, path string, query url.Values, body any) (*http.Request, error) {
	var reader io.Reader
	if body != nil {
		data, err := json.Marshal(body)
		if err != nil {
			return nil, fmt.Errorf("encode remote request body: %w", err)
		}
		reader = bytes.NewReader(data)
	}
	req, err := http.NewRequest(method, c.buildURL(path, query), reader)
	if err != nil {
		return nil, fmt.Errorf("remote request creation failed: %w", err)
	}
	req.Header.Set("Accept", "application/json")
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	// Token travels in the Authorization header only, never in logs or URLs.
	if c.Token != "" {
		req.Header.Set("Authorization", "Bearer "+c.Token)
	}
	return req, nil
}

// RemoteError is a non-2xx response from the Know-Me server.
type RemoteError struct {
	Status  int
	Message string
}

func (e *RemoteError) Error() string {
	if e.Message != "" {
		return fmt.Sprintf("remote server returned %d: %s", e.Status, e.Message)
	}
	return fmt.Sprintf("remote server returned %d", e.Status)
}

// DoJSON performs one request without retries (retries are only safe for
// idempotent reads and are handled by callers). Non-2xx responses become
// *RemoteError with actionable, token-free messages.
func (c *RemoteClient) DoJSON(method, path string, query url.Values, body any, out any) error {
	req, err := c.newRequest(method, path, query, body)
	if err != nil {
		return err
	}
	resp, err := c.HTTP.Do(req)
	if err != nil {
		return fmt.Errorf("remote server at %s unreachable: %w", c.BaseURL, err)
	}
	defer resp.Body.Close()
	data, err := io.ReadAll(io.LimitReader(resp.Body, 8<<20))
	if err != nil {
		return fmt.Errorf("read remote response: %w", err)
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		msg := remoteErrorMessage(data)
		switch resp.StatusCode {
		case http.StatusUnauthorized, http.StatusForbidden:
			return &RemoteError{Status: resp.StatusCode, Message: "unauthorized: check KNOWME_TOKEN" + appendDetail(msg)}
		case http.StatusNotFound:
			return &RemoteError{Status: resp.StatusCode, Message: "not found: " + strings.TrimSpace(msg)}
		default:
			return &RemoteError{Status: resp.StatusCode, Message: strings.TrimSpace(msg)}
		}
	}
	if out == nil {
		return nil
	}
	if len(bytes.TrimSpace(data)) == 0 {
		return nil
	}
	if err := json.Unmarshal(data, out); err != nil {
		return fmt.Errorf("decode remote response: %w", err)
	}
	return nil
}

// GetJSON is DoJSON for GET requests.
func (c *RemoteClient) GetJSON(path string, query url.Values, out any) error {
	return c.DoJSON(http.MethodGet, path, query, nil, out)
}

func appendDetail(msg string) string {
	if strings.TrimSpace(msg) == "" {
		return ""
	}
	return ": " + strings.TrimSpace(msg)
}

// remoteErrorMessage extracts a human message from common server error shapes
// ({"error": ...} or {"error": {"message": ...}}) without ever surfacing auth
// material.
func remoteErrorMessage(data []byte) string {
	if len(bytes.TrimSpace(data)) == 0 {
		return ""
	}
	var shaped struct {
		Error any `json:"error"`
	}
	if err := json.Unmarshal(data, &shaped); err != nil {
		return truncateForError(string(bytes.TrimSpace(data)))
	}
	switch e := shaped.Error.(type) {
	case nil:
		return truncateForError(string(bytes.TrimSpace(data)))
	case string:
		return truncateForError(e)
	case map[string]any:
		if m, ok := e["message"].(string); ok && strings.TrimSpace(m) != "" {
			return truncateForError(m)
		}
		raw, _ := json.Marshal(e)
		return truncateForError(string(raw))
	default:
		raw, _ := json.Marshal(e)
		return truncateForError(string(raw))
	}
}

func truncateForError(s string) string {
	s = strings.TrimSpace(s)
	const max = 300
	if len(s) > max {
		return s[:max] + "…"
	}
	return s
}
