package server

import (
	"net/http"
	"net/http/httptest"
	"reflect"
	"strconv"
	"strings"
	"testing"

	"github.com/hoangtrung1801/know-me/internal/agents/opencode"
	"github.com/hoangtrung1801/know-me/internal/models"
)


func TestDeriveOpenCodePortCandidates(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name        string
		browserPort int
		defaultPort int
		want        []int
	}{
		{
			name:        "derives browser based ports",
			browserPort: 6420,
			defaultPort: 4096,
			want:        []int{64200, 64201, 64202},
		},
		{
			name:        "falls back to default range when derived ports overflow",
			browserPort: 7000,
			defaultPort: 4096,
			want:        []int{4096, 4097, 4098},
		},
	}

	for _, tt := range tests {
		tt := tt
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			got := deriveOpenCodePortCandidates(tt.browserPort, tt.defaultPort)
			if !reflect.DeepEqual(got, tt.want) {
				t.Fatalf("deriveOpenCodePortCandidates(%d, %d) = %v, want %v", tt.browserPort, tt.defaultPort, got, tt.want)
			}
		})
	}
}

func TestResolveOpenCodeConfig(t *testing.T) {
	t.Parallel()

	t.Run("uses explicit configured port as-is", func(t *testing.T) {
		t.Parallel()

		resolution := resolveOpenCodeConfig(6420, &models.OpenCodeServerConfig{
			Host: "127.0.0.1",
			Port: 5001,
		})

		if !resolution.configured {
			t.Fatal("expected configuration to be enabled")
		}
		if !resolution.explicitPort {
			t.Fatal("expected explicitPort to be true")
		}
		if resolution.mode != opencode.RuntimeModeManaged {
			t.Fatalf("expected managed mode, got %q", resolution.mode)
		}
		if resolution.cfg.Port != 5001 {
			t.Fatalf("expected explicit port 5001, got %d", resolution.cfg.Port)
		}
	})

	t.Run("derives port from browser port when port is unset", func(t *testing.T) {
		t.Parallel()

		resolution := resolveOpenCodeConfig(6420, &models.OpenCodeServerConfig{
			Host: "127.0.0.1",
		})

		if !resolution.configured {
			t.Fatal("expected configuration to be enabled")
		}
		if resolution.explicitPort {
			t.Fatal("expected explicitPort to be false")
		}
		if resolution.mode != opencode.RuntimeModeManaged {
			t.Fatalf("expected managed mode, got %q", resolution.mode)
		}
		if resolution.cfg.Port != 64200 {
			t.Fatalf("expected derived port 64200, got %d", resolution.cfg.Port)
		}
	})

	t.Run("derives config even when opencodeServer is missing", func(t *testing.T) {
		t.Parallel()

		resolution := resolveOpenCodeConfig(6420, nil)

		if !resolution.configured {
			t.Fatal("expected configuration to be enabled")
		}
		if resolution.explicitPort {
			t.Fatal("expected explicitPort to be false")
		}
		if resolution.mode != opencode.RuntimeModeManaged {
			t.Fatalf("expected managed mode, got %q", resolution.mode)
		}
		if resolution.cfg.Host != "127.0.0.1" {
			t.Fatalf("expected default host 127.0.0.1, got %s", resolution.cfg.Host)
		}
		if resolution.cfg.Port != 64200 {
			t.Fatalf("expected derived port 64200, got %d", resolution.cfg.Port)
		}
	})

	t.Run("supports explicit external mode", func(t *testing.T) {
		t.Parallel()

		resolution := resolveOpenCodeConfig(6420, &models.OpenCodeServerConfig{
			Mode: "external",
			Host: "10.0.0.2",
			Port: 4096,
		})

		if resolution.mode != opencode.RuntimeModeExternal {
			t.Fatalf("expected external mode, got %q", resolution.mode)
		}
		if resolution.cfg.Host != "10.0.0.2" || resolution.cfg.Port != 4096 {
			t.Fatalf("unexpected config: %+v", resolution.cfg)
		}
	})
}

