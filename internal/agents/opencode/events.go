package opencode

import (
	"fmt"
	"strings"

	"github.com/howznguyen/knowns/internal/models"
)

// EventType represents the type of an OpenCode event.
type EventType string

const (
	EventTypeText       EventType = "text"
	EventTypeThinking   EventType = "thinking"
	EventTypeToolUse    EventType = "tool_use"
	EventTypeToolResult EventType = "tool_result"
	EventTypeError      EventType = "error"
	EventTypeResult    EventType = "result"
	EventTypeDone      EventType = "done"
)

// ProxyEvent converts an OpenCode API event to the internal ProxyEvent format.
func ProxyEvent(raw map[string]any) *models.ProxyEvent {
	typ, _ := raw["type"].(string)

	// OpenCode SSE format: {"type":"message.part.delta","properties":{"field":"text","delta":"..."}}
	// Also: {"type":"message.part.delta","properties":{"field":"reasoning","delta":"..."}}
	if typ == "message.part.delta" {
		props, ok := raw["properties"].(map[string]any)
		if !ok {
			return nil
		}
		field, _ := props["field"].(string)
		delta, _ := props["delta"].(string)

		switch field {
		case "text":
			return &models.ProxyEvent{Type: "text", Text: delta, Agent: "opencode"}
		case "reasoning":
			return &models.ProxyEvent{Type: "thinking", Text: delta, Agent: "opencode"}
		}
		return nil
	}

	// Handle server.connected - ignore
	if typ == "server.connected" {
		return nil
	}

	// OpenCode format: {"type":"step_start", "part":{...}}
	part, hasPart := raw["part"].(map[string]any)

	switch typ {
	case "text":
		// Text from part.text
		if hasPart {
			if text, ok := part["text"].(string); ok && text != "" {
				return &models.ProxyEvent{Type: "text", Text: text, Agent: "opencode"}
			}
		}
		// Direct text in the event
		if text, ok := raw["text"].(string); ok && text != "" {
			return &models.ProxyEvent{Type: "text", Text: text, Agent: "opencode"}
		}
		return nil

	case "thinking":
		text, _ := raw["text"].(string)
		if text != "" {
			return &models.ProxyEvent{Type: "thinking", Text: text, Agent: "opencode"}
		}
		return nil

	case "step_start":
		// Silent - don't show step start
		return nil

	case "step_finish":
		// Silent - don't show step finish
		return nil

	case "tool_use":
		if hasPart {
			tool, _ := part["tool"].(string)
			state, _ := part["state"].(map[string]any)
			input, _ := state["input"].(map[string]any)

			// Build detailed tool info based on tool type
			var detail strings.Builder
			detail.WriteString("🔧 ")
			detail.WriteString(tool)

			// Extract useful info based on tool type
			switch tool {
			case "bash":
				if cmd, ok := input["command"].(string); ok {
					detail.WriteString("\n$ ")
					detail.WriteString(cmd)
				}
			case "read":
				if path, ok := input["file_path"].(string); ok {
					detail.WriteString("\n📄 ")
					detail.WriteString(path)
				}
			case "edit", "str_replace_editor":
				if path, ok := input["file_path"].(string); ok {
					detail.WriteString("\n📝 ")
					detail.WriteString(path)
				}
			case "grep", "search":
				if pattern, ok := input["pattern"].(string); ok {
					detail.WriteString("\n🔍 ")
					detail.WriteString(pattern)
				}
			}

			return &models.ProxyEvent{Type: "tool_use", Text: detail.String(), Agent: "opencode", Raw: input}
		}
		return nil

	case "tool_result":
		if hasPart {
			state, _ := part["state"].(map[string]any)
			output, _ := state["output"].(string)
			// Increase limit - show more output (up to 5000 chars)
			if len(output) > 5000 {
				output = output[:5000] + "\n... (truncated)"
			}
			return &models.ProxyEvent{Type: "tool_result", Text: output, Agent: "opencode"}
		}
		return nil

	case "error":
		text, _ := raw["message"].(string)
		if text == "" && hasPart {
			text, _ = part["error"].(string)
		}
		return &models.ProxyEvent{Type: "error", Text: text, Agent: "opencode"}

	case "result", "done", "complete":
		// Final result - show stats if available
		stats, _ := raw["stats"].(map[string]any)
		if stats != nil {
			if tokens, ok := stats["tokens"].(map[string]any); ok {
				total, _ := tokens["total"].(float64)
				text := fmt.Sprintf("✅ Done (tokens: %.0f)", total)
				return &models.ProxyEvent{Type: "result", Text: text, Agent: "opencode"}
			}
		}
		return &models.ProxyEvent{Type: "result", Text: "✅ Done", Agent: "opencode"}
	}

	return nil
}
