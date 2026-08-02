package handlers

import (
	"context"
	"encoding/json"
	"testing"

	"github.com/howznguyen/knowns/internal/links"
	"github.com/howznguyen/knowns/internal/models"
	"github.com/mark3labs/mcp-go/mcp"
)

func TestLinkHandlersLifecycle(t *testing.T) {
	service := links.NewServiceWithFetcher(t.TempDir(), func(context.Context, string) (links.Metadata, error) {
		return links.Metadata{Title: "MCP title", Description: "MCP description"}, nil
	})
	result, err := handleLinkAdd(context.Background(), service, mcp.CallToolRequest{Params: mcp.CallToolParams{Arguments: map[string]any{"url": "https://example.com"}}})
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
	title := "Edited"
	updated, err := service.Update(context.Background(), link.ID, &title, nil, nil)
	if err != nil {
		t.Fatal(err)
	}
	if updated.Title != "Edited" {
		t.Fatalf("updated title = %q", updated.Title)
	}
}
