package cli

import (
	"fmt"
	"net"
	"testing"
	"time"

	"github.com/hoangtrung1801/known-me/internal/storage"
	"github.com/spf13/cobra"
)

// newTestCmd creates a cobra command with browser flags for testing resolveProject.
func newTestCmd() *cobra.Command {
	return &cobra.Command{Use: "test"}
}

func TestResolveProjectUsesGlobalStore(t *testing.T) {
	t.Setenv("HOME", t.TempDir())
	cmd := newTestCmd()
	store, root := resolveProject(cmd)
	if store == nil || store.Root != storage.GlobalRootPath() || root != "" {
		t.Fatalf("store = %#v, root = %q", store, root)
	}
}

func TestBindBrowserPortReturnsRequestedPortWhenFree(t *testing.T) {
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("listen: %v", err)
	}
	port := listener.Addr().(*net.TCPAddr).Port
	listener.Close()

	ln, got, err := bindBrowserPort("127.0.0.1", port, 3)
	if err != nil {
		t.Fatalf("bindBrowserPort returned error: %v", err)
	}
	defer ln.Close()
	if got != port {
		t.Fatalf("bindBrowserPort(127.0.0.1, %d, 3) = %d, want %d", port, got, port)
	}
	if addr := ln.Addr().String(); addr != fmt.Sprintf("127.0.0.1:%d", port) {
		t.Fatalf("listener address = %q, want %q", addr, fmt.Sprintf("127.0.0.1:%d", port))
	}
}

func TestBindBrowserPortFallsForwardWhenBusy(t *testing.T) {
	first, err := net.Listen("tcp", "0.0.0.0:0")
	if err != nil {
		t.Fatalf("listen first: %v", err)
	}
	startPort := first.Addr().(*net.TCPAddr).Port
	defer first.Close()

	busyNext, err := net.Listen("tcp", fmt.Sprintf("0.0.0.0:%d", startPort+1))
	if err != nil {
		t.Skipf("could not reserve consecutive port %d: %v", startPort+1, err)
	}
	defer busyNext.Close()

	ln, got, err := bindBrowserPort("127.0.0.1", startPort, 50)
	if err != nil {
		t.Fatalf("bindBrowserPort returned error: %v", err)
	}
	ln.Close()
	if got <= startPort+1 {
		t.Fatalf("bindBrowserPort(%d, 50) = %d, want a port after %d", startPort, got, startPort+1)
	}
}

func TestWaitForHTTPServer(t *testing.T) {
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("listen: %v", err)
	}
	defer listener.Close()

	port := listener.Addr().(*net.TCPAddr).Port
	if err := waitForHTTPServer("127.0.0.1", port, time.Second); err != nil {
		t.Fatalf("waitForHTTPServer returned error: %v", err)
	}
}
