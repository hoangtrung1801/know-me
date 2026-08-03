package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"os"

	"github.com/hoangtrung1801/known-me/internal/links"
	"github.com/mark3labs/mcp-go/mcp"
)

// RegisterLinkTool registers global saved-link operations.
func RegisterLinkTool(s toolRegistrar, service *links.Service) {
	s.AddTool(mcp.NewTool("link",
		mcp.WithDescription("Saved link operations. Use action add, list, or update."),
		mcp.WithString("action", mcp.Required(), mcp.Enum("add", "list", "update")),
		mcp.WithString("url", mcp.Description("URL to save (add)")),
		mcp.WithString("id", mcp.Description("Link ID (update)")),
		mcp.WithString("title", mcp.Description("Edited title (update)")),
		mcp.WithString("description", mcp.Description("Edited description (update)")),
		mcp.WithString("imagePath", mcp.Description("Local image path to import (add/update)")),
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		action, err := req.RequireString("action")
		if err != nil {
			return errResult("action is required")
		}
		switch action {
		case "add":
			return handleLinkAdd(ctx, service, req)
		case "list":
			return handleLinkList(service)
		case "update":
			return handleLinkUpdate(ctx, service, req)
		default:
			return errResultf("unknown link action: %s", action)
		}
	})
	s.RegisterHelp("link.add", HelpEntry{When: "Save a URL as a global link with fetched SEO metadata.", Params: map[string]string{"url": "required URL", "imagePath": "optional local image"}})
	s.RegisterHelp("link.list", HelpEntry{When: "List globally saved links."})
	s.RegisterHelp("link.update", HelpEntry{When: "Edit a saved link title, description, or local image.", Params: map[string]string{"id": "required link ID", "title": "optional title", "description": "optional description", "imagePath": "optional local image"}})
}

func handleLinkAdd(ctx context.Context, service *links.Service, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	urlValue, err := req.RequireString("url")
	if err != nil {
		return errResult("url is required")
	}
	image, closeImage, err := openLinkImage(req)
	if err != nil {
		return errResult(err.Error())
	}
	if closeImage != nil {
		defer closeImage()
	}
	link, err := service.Add(ctx, urlValue, image)
	if err != nil {
		return nil, fmt.Errorf("add link: %w", err)
	}
	return linkResult(link)
}

func handleLinkList(service *links.Service) (*mcp.CallToolResult, error) {
	items, err := service.List()
	if err != nil {
		return nil, fmt.Errorf("list links: %w", err)
	}
	return jsonResult(items)
}

func handleLinkUpdate(ctx context.Context, service *links.Service, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	id, err := req.RequireString("id")
	if err != nil {
		return errResult("id is required")
	}
	args := req.GetArguments()
	var title, description *string
	if value, ok := stringArg(args, "title"); ok {
		title = &value
	}
	if value, ok := stringArg(args, "description"); ok {
		description = &value
	}
	image, closeImage, err := openLinkImage(req)
	if err != nil {
		return errResult(err.Error())
	}
	if closeImage != nil {
		defer closeImage()
	}
	link, err := service.Update(ctx, id, title, description, image)
	if err != nil {
		return nil, fmt.Errorf("update link: %w", err)
	}
	return linkResult(link)
}

func openLinkImage(req mcp.CallToolRequest) (io.Reader, func(), error) {
	path, _ := stringArg(req.GetArguments(), "imagePath")
	if path == "" {
		return nil, nil, nil
	}
	f, err := os.Open(path)
	if err != nil {
		return nil, nil, err
	}
	return f, func() { _ = f.Close() }, nil
}

func linkResult(value any) (*mcp.CallToolResult, error) { return jsonResult(value) }

func jsonResult(value any) (*mcp.CallToolResult, error) {
	out, err := json.MarshalIndent(value, "", "  ")
	if err != nil {
		return nil, err
	}
	return mcp.NewToolResultText(string(out)), nil
}
