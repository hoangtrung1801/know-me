package guidelines

import (
	"fmt"
	"io/fs"
	"strings"
)

type RenderOptions struct {
	CLI bool
	MCP bool
}

var defaultOrder = []string{
	"unified/core-rules.md",
	"unified/context-optimization.md",
	"unified/commands-reference.md",
	"unified/workflow-creation.md",
	"unified/workflow-execution.md",
	"unified/workflow-completion.md",
	"unified/common-mistakes.md",
}

func RenderFile(path string, opts RenderOptions) (string, error) {
	data, err := fs.ReadFile(Files, path)
	if err != nil {
		return "", err
	}
	return renderConditionals(string(data), opts)
}

func RenderMany(paths []string, opts RenderOptions) (string, error) {
	parts := make([]string, 0, len(paths))
	for _, path := range paths {
		rendered, err := RenderFile(path, opts)
		if err != nil {
			return "", fmt.Errorf("render %s: %w", path, err)
		}
		rendered = strings.TrimSpace(rendered)
		if rendered != "" {
			parts = append(parts, rendered)
		}
	}
	return strings.Join(parts, "\n\n---\n\n"), nil
}

func RenderFull(opts RenderOptions) (string, error) {
	return RenderMany(defaultOrder, opts)
}

func renderConditionals(input string, opts RenderOptions) (string, error) {
	type frame struct {
		parentActive bool
		cond         bool
	}

	resolve := func(name string) (bool, error) {
		switch name {
		case "cli":
			return opts.CLI, nil
		case "mcp":
			return opts.MCP, nil
		default:
			return false, fmt.Errorf("unsupported conditional %q", name)
		}
	}

	lines := strings.Split(input, "\n")
	stack := make([]frame, 0, 4)
	currentActive := true
	out := make([]string, 0, len(lines))

	for _, line := range lines {
		trimmed := strings.TrimSpace(line)

		if strings.HasPrefix(trimmed, "{{#if ") && strings.HasSuffix(trimmed, "}}") {
			name := strings.TrimSuffix(strings.TrimPrefix(trimmed, "{{#if "), "}}")
			cond, err := resolve(strings.TrimSpace(name))
			if err != nil {
				return "", err
			}
			stack = append(stack, frame{
				parentActive: currentActive,
				cond:         cond,
			})
			currentActive = currentActive && cond
			continue
		}

		if trimmed == "{{else}}" {
			if len(stack) == 0 {
				return "", fmt.Errorf("unexpected {{else}}")
			}
			top := stack[len(stack)-1]
			currentActive = top.parentActive && !top.cond
			continue
		}

		if trimmed == "{{/if}}" {
			if len(stack) == 0 {
				return "", fmt.Errorf("unexpected {{/if}}")
			}
			top := stack[len(stack)-1]
			stack = stack[:len(stack)-1]
			currentActive = top.parentActive
			continue
		}

		if currentActive {
			out = append(out, line)
		}
	}

	if len(stack) != 0 {
		return "", fmt.Errorf("unclosed conditional block")
	}

	return strings.TrimSpace(strings.Join(out, "\n")), nil
}
