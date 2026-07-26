package opencode

import (
	"fmt"
	"io"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"time"
)

// Daemon manages a shared OpenCode server process that persists across
// Knowns server restarts. Only one daemon runs at a time, identified by
// a PID file under ~/.knowns scoped to the target host/port.
type Daemon struct {
	Host    string
	Port    int
	PIDFile string
	// startedByUs tracks whether this Daemon instance spawned the process
	// (as opposed to finding an already-running one). Used to decide
	// whether cleanup should kill the process.
	startedByUs bool
}

var pidFileSegmentSanitizer = regexp.MustCompile(`[^A-Za-z0-9._-]+`)

func defaultPIDFile(host string, port int) string {
	home, _ := os.UserHomeDir()
	safeHost := pidFileSegmentSanitizer.ReplaceAllString(host, "_")
	if safeHost == "" {
		safeHost = "127.0.0.1"
	}
	return filepath.Join(home, ".knowns", fmt.Sprintf("opencode-%s-%d.pid", safeHost, port))
}

// NewDaemon creates a Daemon targeting the given host:port.
// The PID file defaults to ~/.knowns/opencode-<host>-<port>.pid.
func NewDaemon(host string, port int) *Daemon {
	return &Daemon{
		Host:    host,
		Port:    port,
		PIDFile: defaultPIDFile(host, port),
	}
}

// NewDaemonWithPIDFile creates a Daemon with a custom PID file path (for testing).
func NewDaemonWithPIDFile(host string, port int, pidFile string) *Daemon {
	return &Daemon{
		Host:    host,
		Port:    port,
		PIDFile: pidFile,
	}
}

// StartedByUs reports whether this Daemon instance spawned the process.
func (d *Daemon) StartedByUs() bool {
	return d.startedByUs
}

// EnsureRunning checks if the daemon is alive and healthy. If not, it
// cleans up any stale PID file and starts a fresh process.
func (d *Daemon) EnsureRunning() error {
	// 1. Check if opencode CLI is available at all.
	if _, err := exec.LookPath("opencode"); err != nil {
		return fmt.Errorf("opencode CLI not found: %w", err)
	}

	// 2. Try to reuse an existing daemon.
	if d.isHealthy() {
		log.Printf("[daemon] OpenCode daemon already running on %s:%d", d.Host, d.Port)
		return nil
	}

	// 3. Stale or dead — clean up and start fresh.
	d.cleanupStalePID()
	return d.start()
}

// Stop sends SIGTERM to the daemon (if we started it) and removes the PID file.
func (d *Daemon) Stop() error {
	pid, err := d.ReadPID()
	if err != nil {
		return nil // no PID file — nothing to stop
	}

	process, err := os.FindProcess(pid)
	if err != nil {
		os.Remove(d.PIDFile)
		return nil
	}

	log.Printf("[daemon] Stopping OpenCode daemon (pid %d)", pid)
	if err := signalTerm(process); err != nil {
		// Process may already be dead — that's fine.
		log.Printf("[daemon] Signal failed (process may be dead): %v", err)
	}

	// Wait briefly for process to exit.
	done := make(chan struct{})
	go func() {
		process.Wait()
		close(done)
	}()
	select {
	case <-done:
	case <-time.After(3 * time.Second):
		// Force kill if SIGTERM didn't work.
		process.Kill()
		process.Wait()
	}

	os.Remove(d.PIDFile)
	log.Printf("[daemon] OpenCode daemon stopped")
	return nil
}

// isHealthy checks: PID file exists → process alive → HTTP reachable.
func (d *Daemon) isHealthy() bool {
	pid, err := d.ReadPID()
	if err != nil {
		return false
	}

	if !isProcessAlive(pid) {
		return false
	}

	client := NewClient(Config{Host: d.Host, Port: d.Port})
	return client.IsServerAvailable()
}

// cleanupStalePID removes the PID file if the referenced process is dead.
func (d *Daemon) cleanupStalePID() {
	pid, err := d.ReadPID()
	if err != nil {
		return
	}
	if !isProcessAlive(pid) {
		log.Printf("[daemon] Removing stale PID file (pid %d is dead)", pid)
		os.Remove(d.PIDFile)
	}
}

// start spawns a new opencode serve process, detached from the parent.
func (d *Daemon) start() error {
	args := []string{"serve",
		"--hostname", d.Host,
		"--port", strconv.Itoa(d.Port),
		"--cors", "*",
	}
	cmd := exec.Command("opencode", args...)
	cmd.Stdout = io.Discard
	cmd.Stderr = io.Discard
	cmd.Stdin = strings.NewReader("")

	// Detach: new session so the daemon survives parent exit.
	setSysProcAttr(cmd)

	if err := cmd.Start(); err != nil {
		return fmt.Errorf("failed to start opencode daemon on port %d: %w", d.Port, err)
	}

	if err := d.WritePID(cmd.Process.Pid); err != nil {
		// Non-fatal: daemon is running but PID file failed.
		log.Printf("[daemon] Warning: could not write PID file: %v", err)
	}

	d.startedByUs = true
	log.Printf("[daemon] Spawned OpenCode daemon (pid %d) on %s:%d", cmd.Process.Pid, d.Host, d.Port)

	// Wait for daemon to become healthy via polling.
	if err := d.waitForHealthy(15*time.Second, 500*time.Millisecond); err != nil {
		return fmt.Errorf("daemon started but not healthy: %w", err)
	}
	return nil
}

// waitForHealthy polls the daemon health endpoint until it responds or timeout.
func (d *Daemon) waitForHealthy(timeout, interval time.Duration) error {
	client := NewClient(Config{Host: d.Host, Port: d.Port})
	deadline := time.After(timeout)
	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	for {
		select {
		case <-deadline:
			return fmt.Errorf("timed out after %s waiting for daemon on %s:%d", timeout, d.Host, d.Port)
		case <-ticker.C:
			if client.IsServerAvailable() {
				log.Printf("[daemon] Daemon healthy on %s:%d", d.Host, d.Port)
				return nil
			}
		}
	}
}

// ReadPID reads the daemon PID from the PID file.
func (d *Daemon) ReadPID() (int, error) {
	data, err := os.ReadFile(d.PIDFile)
	if err != nil {
		return 0, err
	}
	return strconv.Atoi(strings.TrimSpace(string(data)))
}

// WritePID writes the given PID to the PID file, creating parent dirs if needed.
func (d *Daemon) WritePID(pid int) error {
	if err := os.MkdirAll(filepath.Dir(d.PIDFile), 0755); err != nil {
		return err
	}
	return os.WriteFile(d.PIDFile, []byte(strconv.Itoa(pid)), 0644)
}
