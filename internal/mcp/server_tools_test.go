package mcp

import (
	"context"
	"strings"
	"testing"

	gomcp "github.com/mark3labs/mcp-go/mcp"
)

func TestMCPServerToolsListAndInitialScrubbed(t *testing.T) {
	s := NewMCPServer("")
	tools := s.srv.ListTools()

	forbiddenTools := []string{"code", "decision", "memory"}
	for name := range tools {
		for _, forbidden := range forbiddenTools {
			if name == forbidden {
				t.Fatalf("found forbidden tool %q in MCP server tools list", forbidden)
			}
		}
	}

	initialTool := s.srv.GetTool("initial")
	if initialTool == nil {
		t.Fatal("expected 'initial' tool to be registered")
	}

	result, err := initialTool.Handler(context.Background(), gomcp.CallToolRequest{
		Params: gomcp.CallToolParams{
			Name: "initial",
		},
	})
	if err != nil {
		t.Fatalf("call initial: %v", err)
	}
	if result == nil || len(result.Content) == 0 {
		t.Fatal("empty result from initial tool")
	}

	textContent, ok := result.Content[0].(gomcp.TextContent)
	if !ok {
		t.Fatalf("expected text content, got %T", result.Content[0])
	}
	output := textContent.Text

	forbiddenOutputTerms := []string{
		"Code index",
		"memories:",
		"decisions:",
		"LSP",
		"Semantic runtime",
	}
	for _, term := range forbiddenOutputTerms {
		if strings.Contains(output, term) {
			t.Fatalf("initial output contains forbidden term %q:\n%s", term, output)
		}
	}
}
