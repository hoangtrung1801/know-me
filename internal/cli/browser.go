package cli

import (
	"context"
	"errors"
	"fmt"
	"net"
	"net/http"
	"os"
	"os/exec"
	"runtime"
	"strings"
	"syscall"
	"time"

	"github.com/spf13/cobra"

	"github.com/hoangtrung1801/known-me/internal/server"
	"github.com/hoangtrung1801/known-me/internal/storage"
	"github.com/hoangtrung1801/known-me/internal/util"
)

var browserCmd = &cobra.Command{
	Use:   "browser",
	Short: "Launch the Know-Me web UI",
	Long:  "Start the Know-Me HTTP server and optionally open it in a browser.\nCan be launched outside a repo to use the workspace picker.",
	RunE:  runBrowser,
}

// resolveProject returns the store selected by the current workspace link or
// the registry's active project.
func resolveProject(_ *cobra.Command) (store *storage.Store, projectRoot string, err error) {
	store, err = getStoreErr()
	if err != nil {
		return nil, "", err
	}
	return store, store.RepositoryRoot(), nil
}

const defaultBrowserPort = 6420
const maxBrowserPortAttempts = 10

func runBrowser(cmd *cobra.Command, args []string) error {
	host, _ := cmd.Flags().GetString("host")
	port, _ := cmd.Flags().GetInt("port")
	openFlag, _ := cmd.Flags().GetBool("open")
	noOpen, _ := cmd.Flags().GetBool("no-open")
	restart, _ := cmd.Flags().GetBool("restart")
	dev, _ := cmd.Flags().GetBool("dev")
	watchFlag, _ := cmd.Flags().GetBool("watch")
	tunnelFlag, _ := cmd.Flags().GetBool("tunnel")
	passwordFlag, _ := cmd.Flags().GetString("password")
	allowTaskHardDelete, _ := cmd.Flags().GetBool("allow-task-hard-delete")

	store, projectRoot, err := resolveProject(cmd)
	if err != nil {
		return err
	}

	if port == 0 {
		port = defaultBrowserPort
	}

	// Handle restart: attempt to stop existing server first
	if restart {
		fmt.Printf("%s Attempting to stop existing server on port %d...\n", StyleWarning.Render("↻"), port)
		stopExistingServer(host, port)
	}

	listener, selectedPort, err := bindBrowserPort(host, port, maxBrowserPortAttempts)
	if err != nil {
		return err
	}
	if selectedPort != port {
		fmt.Printf("  %s  Port %d is busy, using %d instead\n", StyleWarning.Render("↷"), port, selectedPort)
	}
	port = selectedPort

	// Determine whether to open browser: --open enables, --no-open disables
	shouldOpen := openFlag && !noOpen

	srv := server.NewServer(store, projectRoot, port, server.Options{Dev: dev, Tunnel: tunnelFlag, Password: passwordFlag, AllowTaskHardDelete: allowTaskHardDelete, DisableLSP: true, DisableOpenCode: true})

	url := "http://" + net.JoinHostPort(host, fmt.Sprint(port))
	fmt.Println()
	fmt.Printf("  %s  %s %s\n", StyleSuccess.Render("●"), StyleBold.Render("Know-Me"), StyleDim.Render("v"+util.Version))
	fmt.Println()
	fmt.Printf("  %s  %s\n", StyleInfo.Render("→"), StyleBold.Render(url))
	fmt.Printf("  %s  %s\n", StyleInfo.Render("◇"), StyleDim.Render("global knowledge store"))
	fmt.Println()

	if passwordFlag != "" {
		fmt.Printf("  %s  %s\n", StyleSuccess.Render("🔒"), "Password protection active")
	}

	// Start file watcher if --watch is enabled
	if watchFlag && store != nil && projectRoot != "" {
		ctx, cancelWatcher := context.WithCancel(context.Background())
		defer cancelWatcher()
		go func() {
			if err := StartCodeWatcher(ctx, store, projectRoot, 1500); err != nil {
				fmt.Fprintf(os.Stderr, "watcher error: %v\n", err)
			}
		}()
		fmt.Printf("  %s  %s\n", StyleInfo.Render("◎"), StyleDim.Render("file watcher enabled"))
	}

	errCh := make(chan error, 1)
	go func() {
		errCh <- srv.StartWithListener(listener)
	}()

	if shouldOpen {
		if err := waitForHTTPServer(host, port, 3*time.Second); err != nil {
			return <-errCh
		}
		openBrowser(url)
	}

	return <-errCh
}

