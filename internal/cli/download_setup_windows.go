//go:build windows

package cli

// drainStdin is a no-op on Windows to keep cross-builds portable.
func drainStdin() {}
