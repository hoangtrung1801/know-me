//go:build windows

package opencode

import (
	"os"
	"os/exec"
	"strconv"
	"strings"
	"syscall"
)

// setSysProcAttr creates the child process in a new process group so it
// survives the parent exiting on Windows.
func setSysProcAttr(cmd *exec.Cmd) {
	cmd.SysProcAttr = &syscall.SysProcAttr{
		CreationFlags: syscall.CREATE_NEW_PROCESS_GROUP,
	}
}

// signalTerm terminates the process on Windows (no SIGTERM equivalent).
func signalTerm(process *os.Process) error {
	return process.Kill()
}

// isProcessAlive checks if a process with the given PID exists and is running
// by querying the Windows tasklist.
func isProcessAlive(pid int) bool {
	cmd := exec.Command("tasklist", "/FI", "PID eq "+strconv.Itoa(pid), "/NH")
	out, err := cmd.Output()
	if err != nil {
		return false
	}
	return strings.Contains(string(out), strconv.Itoa(pid))
}
