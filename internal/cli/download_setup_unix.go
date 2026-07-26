//go:build !windows

package cli

import (
	"os"
	"syscall"
	"time"
)

// drainStdin reads and discards any pending bytes on stdin (non-blocking).
// This prevents stale terminal escape responses from leaking into the shell.
func drainStdin() {
	fd := int(os.Stdin.Fd())
	time.Sleep(50 * time.Millisecond)
	if err := syscall.SetNonblock(fd, true); err != nil {
		return
	}
	defer syscall.SetNonblock(fd, false)
	buf := make([]byte, 4096)
	for {
		n, err := syscall.Read(fd, buf)
		if n <= 0 || err != nil {
			break
		}
	}
}
