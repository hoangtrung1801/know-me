package models

import (
	"fmt"
	"math/rand/v2"
	"regexp"
	"strings"
)

const (
	// base36Chars is the alphabet used by the 6-character task ID.
	base36Chars = "0123456789abcdefghijklmnopqrstuvwxyz"

	// base36Max is 36^6 = 2 176 782 336 – the exclusive upper bound for a
	// 6-character base-36 value.
	base36Max = 36 * 36 * 36 * 36 * 36 * 36 // 2_176_782_336
)

// NewTaskID generates a random 6-character base-36 task ID.
//
// The algorithm mirrors the TypeScript implementation:
//
//	value = random(0, 36^6)
//	id    = value.toString(36).padStart(6, "0")
func NewTaskID() string {
	value := rand.N(uint64(base36Max)) //nolint:gosec – IDs are not security tokens
	return encodeBase36(int(value), 6)
}

// encodeBase36 encodes n in base-36 and left-pads the result with '0' to the
// requested minimum width.
func encodeBase36(n, width int) string {
	if n == 0 {
		return strings.Repeat("0", width)
	}

	buf := make([]byte, 0, width)
	for n > 0 {
		buf = append(buf, base36Chars[n%36])
		n /= 36
	}

	// Reverse
	for i, j := 0, len(buf)-1; i < j; i, j = i+1, j-1 {
		buf[i], buf[j] = buf[j], buf[i]
	}

	s := string(buf)
	if len(s) < width {
		s = strings.Repeat("0", width-len(s)) + s
	}
	return s
}

// nonAlphanumRE matches characters that are not letters, digits, or hyphens.
var nonAlphanumRE = regexp.MustCompile(`[^a-zA-Z0-9\s\-]`)

// multiSpaceRE matches one or more consecutive whitespace characters.
var multiSpaceRE = regexp.MustCompile(`\s+`)

// SanitizeTitle strips characters that are unsafe in file names from title,
// then collapses whitespace runs to a single hyphen. The result is safe to
// embed in a path component.
//
// Example:
//
//	SanitizeTitle("Fix bug: auth/login")  →  "Fix-bug-authlogin"
func SanitizeTitle(title string) string {
	clean := nonAlphanumRE.ReplaceAllString(title, "")
	clean = multiSpaceRE.ReplaceAllString(clean, "-")
	return clean
}

// TaskFileName returns the canonical file name for a task.
//
// Format: "task-{id} - {sanitized-title}.md"
//
// Example:
//
//	TaskFileName("abc123", "Fix login bug")  →  "task-abc123 - Fix-login-bug.md"
func TaskFileName(id, title string) string {
	return fmt.Sprintf("task-%s - %s.md", id, SanitizeTitle(title))
}
