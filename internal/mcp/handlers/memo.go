package handlers

import (
	"context"

	"github.com/hoangtrung1801/know-me/internal/memos"
	"github.com/mark3labs/mcp-go/mcp"
)

func RegisterMemoTool(s toolRegistrar, service *memos.Service) {
	s.AddTool(mcp.NewTool(
		"memo",
		mcp.WithDescription("Global memo operations. Use action add, list, update, or delete."),
		mcp.WithString("action", mcp.Required(), mcp.Enum("add", "list", "update", "delete")),
		mcp.WithString("id", mcp.Description("Memo ID (update/delete)")),
		mcp.WithString("content", mcp.Description("Markdown content (add/update)")),
		mcp.WithString("query", mcp.Description("Case-insensitive content search (list)")),
	), func(_ context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		action, err := req.RequireString("action")
		if err != nil {
			return errResult("action is required")
		}
		switch action {
		case "add":
			return handleMemoAdd(service, req)
		case "list":
			return handleMemoList(service, req)
		case "update":
			return handleMemoUpdate(service, req)
		case "delete":
			return handleMemoDelete(service, req)
		default:
			return errResultf("unknown memo action: %s", action)
		}
	})
	s.RegisterHelp("memo.add", HelpEntry{When: "Create a global Markdown memo.", Params: map[string]string{"content": "required Markdown"}})
	s.RegisterHelp("memo.list", HelpEntry{When: "List or search global memos.", Params: map[string]string{"query": "optional content search"}})
	s.RegisterHelp("memo.update", HelpEntry{When: "Replace a memo's Markdown content.", Params: map[string]string{"id": "required memo ID", "content": "required Markdown"}})
	s.RegisterHelp("memo.delete", HelpEntry{When: "Permanently delete a global memo.", Params: map[string]string{"id": "required memo ID"}})
}

func handleMemoAdd(service *memos.Service, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	content, err := req.RequireString("content")
	if err != nil {
		return errResult("content is required")
	}
	memo, err := service.Add(content)
	if err != nil {
		return nil, err
	}
	return jsonResult(memo)
}

func handleMemoList(service *memos.Service, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	query, _ := stringArg(req.GetArguments(), "query")
	items, err := service.List(query)
	if err != nil {
		return nil, err
	}
	return jsonResult(items)
}

func handleMemoUpdate(service *memos.Service, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	id, err := req.RequireString("id")
	if err != nil {
		return errResult("id is required")
	}
	content, err := req.RequireString("content")
	if err != nil {
		return errResult("content is required")
	}
	memo, err := service.Update(id, content)
	if err != nil {
		return nil, err
	}
	return jsonResult(memo)
}

func handleMemoDelete(service *memos.Service, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	id, err := req.RequireString("id")
	if err != nil {
		return errResult("id is required")
	}
	if err := service.Delete(id); err != nil {
		return nil, err
	}
	return mcp.NewToolResultText("deleted"), nil
}