func bindBrowserPort(host string, startPort int, attempts int) (net.Listener, int, error) {
	for offset := 0; offset < attempts; offset++ {
		port := startPort + offset
		address := net.JoinHostPort(host, fmt.Sprint(port))
		// First check if anything is already listening (catches IPv4/IPv6 conflicts)
		conn, err := net.DialTimeout("tcp", address, 200*time.Millisecond)
		if err == nil {
			conn.Close()
			continue // port in use by another process
		}
		listener, err := net.Listen("tcp", address)
		if err == nil {
			return listener, port, nil
		}
		if !isAddrInUse(err) {
			return nil, 0, fmt.Errorf("check port %d: %w", port, err)
		}
	}
	return nil, 0, fmt.Errorf("no available port in range %d-%d", startPort, startPort+attempts-1)
}

func waitForHTTPServer(host string, port int, timeout time.Duration) error {
	address := net.JoinHostPort(host, fmt.Sprint(port))
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		conn, err := net.DialTimeout("tcp", address, 200*time.Millisecond)
		if err == nil {
			_ = conn.Close()
			return nil
		}
		time.Sleep(100 * time.Millisecond)
	}
	return fmt.Errorf("server on %s did not become ready in time", address)
}

func isAddrInUse(err error) bool {
	if errors.Is(err, syscall.EADDRINUSE) {
		return true
	}
	msg := strings.ToLower(err.Error())
	if strings.Contains(msg, "address already in use") || strings.Contains(msg, "only one usage of each socket address") {
		return true
	}

	var opErr *net.OpError
	if !errors.As(err, &opErr) {
		return false
	}
	if errors.Is(opErr.Err, syscall.EADDRINUSE) {
		return true
	}
	var sysErr *os.SyscallError
	if !errors.As(opErr.Err, &sysErr) {
		return false
	}
	return errors.Is(sysErr.Err, syscall.EADDRINUSE)
}

// stopExistingServer sends a shutdown request to any existing server on the
// given port and waits for the port to be released. Returns true if the port
// was freed, false if no server was found or the stop timed out.
func stopExistingServer(host string, port int) bool {
	address := net.JoinHostPort(host, fmt.Sprint(port))
	client := &http.Client{Timeout: 2 * time.Second}
	resp, err := client.Post(
		"http://"+address+"/api/shutdown",
		"application/json", nil,
	)
	if err != nil {
		fmt.Println(StyleDim.Render("No existing server found."))
		return false
	}
	resp.Body.Close()

	fmt.Println(StyleWarning.Render("Existing server detected.") + " Waiting for shutdown...")

	// Poll until the port is released (max ~3s).
	for i := 0; i < 10; i++ {
		conn, dialErr := net.DialTimeout("tcp",
			address, 200*time.Millisecond)
		if dialErr != nil {
			fmt.Println(StyleSuccess.Render("Previous server stopped."))
			return true // Port released
		}
		conn.Close()
		time.Sleep(300 * time.Millisecond)
	}

	fmt.Println(StyleWarning.Render("Timed out waiting for previous server to stop."))
	return false
}

func openBrowser(url string) {
	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "darwin":
		cmd = exec.Command("open", url)
	case "linux":
		cmd = exec.Command("xdg-open", url)
	case "windows":
		cmd = exec.Command("cmd", "/c", "start", url)
	}
	if cmd != nil {
		cmd.Start()
	}
}

func init() {
	browserCmd.Flags().String("host", "127.0.0.1", "HTTP server host")
	browserCmd.Flags().Int("port", 0, "HTTP server port (default: 6420; tries next ports if busy)")
	browserCmd.Flags().Bool("open", false, "Open browser after starting")
	browserCmd.Flags().Bool("no-open", false, "Don't automatically open browser")
	browserCmd.Flags().Bool("restart", false, "Restart server if already running")
	browserCmd.Flags().Bool("dev", false, "Enable development mode (verbose logging)")
	browserCmd.Flags().Bool("watch", false, "Enable file watcher for auto-indexing on code changes")
	browserCmd.Flags().Bool("tunnel", false, "Expose via a Cloudflare Quick Tunnel (requires cloudflared)")
	browserCmd.Flags().String("password", "", "Protect WebUI with a password (in-memory only)")
	browserCmd.Flags().Bool("allow-task-hard-delete", false, "Grant this server instance Task hard-delete capability")

	rootCmd.AddCommand(browserCmd)
}
