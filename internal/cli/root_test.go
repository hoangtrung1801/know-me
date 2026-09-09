package cli

import (
	"strings"
	"testing"
)

func TestRootCommandUsesKnowmeName(t *testing.T) {
	if !strings.HasPrefix(rootCmd.Use, "knowme ") {
		t.Fatalf("root command use = %q, want knowme prefix", rootCmd.Use)
	}
}
