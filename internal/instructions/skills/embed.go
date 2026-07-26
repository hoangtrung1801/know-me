package skills

import "embed"

// Files contains the built-in skill definitions bundled into the binary.
//
//go:embed kn-*
var Files embed.FS
