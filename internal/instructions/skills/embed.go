package skills

import "embed"

// Files contains the built-in skill definitions bundled into the binary.
//
//go:embed kn-* known-me
var Files embed.FS
