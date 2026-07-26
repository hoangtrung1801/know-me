package cli

import (
	"strings"
	"testing"

	"github.com/howznguyen/knowns/internal/models"
)

func TestRenderSmartDocSummary(t *testing.T) {
	doc := &models.Doc{
		Title:   "Test Doc",
		Content: "# Overview\n\n## Details",
	}

	got := renderSmartDocSummary(doc)

	wantParts := []string{
		"Document: Test Doc\n==================================================\n\n",
		"Size: 22 chars (~7 tokens)\n",
		"Headings: 2\n\n",
		"Table of Contents:\n--------------------------------------------------\n",
		"  1. Overview\n",
		"    2. Details\n",
		"\nDocument is large. Use --section <number> to read a specific section.\n",
	}

	for _, want := range wantParts {
		if !strings.Contains(got, want) {
			t.Fatalf("expected output to contain %q, got:\n%s", want, got)
		}
	}
}

func TestFormatWithCommas(t *testing.T) {
	if got := formatWithCommas(8529); got != "8,529" {
		t.Fatalf("expected comma-formatted number, got %q", got)
	}
}
