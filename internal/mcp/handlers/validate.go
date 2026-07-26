package handlers

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/howznguyen/knowns/internal/storage"
	"github.com/howznguyen/knowns/internal/validate"
	"github.com/mark3labs/mcp-go/mcp"
)

// RegisterValidateTools registers the validate MCP tool.
func RegisterValidateTools(s toolRegistrar, getStore func() *storage.Store) {
	s.AddTool(
		mcp.NewTool("validate",
			mcp.WithDescription(`Validate tasks, docs, templates, and spec-driven development state for reference integrity and quality.

- validate: Run validation checks. Required: none. Optional: scope (all default, tasks, docs, templates, sdd), entity (specific task ID or doc path), strict (treat warnings as errors), fix (auto-fix supported issues). Returns: JSON with valid flag, strict flag, scope, issues, errorCount, warningCount, infoCount, and summary.
`),
			mcp.WithString("scope",
				mcp.Description("Validation scope: 'all' (default), 'tasks', 'docs', 'templates', or 'sdd' for spec-driven checks"),
				mcp.Enum("all", "tasks", "docs", "templates", "sdd"),
			),
			mcp.WithString("entity",
				mcp.Description("Validate a specific entity only. Use task ID directly (e.g., '6vbpda') or doc path (e.g., 'specs/user-auth'). Auto-detects type based on format."),
			),
			mcp.WithBoolean("strict",
				mcp.Description("Treat warnings as errors (default: false)"),
			),
			mcp.WithBoolean("fix",
				mcp.Description("Auto-fix supported issues like broken doc refs (default: false)"),
			),
		),
		func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
			store := getStore()
			if store == nil {
				return noProjectError()
			}

			args := req.GetArguments()
			scope := "all"
			if v, ok := stringArg(args, "scope"); ok && v != "" {
				scope = v
			}
			entity, _ := stringArg(args, "entity")
			strict := boolArg(args, "strict")
			fix := boolArg(args, "fix")

			// Run shared validation engine.
			result := validate.Run(store, validate.Options{
				Scope:  scope,
				Entity: entity,
				Strict: strict,
				Fix:    fix,
			})

			output := map[string]any{
				"valid":        result.Valid,
				"strict":       strict,
				"scope":        scope,
				"issues":       result.Issues,
				"errorCount":   result.ErrorCount,
				"warningCount": result.WarningCount,
				"infoCount":    result.InfoCount,
				"summary":      fmt.Sprintf("%d errors, %d warnings, %d info", result.ErrorCount, result.WarningCount, result.InfoCount),
			}

			out, _ := json.MarshalIndent(output, "", "  ")
			return mcp.NewToolResultText(string(out)), nil
		},
	)

	registerHelp(s, "validate.validate", HelpEntry{When: "Validate tasks, docs, templates, refs, or SDD coverage before marking work complete.", Params: map[string]string{"scope": "all | tasks | docs | templates | sdd", "entity": "specific task ID or doc path", "strict": "treat warnings as errors", "fix": "auto-fix supported issues"}, Flow: "Run targeted validation after tests and before task completion."})
}
