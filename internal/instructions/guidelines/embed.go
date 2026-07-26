package guidelines

import "embed"

// Files contains the built-in guideline templates bundled into the binary.
//
//go:embed unified/*.md
var Files embed.FS