func TestGetOpenCodeStatusReturnsStructuredRuntimeStatus(t *testing.T) {
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

	cfg := opencode.DefaultConfig()
	serverURL := target.URL
	cfg.Host = serverURL[len("http://"):strings.LastIndex(serverURL, ":")]
	var err error
	cfg.Port, err = strconv.Atoi(serverURL[strings.LastIndex(serverURL, ":")+1:])
	if err != nil {
		t.Fatalf("parse port: %v", err)
	}

	s := &Server{
		runtimeOpenCode: &cfg,
		runtimeStatus: opencode.RuntimeStatus{
			Configured:   true,
			Mode:         opencode.RuntimeModeExternal,
			State:        opencode.RuntimeStateDegraded,
			Host:         cfg.Host,
			Port:         cfg.Port,
			CLIInstalled: false,
		},
	}

	rr := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/opencode/status", nil)
	s.getOpenCodeStatus(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", rr.Code, http.StatusOK)
	}
	body := rr.Body.String()
	for _, want := range []string{`"mode":"external"`, `"state":"ready"`, `"ready":true`, `"version":"1.5.0"`} {
		if !strings.Contains(body, want) {
			t.Fatalf("response missing %s: %s", want, body)
		}
	}
}

func TestProxyOpenCodeReturnsServiceUnavailableWhenRuntimeNotReady(t *testing.T) {
	t.Parallel()

	s := &Server{
		runtimeStatus: opencode.RuntimeStatus{
			Configured: true,
			Mode:       opencode.RuntimeModeManaged,
			State:      opencode.RuntimeStateDegraded,
			LastError:  "OpenCode runtime is not ready",
		},
	}

	req := httptest.NewRequest(http.MethodGet, "/api/opencode/session", nil)
	rr := httptest.NewRecorder()
	s.proxyOpenCode(rr, req)

	if rr.Code != http.StatusServiceUnavailable {
		t.Fatalf("status = %d, want %d", rr.Code, http.StatusServiceUnavailable)
	}
	if !strings.Contains(rr.Body.String(), "not ready") {
		t.Fatalf("unexpected body: %s", rr.Body.String())
	}
}

func TestProxyOpenCodeInjectsDirectoryHeaderWhenMissing(t *testing.T) {
	t.Parallel()

	var gotHeader string
	target := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotHeader = r.Header.Get("x-opencode-directory")
		w.WriteHeader(http.StatusOK)
	}))
	defer target.Close()

	cfg := opencode.DefaultConfig()
	serverURL := target.URL
	cfg.Host = serverURL[len("http://"):strings.LastIndex(serverURL, ":")]
	var err error
	cfg.Port, err = strconv.Atoi(serverURL[strings.LastIndex(serverURL, ":")+1:])
	if err != nil {
		t.Fatalf("parse port: %v", err)
	}

	s := &Server{
		projectRoot:     "/tmp/project-a",
		runtimeOpenCode: &cfg,
		opencodeProxy:   buildOpenCodeProxy(cfg),
		runtimeStatus: opencode.RuntimeStatus{
			Configured: true,
			Mode:       opencode.RuntimeModeManaged,
			State:      opencode.RuntimeStateReady,
			Ready:      true,
		},
	}

	req := httptest.NewRequest(http.MethodPost, "/api/opencode/session/abc/prompt_async", nil)
	rr := httptest.NewRecorder()

	s.proxyOpenCode(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", rr.Code, http.StatusOK)
	}
	if gotHeader != "/tmp/project-a" {
		t.Fatalf("x-opencode-directory = %q, want %q", gotHeader, "/tmp/project-a")
	}
}

func TestProxyOpenCodePreservesExistingDirectoryHeader(t *testing.T) {
	t.Parallel()

	var gotHeader string
	target := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotHeader = r.Header.Get("x-opencode-directory")
		w.WriteHeader(http.StatusOK)
	}))
	defer target.Close()

	cfg := opencode.DefaultConfig()
	serverURL := target.URL
	cfg.Host = serverURL[len("http://"):strings.LastIndex(serverURL, ":")]
	var err error
	cfg.Port, err = strconv.Atoi(serverURL[strings.LastIndex(serverURL, ":")+1:])
	if err != nil {
		t.Fatalf("parse port: %v", err)
	}

	s := &Server{
		projectRoot:     "/tmp/project-a",
		runtimeOpenCode: &cfg,
		opencodeProxy:   buildOpenCodeProxy(cfg),
		runtimeStatus: opencode.RuntimeStatus{
			Configured: true,
			Mode:       opencode.RuntimeModeManaged,
			State:      opencode.RuntimeStateReady,
			Ready:      true,
		},
	}

	req := httptest.NewRequest(http.MethodPost, "/api/opencode/session/abc/prompt_async", nil)
	req.Header.Set("x-opencode-directory", "/tmp/project-b")
	rr := httptest.NewRecorder()

	s.proxyOpenCode(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", rr.Code, http.StatusOK)
	}
	if gotHeader != "/tmp/project-b" {
		t.Fatalf("x-opencode-directory = %q, want %q", gotHeader, "/tmp/project-b")
	}
}

