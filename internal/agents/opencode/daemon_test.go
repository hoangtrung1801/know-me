package opencode

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestDefaultPIDFileScopesByHostAndPort(t *testing.T) {
	pidA := defaultPIDFile("127.0.0.1", 4096)
	pidB := defaultPIDFile("127.0.0.1", 54240)
	pidC := defaultPIDFile("localhost", 4096)

	if pidA == pidB {
		t.Fatal("defaultPIDFile should differ for different ports")
	}
	if pidA == pidC {
		t.Fatal("defaultPIDFile should differ for different hosts")
	}
	if !strings.HasSuffix(pidA, "opencode-127.0.0.1-4096.pid") {
		t.Fatalf("unexpected pid file path: %s", pidA)
	}
}

func TestDefaultPIDFileSanitizesHost(t *testing.T) {
	pidFile := defaultPIDFile("http://127.0.0.1", 4096)
	if strings.Contains(pidFile, "://") {
		t.Fatalf("defaultPIDFile should sanitize host, got %s", pidFile)
	}
	if !strings.HasSuffix(pidFile, "opencode-http_127.0.0.1-4096.pid") {
		t.Fatalf("unexpected sanitized pid file path: %s", pidFile)
	}
}

func TestDaemonPIDReadWrite(t *testing.T) {
	tmpDir := t.TempDir()
	pidFile := filepath.Join(tmpDir, "test.pid")

	d := NewDaemonWithPIDFile("127.0.0.1", 4096, pidFile)

	// Write PID
	if err := d.WritePID(12345); err != nil {
		t.Fatalf("WritePID failed: %v", err)
	}

	// Read PID back
	pid, err := d.ReadPID()
	if err != nil {
		t.Fatalf("ReadPID failed: %v", err)
	}
	if pid != 12345 {
		t.Fatalf("ReadPID = %d, want 12345", pid)
	}
}

func TestDaemonReadPIDMissingFile(t *testing.T) {
	tmpDir := t.TempDir()
	pidFile := filepath.Join(tmpDir, "nonexistent.pid")

	d := NewDaemonWithPIDFile("127.0.0.1", 4096, pidFile)

	_, err := d.ReadPID()
	if err == nil {
		t.Fatal("expected error for missing PID file")
	}
}

func TestDaemonWritePIDCreatesParentDirs(t *testing.T) {
	tmpDir := t.TempDir()
	pidFile := filepath.Join(tmpDir, "nested", "deep", "test.pid")

	d := NewDaemonWithPIDFile("127.0.0.1", 4096, pidFile)

	if err := d.WritePID(99999); err != nil {
		t.Fatalf("WritePID with nested dirs failed: %v", err)
	}

	// Verify file exists
	if _, err := os.Stat(pidFile); os.IsNotExist(err) {
		t.Fatal("PID file was not created")
	}

	pid, err := d.ReadPID()
	if err != nil {
		t.Fatalf("ReadPID failed: %v", err)
	}
	if pid != 99999 {
		t.Fatalf("ReadPID = %d, want 99999", pid)
	}
}

func TestDaemonCleanupStalePID(t *testing.T) {
	tmpDir := t.TempDir()
	pidFile := filepath.Join(tmpDir, "stale.pid")

	d := NewDaemonWithPIDFile("127.0.0.1", 4096, pidFile)

	// Write a PID that definitely doesn't exist (very high number)
	if err := d.WritePID(999999999); err != nil {
		t.Fatalf("WritePID failed: %v", err)
	}

	// Verify file exists before cleanup
	if _, err := os.Stat(pidFile); os.IsNotExist(err) {
		t.Fatal("PID file should exist before cleanup")
	}

	// cleanupStalePID should remove it since process 999999999 is dead
	d.cleanupStalePID()

	// Verify file is removed
	if _, err := os.Stat(pidFile); !os.IsNotExist(err) {
		t.Fatal("stale PID file should be removed after cleanup")
	}
}

func TestDaemonIsHealthyReturnsFalseWithNoPIDFile(t *testing.T) {
	tmpDir := t.TempDir()
	pidFile := filepath.Join(tmpDir, "nope.pid")

	d := NewDaemonWithPIDFile("127.0.0.1", 4096, pidFile)

	if d.isHealthy() {
		t.Fatal("isHealthy should return false when no PID file exists")
	}
}

func TestDaemonIsHealthyReturnsFalseWithDeadProcess(t *testing.T) {
	tmpDir := t.TempDir()
	pidFile := filepath.Join(tmpDir, "dead.pid")

	d := NewDaemonWithPIDFile("127.0.0.1", 4096, pidFile)
	d.WritePID(999999999) // non-existent process

	if d.isHealthy() {
		t.Fatal("isHealthy should return false when process is dead")
	}
}

func TestDaemonStartedByUsDefaultFalse(t *testing.T) {
	d := NewDaemonWithPIDFile("127.0.0.1", 4096, "/tmp/test.pid")
	if d.StartedByUs() {
		t.Fatal("StartedByUs should be false by default")
	}
}

func TestIsProcessAliveWithCurrentProcess(t *testing.T) {
	// Our own process should be alive
	if !isProcessAlive(os.Getpid()) {
		t.Fatal("isProcessAlive should return true for current process")
	}
}

func TestIsProcessAliveWithDeadProcess(t *testing.T) {
	if isProcessAlive(999999999) {
		t.Fatal("isProcessAlive should return false for non-existent PID")
	}
}
