package handlers

import (
	"strings"
	"testing"

	"github.com/hoangtrung1801/know-me/internal/storage"
)

func TestBuildInitialInstructionsContainsExpectedSections(t *testing.T) {
	got := buildInitialInstructions(func() *storage.Store { return nil })

	expectedSections := []string{
		"# Know-Me MCP — Session Ready",
		"## Project State",
		"## Workflow",
		"## Tools",
		"tasks | docs | search",
	}
	for _, want := range expectedSections {
		if !strings.Contains(got, want) {
			t.Errorf("expected output to contain %q", want)
		}
	}

	forbiddenTerms := []string{
		"Code Intelligence Rules",
		"Knowledge Lifecycle",
		"Code index",
		"memories:",
		"decisions:",
		"LSP",
		"Semantic runtime",
	}
	for _, forbidden := range forbiddenTerms {
		if strings.Contains(got, forbidden) {
			t.Errorf("expected output NOT to contain %q", forbidden)
		}
	}
}

func TestBuildInitialInstructionsLineLimit(t *testing.T) {
	got := buildInitialInstructions(func() *storage.Store { return nil })
	lines := strings.Split(got, "\n")
	if len(lines) > 80 {
		t.Errorf("initial output has %d lines, expected ≤ 80", len(lines))
	}
}
