package handlers

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"

	"github.com/howznguyen/knowns/internal/lsp"
	"github.com/howznguyen/knowns/internal/readiness"
	"github.com/howznguyen/knowns/internal/registry"
	"github.com/howznguyen/knowns/internal/storage"
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

- detect: Find Knowns projects in common or supplied directories. Required: none. Optional: additionalPaths. Returns: discovered project roots with names and status metadata.
- current: Show the currently active project. Required: none. Optional: none. Returns: active project name, root path, and store status.
- set: Switch the active project. Required: projectRoot. Optional: none. Returns: selected project metadata and readiness status.
- status: Inspect active project readiness. Required: none. Optional: none. Returns: project metadata, knowledge counts, search/model/index readiness, permissions, and capabilities.
`),
			mcp.WithString("action",
				mcp.Required(),
				mcp.Description("Action to perform"),
				mcp.Enum("detect", "current", "set", "status"),
			),
			mcp.WithString("projectRoot",
				mcp.Description("Absolute path to the project root directory (required for set)"),
			),
			mcp.WithArray("additionalPaths",
				mcp.Description("Additional directory paths to scan for projects (detect)"),
				mcp.WithStringItems(),
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

	registerHelp(s, "project.detect", HelpEntry{When: "Find Knowns projects in common locations or additional directories before switching context.", Params: map[string]string{"additionalPaths": "extra directory paths to scan"}})
	registerHelp(s, "project.current", HelpEntry{When: "Show active project root, name, and store state.", Params: map[string]string{}})
	registerHelp(s, "project.set", HelpEntry{When: "Switch active Knowns project for subsequent MCP operations.", Params: map[string]string{"projectRoot": "required — absolute project root path"}, Flow: "Detect projects first when unsure of path, then set target project."})
	registerHelp(s, "project.status", HelpEntry{When: "Inspect active project readiness, knowledge counts, permissions, capabilities, and search/index health.", Params: map[string]string{}, Flow: "Use at session start or when diagnosing project/index readiness."})
}

func handleProjectDetect(req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	args := req.GetArguments()

	home, _ := os.UserHomeDir()
	dirs := []string{
		filepath.Join(home, "Desktop"),
		filepath.Join(home, "Documents"),
		filepath.Join(home, "Workspaces"),
		filepath.Join(home, "workspace"),
		filepath.Join(home, "projects"),
		filepath.Join(home, "Projects"),
		filepath.Join(home, "dev"),
		filepath.Join(home, "Dev"),
		"/tmp",
	}

	if extra, ok := args["additionalPaths"]; ok {
		switch v := extra.(type) {
		case []any:
			for _, item := range v {
				if s, ok := item.(string); ok {
					dirs = append(dirs, s)
				}
			}
		case []string:
			dirs = append(dirs, v...)
		}
	}

	type projectInfo struct {
		ProjectRoot string `json:"projectRoot"`
		Name        string `json:"name,omitempty"`
	}

	seen := make(map[string]bool)
	var projects []projectInfo

	reg := registry.NewRegistry()
	if err := reg.Load(); err == nil {
		for _, project := range reg.Projects {
			for _, dir := range dirs {
				rel, relErr := filepath.Rel(dir, project.Path)
				if relErr != nil || rel == ".." || (len(rel) > 2 && rel[:3] == ".."+string(filepath.Separator)) {
					continue
				}
				if seen[project.Path] {
					break
				}
				seen[project.Path] = true
				projects = append(projects, projectInfo{ProjectRoot: project.Path, Name: project.Name})
				break
			}
		}
	}

	out, _ := json.MarshalIndent(projects, "", "  ")
	return mcp.NewToolResultText(string(out)), nil
}

func handleProjectCurrent(getStore func() *storage.Store, getRoot func() string) (*mcp.CallToolResult, error) {
	root := getRoot()
	store := getStore()

	if store == nil || root == "" {
		result := map[string]any{
			"projectRoot": nil,
			"valid":       false,
			"message":     ErrNoProject,
		}
		out, _ := json.MarshalIndent(result, "", "  ")
		return mcp.NewToolResultText(string(out)), nil
	}

	result := map[string]any{
		"projectRoot": root,
		"valid":       true,
	}

	if proj, err := store.Config.Load(); err == nil {
		result["projectName"] = proj.Name
	}

	out, _ := json.MarshalIndent(result, "", "  ")
	return mcp.NewToolResultText(string(out)), nil
}

func handleProjectSet(setStore func(*storage.Store, string), req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	projectRoot, err := req.RequireString("projectRoot")
	if err != nil {
		return errResult(err.Error())
	}

	absRoot, err := filepath.Abs(projectRoot)
	if err != nil {
		return errResult(err.Error())
	}
	reg := registry.NewRegistry()
	if err := reg.Load(); err != nil {
		return errResult(err.Error())
	}
	project, err := reg.Add(absRoot)
	if err != nil {
		return errResult(err.Error())
	}
	store := storage.NewProjectStore(storage.GlobalRootPath(), project.ID, absRoot)

	proj, err := store.Config.Load()
	if err != nil {
		return errResultf(ErrLoadConfig, err.Error())
	}

	setStore(store, projectRoot)

	result := map[string]any{
		"success":     true,
		"projectRoot": projectRoot,
		"projectName": proj.Name,
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
