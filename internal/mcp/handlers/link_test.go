package handlers

import (
	"context"
	"encoding/json"
	"testing"

	"github.com/hoangtrung1801/known-me/internal/links"
	"github.com/hoangtrung1801/known-me/internal/models"
	"github.com/mark3labs/mcp-go/mcp"
)

func TestLinkHandlersLifecycle(t *testing.T) {
	service := links.NewServiceWithFetcher(t.TempDir(), func(context.Context, string) (links.Metadata, error) {
		return links.Metadata{Title: "MCP title", Description: "MCP description"}, nil
	})
	result, err := handleLinkAdd(context.Background(), service, mcp.CallToolRequest{Params: mcp.CallToolParams{Arguments: map[string]any{"url": "https://example.com", "note": "Important article"}}})
	if err != nil {
		t.Fatal(err)
	}
	var link models.Link
	if err := json.Unmarshal([]byte(result.Content[0].(mcp.TextContent).Text), &link); err != nil {
		t.Fatal(err)
	}
	if link.Title != "MCP title" {
		t.Fatalf("title = %q", link.Title)
	}
	if link.Note != "Important article" {
		t.Fatalf("note = %q", link.Note)
	}
	updatedResult, err := handleLinkUpdate(context.Background(), service, mcp.CallToolRequest{Params: mcp.CallToolParams{Arguments: map[string]any{"id": link.ID, "note": "Updated note"}}})
	if err != nil {
		t.Fatal(err)
	}
	var updated models.Link
	if err := json.Unmarshal([]byte(updatedResult.Content[0].(mcp.TextContent).Text), &updated); err != nil {
		t.Fatal(err)
	}
	if updated.Note != "Updated note" {
		t.Fatalf("updated note = %q", updated.Note)
	}
}
