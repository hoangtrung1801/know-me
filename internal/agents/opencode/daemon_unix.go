//go:build !windows

package opencode

import (
	"os"
	"os/exec"
	"syscall"
)

// setSysProcAttr detaches the child process into its own session so it
// survives the parent exiting.
func setSysProcAttr(cmd *exec.Cmd) {
	cmd.SysProcAttr = &syscall.SysProcAttr{Setsid: true}
}

// signalTerm sends SIGTERM to the process.
func signalTerm(process *os.Process) error {
	return process.Signal(syscall.SIGTERM)
}

// isProcessAlive checks if a process with the given PID exists and is running.
func isProcessAlive(pid int) bool {
	process, err := os.FindProcess(pid)
	if err != nil {
		return false
	}
	return process.Signal(syscall.Signal(0)) == nil
}
