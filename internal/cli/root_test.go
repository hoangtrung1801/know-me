package cli

import (
	"strings"
	"testing"
)

func TestRootCommandUsesKnowmeName(t *testing.T) {
	if !strings.HasPrefix(rootCmd.Use, "knownme ") {
		t.Fatalf("root command use = %q, want knownme prefix", rootCmd.Use)
	}
}
