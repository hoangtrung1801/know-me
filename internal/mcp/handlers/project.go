package handlers

import (
	"context"
	"encoding/json"

	"github.com/hoangtrung1801/known-me/internal/lsp"
	"github.com/hoangtrung1801/known-me/internal/readiness"
	"github.com/hoangtrung1801/known-me/internal/registry"
	"github.com/hoangtrung1801/known-me/internal/storage"
	"github.com/mark3labs/mcp-go/mcp"
)

// RegisterProjectTool registers the consolidated project management MCP tool.
func RegisterProjectTool(
	s toolRegistrar,
	getStore func() *storage.Store,
	setStore func(*storage.Store, string),
	getRoot func() string,
	getLSPManager ...func() *lsp.Manager,
) {
	RegisterProjectToolWithStatusProvider(s, getStore, setStore, getRoot, nil, getLSPManager...)
}

func RegisterProjectToolWithStatusProvider(
	s toolRegistrar,
	getStore func() *storage.Store,
	setStore func(*storage.Store, string),
	getRoot func() string,
	getLSPStatuses func(context.Context) []lsp.LanguageRuntimeStatus,
	getLSPManager ...func() *lsp.Manager,
) {
	s.AddTool(
		mcp.NewTool("project",
			mcp.WithDescription(`Project management operations. Use 'action' to specify: detect, current, set, status.

- detect: List logical project records. Required: none.
- current: Show the selected logical project. Required: none.
- set: Select a logical project. Required: projectId.
- status: Inspect active project readiness. Required: none. Optional: none. Returns: project metadata, knowledge counts, search/model/index readiness, permissions, and capabilities.
`),
			mcp.WithString("action",
				mcp.Required(),
				mcp.Description("Action to perform"),
				mcp.Enum("detect", "current", "set", "status"),
			),
			mcp.WithString("projectId",
				mcp.Description("Logical project ID (required for set)"),
			),
		),
		func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
			action, err := req.RequireString("action")
			if err != nil {
				return errResult("action is required")
			}
			switch action {
			case "detect":
				return handleProjectDetect(req)
			case "current":
				return handleProjectCurrent(getStore, getRoot)
			case "set":
				return handleProjectSet(setStore, req)
			case "status":
				var manager func() *lsp.Manager
				if len(getLSPManager) > 0 {
					manager = getLSPManager[0]
				}
				return handleProjectStatus(ctx, getStore, manager, getLSPStatuses)
			default:
				return errResultf("unknown project action: %s", action)
			}
		},
	)

	registerHelp(s, "project.detect", HelpEntry{When: "List logical projects before selecting context.", Params: map[string]string{}})
	registerHelp(s, "project.current", HelpEntry{When: "Show the selected logical project.", Params: map[string]string{}})
	registerHelp(s, "project.set", HelpEntry{When: "Select a logical project for subsequent MCP operations.", Params: map[string]string{"projectId": "required project record ID"}})
	registerHelp(s, "project.status", HelpEntry{When: "Inspect active project readiness, knowledge counts, permissions, capabilities, and search/index health.", Params: map[string]string{}, Flow: "Use at session start or when diagnosing project/index readiness."})
}

func handleProjectDetect(_ mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	reg := registry.NewRegistry()
	if err := reg.Load(); err != nil {
		return errResult(err.Error())
	}
	out, _ := json.MarshalIndent(reg.List(), "", "  ")
	return mcp.NewToolResultText(string(out)), nil
}

func handleProjectCurrent(_ func() *storage.Store, _ func() string) (*mcp.CallToolResult, error) {
	reg := registry.NewRegistry()
	if err := reg.Load(); err != nil {
		return errResult(err.Error())
	}
	result := map[string]any{"project": reg.GetActive(), "valid": true}
	out, _ := json.MarshalIndent(result, "", "  ")
	return mcp.NewToolResultText(string(out)), nil
}

func handleProjectSet(setStore func(*storage.Store, string), req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	projectID, err := req.RequireString("projectId")
	if err != nil {
		return errResult(err.Error())
	}

	reg := registry.NewRegistry()
	if err := reg.Load(); err != nil {
		return errResult(err.Error())
	}
	if err := reg.SetActive(projectID); err != nil {
		return errResult(err.Error())
	}
	setStore(storage.NewStore(storage.GlobalRootPath()), "")

	result := map[string]any{
		"success": true,
		"project": reg.GetActive(),
	}
	out, _ := json.MarshalIndent(result, "", "  ")
	return mcp.NewToolResultText(string(out)), nil
}

func handleProjectStatus(ctx context.Context, getStore func() *storage.Store, getLSPManager func() *lsp.Manager, getLSPStatuses ...func(context.Context) []lsp.LanguageRuntimeStatus) (*mcp.CallToolResult, error) {
	store := getStore()
	if store == nil {
		out, _ := json.MarshalIndent(readiness.InactivePayload(), "", "  ")
		return mcp.NewToolResultText(string(out)), nil
	}

	opts := readiness.Options{}
	if len(getLSPStatuses) > 0 && getLSPStatuses[0] != nil {
		opts.LSP = getLSPStatuses[0](ctx)
	}
	if getLSPManager != nil {
		if manager := getLSPManager(); manager != nil && len(opts.LSP) == 0 {
			opts.LSP = manager.RuntimeStatuses(ctx)
		}
	}
	payload := readiness.BuildReadiness(store, opts)
	out, _ := json.MarshalIndent(payload, "", "  ")
	return mcp.NewToolResultText(string(out)), nil
}
