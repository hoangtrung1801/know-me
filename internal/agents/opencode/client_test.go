package opencode

import (
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"
)

func testClientConfig(t *testing.T, target *httptest.Server) Config {
	t.Helper()
	cfg := DefaultConfig()
	serverURL := target.URL
	cfg.Host = serverURL[len("http://"):strings.LastIndex(serverURL, ":")]
	port, err := strconv.Atoi(serverURL[strings.LastIndex(serverURL, ":")+1:])
	if err != nil {
		t.Fatalf("parse port: %v", err)
	}
	cfg.Port = port
	return cfg
}

func TestClientReadinessReady(t *testing.T) {
	t.Parallel()

	target := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/global/health":
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"healthy":true,"version":"1.5.0"}`))
		case "/config":
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"ok":true}`))
		case "/agent":
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`[]`))
		default:
			http.NotFound(w, r)
		}
	}))
	defer target.Close()

	readiness := NewClient(testClientConfig(t, target)).Readiness()
	if !readiness.Healthy || !readiness.ConfigOK || !readiness.AgentOK || !readiness.Ready {
		t.Fatalf("unexpected readiness: %+v", readiness)
	}
	if readiness.Version != "1.5.0" {
		t.Fatalf("version = %q, want 1.5.0", readiness.Version)
	}
}

func TestClientReadinessFailsWhenConfigProbeFails(t *testing.T) {
	t.Parallel()

	target := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/global/health":
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"healthy":true}`))
		case "/config":
			http.Error(w, "boom", http.StatusBadGateway)
		case "/agent":
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`[]`))
		default:
			http.NotFound(w, r)
		}
	}))
	defer target.Close()

	readiness := NewClient(testClientConfig(t, target)).Readiness()
	if !readiness.Healthy {
		t.Fatalf("expected health probe to pass: %+v", readiness)
	}
	if readiness.ConfigOK || readiness.AgentOK || readiness.Ready {
		t.Fatalf("unexpected readiness success: %+v", readiness)
	}
	if !strings.Contains(readiness.Error, "/config") {
		t.Fatalf("error = %q, want /config context", readiness.Error)
	}
}
