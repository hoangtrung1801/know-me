package handlers

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/howznguyen/knowns/internal/models"
	"github.com/howznguyen/knowns/internal/storage"
	"github.com/mark3labs/mcp-go/mcp"
)

// RegisterTemplateTool registers the consolidated template MCP tool.
func RegisterTemplateTool(s toolRegistrar, getStore func() *storage.Store) {
	s.AddTool(
		mcp.NewTool("templates",
			mcp.WithDescription(`Code generation template operations. Use 'action' to specify: create, get, list, run.

- create: Create a template definition. Required: name. Optional: description, doc. Returns: created template metadata.
- get: Read a template definition. Required: name. Optional: none. Returns: template metadata, prompts, actions, messages, and source path.
- list: List available templates. Required: none. Optional: none. Returns: template summaries with names, descriptions, versions, docs, and paths.
- run: Render and optionally write files from a template. Required: name. Optional: variables, dryRun (default true). Returns: generated file previews or write results with template messages.
`),
			mcp.WithString("action",
				mcp.Required(),
				mcp.Description("Action to perform"),
				mcp.Enum("create", "get", "list", "run"),
			),
			mcp.WithString("name",
				mcp.Description("Template name (required for create, get, run)"),
			),
			mcp.WithString("description",
				mcp.Description("Template description (create)"),
			),
			mcp.WithString("doc",
				mcp.Description("Link to documentation (create)"),
			),
			mcp.WithObject("variables",
				mcp.Description("Variables for the template (run)"),
			),
			mcp.WithBoolean("dryRun",
				mcp.Description("Preview only without writing files (default: true) (run)"),
			),
		),
		func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
			action, err := req.RequireString("action")
			if err != nil {
				return errResult("action is required")
			}
			switch action {
			case "create":
				return handleTemplateCreate(getStore, req)
			case "get":
				return handleTemplateGet(getStore, req)
			case "list":
				return handleTemplateList(getStore, req)
			case "run":
				return handleTemplateRun(getStore, req)
			default:
				return errResultf("unknown templates action: %s", action)
			}
		},
	)

	registerHelp(s, "templates.create", HelpEntry{When: "Create a reusable code generation template definition.", Params: map[string]string{"name": "required — template name", "description": "template summary", "doc": "linked documentation path"}})
	registerHelp(s, "templates.get", HelpEntry{When: "Read a template definition before running or modifying generation behavior.", Params: map[string]string{"name": "required — template name"}})
	registerHelp(s, "templates.list", HelpEntry{When: "List available templates before choosing generation boilerplate.", Params: map[string]string{}})
	registerHelp(s, "templates.run", HelpEntry{When: "Render a template with variables and optionally write generated files.", Params: map[string]string{"name": "required — template name", "variables": "template variables object", "dryRun": "preview only without writing files; default true"}, Why: "Use dryRun first to preview generated files before writing.", Examples: []string{`templates({ action: "run", name: "go-feature", variables: {"name": "label"}, dryRun: true })`}})
}

func handleTemplateList(getStore func() *storage.Store, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	store := getStore()
	if store == nil {
		return noProjectError()
	}

	templates, err := store.Templates.List()
	if err != nil {
		return errFailed("list templates", err)
	}

	if templates == nil {
		templates = []*models.Template{}
	}

	out, _ := json.MarshalIndent(templates, "", "  ")
	return mcp.NewToolResultText(string(out)), nil
}

func handleTemplateGet(getStore func() *storage.Store, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	store := getStore()
	if store == nil {
		return noProjectError()
	}

	name, err := req.RequireString("name")
	if err != nil {
		return errResult(err.Error())
	}

	tmpl, err := store.Templates.Get(name)
	if err != nil {
		return errNotFound("Template", err)
	}

	out, _ := json.MarshalIndent(tmpl, "", "  ")
	return mcp.NewToolResultText(string(out)), nil
}

func handleTemplateRun(getStore func() *storage.Store, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	store := getStore()
	if store == nil {
		return noProjectError()
	}

	name, err := req.RequireString("name")
	if err != nil {
		return errResult(err.Error())
	}

	args := req.GetArguments()

	dryRun := true
	if v, ok := args["dryRun"]; ok {
		if b, ok := v.(bool); ok {
			dryRun = b
		}
	}

	variables := make(map[string]string)
	if v, ok := args["variables"]; ok {
		switch m := v.(type) {
		case map[string]any:
			for k, val := range m {
				if s, ok := val.(string); ok {
					variables[k] = s
				} else {
					variables[k] = fmt.Sprintf("%v", val)
				}
			}
		}
	}

	tmpl, err := store.Templates.Get(name)
	if err != nil {
		return errNotFound("Template", err)
	}

	if dryRun {
		var files []string
		for _, action := range tmpl.Actions {
			if action.Path != "" {
				files = append(files, action.Path)
			}
		}

		result := map[string]any{
			"dryRun":    true,
			"template":  tmpl.Name,
			"variables": variables,
			"actions":   tmpl.Actions,
			"files":     files,
			"message":   MsgDryRunTemplate,
		}
		out, _ := json.MarshalIndent(result, "", "  ")
		return mcp.NewToolResultText(string(out)), nil
	}

	result := map[string]any{
		"success":   false,
		"template":  tmpl.Name,
		"variables": variables,
		"message":   MsgTemplateNotImpl,
	}
	out, _ := json.MarshalIndent(result, "", "  ")
	return mcp.NewToolResultText(string(out)), nil
}

func handleTemplateCreate(getStore func() *storage.Store, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	store := getStore()
	if store == nil {
		return noProjectError()
	}

	name, err := req.RequireString("name")
	if err != nil {
		return errResult(err.Error())
	}

	args := req.GetArguments()
	description, _ := stringArg(args, "description")

	if err := store.Templates.Create(name, description); err != nil {
		return errFailed("create template", err)
	}

	tmpl, err := store.Templates.Get(name)
	if err != nil {
		result := map[string]any{
			"success": true,
			"name":    name,
			"message": fmt.Sprintf("Template '%s' created successfully", name),
		}
		out, _ := json.MarshalIndent(result, "", "  ")
		return mcp.NewToolResultText(string(out)), nil
	}

	out, _ := json.MarshalIndent(tmpl, "", "  ")
	return mcp.NewToolResultText(string(out)), nil
}
