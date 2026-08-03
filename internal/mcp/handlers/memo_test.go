package handlers

import (
	"encoding/json"
	"testing"

	"github.com/hoangtrung1801/known-me/internal/memos"
	"github.com/hoangtrung1801/known-me/internal/models"
	"github.com/mark3labs/mcp-go/mcp"
)

func TestMemoHandlersLifecycle(t *testing.T) {
	service := memos.NewService(t.TempDir())
	added, err := handleMemoAdd(service, mcp.CallToolRequest{Params: mcp.CallToolParams{Arguments: map[string]any{"content": "# MCP memo"}}})
	if err != nil {
		t.Fatal(err)
	}
	var memo models.Memo
	if err := json.Unmarshal([]byte(added.Content[0].(mcp.TextContent).Text), &memo); err != nil {
		t.Fatal(err)
	}
	listed, err := handleMemoList(service, mcp.CallToolRequest{Params: mcp.CallToolParams{Arguments: map[string]any{"query": "mcp"}}})
	if err != nil {
		t.Fatal(err)
	}
	var found []*models.Memo
	if err := json.Unmarshal([]byte(listed.Content[0].(mcp.TextContent).Text), &found); err != nil {
		t.Fatal(err)
	}
	if len(found) != 1 || found[0].ID != memo.ID {
		t.Fatalf("found = %+v", found)
	}
	updated, err := handleMemoUpdate(service, mcp.CallToolRequest{Params: mcp.CallToolParams{Arguments: map[string]any{"id": memo.ID, "content": "Edited"}}})
	if err != nil {
		t.Fatal(err)
	}
	if !json.Valid([]byte(updated.Content[0].(mcp.TextContent).Text)) {
		t.Fatal("update result is not JSON")
	}
	if _, err := handleMemoDelete(service, mcp.CallToolRequest{Params: mcp.CallToolParams{Arguments: map[string]any{"id": memo.ID}}}); err != nil {
		t.Fatal(err)
	}
}
