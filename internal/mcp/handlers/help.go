package handlers

import (
	"context"
	"encoding/json"
	"github.com/mark3labs/mcp-go/server"
	"sort"
	"strings"

	"github.com/mark3labs/mcp-go/mcp"
)

// HelpEntry describes when and how to use a tool action.
type HelpEntry struct {
	When     string            `json:"when"`
	Params   map[string]string `json:"params"`
	Why      string            `json:"why,omitempty"`
	Examples []string          `json:"examples,omitempty"`
	Flow     string            `json:"flow,omitempty"`
}

// RegisterHelpTool registers the help lookup tool.
func RegisterHelpTool(s *server.MCPServer, getHelpRegistry func() map[string]HelpEntry) {
	s.AddTool(
		mcp.NewTool("help",
			mcp.WithDescription(`Retrieves on-demand help for tool actions. Query exact keys like code.find, wildcard prefixes like code.*, or keywords like insert.`),
			mcp.WithArray("queries",
				mcp.Required(),
				mcp.Description("Help queries: exact tool.action, prefix wildcard tool.*, or keyword search"),
				mcp.WithStringItems(),
			),
		),
		func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
			queries, ok := stringSliceArg(req.GetArguments(), "queries")
			if !ok || len(queries) == 0 {
				return errResult("queries is required")
			}

			result := resolveHelpQueries(getHelpRegistry(), queries)
			out, _ := json.MarshalIndent(result, "", "  ")
			return mcp.NewToolResultText(string(out)), nil
		},
	)
}

func resolveHelpQueries(registry map[string]HelpEntry, queries []string) map[string]any {
	matches := map[string]map[string]HelpEntry{}
	suggestions := map[string][]string{}

	for _, raw := range queries {
		query := strings.TrimSpace(raw)
		if query == "" {
			continue
		}

		keys := helpMatches(registry, query)
		if len(keys) == 0 {
			suggestions[query] = helpSuggestions(registry, query)
			continue
		}

		for _, key := range keys {
			tool, action, ok := strings.Cut(key, ".")
			if !ok || tool == "" || action == "" {
				continue
			}
			if _, exists := matches[tool]; !exists {
				matches[tool] = map[string]HelpEntry{}
			}
			matches[tool][action] = registry[key]
		}
	}

	result := map[string]any{}
	for tool, actions := range matches {
		result[tool] = actions
	}
	if len(suggestions) > 0 {
		result["suggestions"] = suggestions
	}
	return result
}

func helpMatches(registry map[string]HelpEntry, query string) []string {
	if _, ok := registry[query]; ok {
		return []string{query}
	}

	var keys []string
	if strings.HasSuffix(query, ".*") {
		prefix := strings.TrimSuffix(query, "*")
		for key := range registry {
			if strings.HasPrefix(key, prefix) {
				keys = append(keys, key)
			}
		}
	} else {
		needle := strings.ToLower(query)
		for key, entry := range registry {
			if strings.Contains(helpSearchText(key, entry), needle) {
				keys = append(keys, key)
			}
		}
	}

	sort.Strings(keys)
	return keys
}

func helpSearchText(key string, entry HelpEntry) string {
	parts := []string{key, entry.When, entry.Why, entry.Flow}
	for name, desc := range entry.Params {
		parts = append(parts, name, desc)
	}
	parts = append(parts, entry.Examples...)
	return strings.ToLower(strings.Join(parts, " "))
}

func helpSuggestions(registry map[string]HelpEntry, query string) []string {
	needle := strings.ToLower(strings.TrimSuffix(query, "*"))
	var keys []string
	for key := range registry {
		lower := strings.ToLower(key)
		if needle == "" || strings.Contains(lower, needle) || strings.Contains(needle, lower) || sameHelpTool(lower, needle) {
			keys = append(keys, key)
		}
	}
	if len(keys) == 0 {
		for key := range registry {
			keys = append(keys, key)
		}
	}
	sort.Strings(keys)
	if len(keys) > 5 {
		keys = keys[:5]
	}
	return keys
}

func sameHelpTool(key, query string) bool {
	tool, _, ok := strings.Cut(key, ".")
	if !ok {
		return false
	}
	queryTool, _, ok := strings.Cut(query, ".")
	return ok && tool == queryTool
}
