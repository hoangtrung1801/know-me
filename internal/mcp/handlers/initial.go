package handlers

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/hoangtrung1801/know-me/internal/readiness"
	"github.com/hoangtrung1801/know-me/internal/storage"
	"github.com/mark3labs/mcp-go/mcp"
	"github.com/mark3labs/mcp-go/server"
)

func RegisterInitialTool(s *server.MCPServer, getStore func() *storage.Store) {
	s.AddTool(
		mcp.NewTool("initial",
			mcp.WithDescription(`Provides the Know-Me session-ready instructions for AI agents.

- initial: Return dynamic project state, workflow guidance, and tool summary. Required: none. Optional: none. Returns: plain-text instructions to read before performing project work.
`),
		),
		func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
			return mcp.NewToolResultText(buildInitialInstructions(getStore)), nil
		},
	)
}

func RegisterInitialToolWithStatusProvider(s *server.MCPServer, getStore func() *storage.Store, _ any, _ ...any) {
	RegisterInitialTool(s, getStore)
}

func buildInitialInstructions(getStore func() *storage.Store, _ ...any) string {
	var b strings.Builder
	store := getStore()

	b.WriteString("# Know-Me MCP — Session Ready\n\n")
	writeProjectState(&b, store)
	b.WriteString("\n")
	writeWorkflow(&b)
	b.WriteString("\n")
	writeToolsSummary(&b)

	return b.String()
}

func buildInitialInstructionsWithStatuses(getStore func() *storage.Store, _ any, _ any) string {
	return buildInitialInstructions(getStore)
}

func writeProjectState(b *strings.Builder, store *storage.Store) {
	b.WriteString("## Project State\n")
	if store == nil {
		b.WriteString("Project: not connected\n")
		return
	}

	payload := readiness.BuildReadiness(store, readiness.Options{})
	inProgress := countInProgressTasks(store)
	fmt.Fprintf(b, "Project: %s\n", payload.ProjectName)
	if payload.Knowledge != nil {
		k := payload.Knowledge
		fmt.Fprintf(b, "Knowledge: docs: %d | tasks: %d (%d in-progress)\n", k.Docs, k.Tasks, inProgress)
	}

	if timerLine := activeTimerLine(store); timerLine != "" {
		b.WriteString(timerLine)
		b.WriteString("\n")
	}
}

func countInProgressTasks(store *storage.Store) int {
	tasks, err := store.Tasks.List()
	if err != nil {
		return 0
	}
	count := 0
	for _, task := range tasks {
		if task.Status == "in-progress" {
			count++
		}
	}
	return count
}

func activeTimerLine(store *storage.Store) string {
	state, err := store.Time.GetState()
	if err != nil || len(state.Active) == 0 {
		return ""
	}
	timer := state.Active[0]
	startedAt, err := time.Parse(time.RFC3339Nano, timer.StartedAt)
	if err != nil {
		return fmt.Sprintf("⏱ Active timer: %s \"%s\"", timer.TaskID, timer.TaskTitle)
	}
	elapsed := time.Since(startedAt) - time.Duration(timer.TotalPausedMs)*time.Millisecond
	if timer.PausedAt != nil {
		if pausedAt, err := time.Parse(time.RFC3339Nano, *timer.PausedAt); err == nil {
			elapsed = pausedAt.Sub(startedAt) - time.Duration(timer.TotalPausedMs)*time.Millisecond
		}
	}
	if elapsed < 0 {
		elapsed = 0
	}
	return fmt.Sprintf("⏱ Active timer: %s \"%s\" (%s)", timer.TaskID, timer.TaskTitle, formatInitialDuration(elapsed))
}

func formatInitialDuration(d time.Duration) string {
	d = d.Round(time.Minute)
	if d < time.Minute {
		return "0m"
	}
	hours := int(d.Hours())
	minutes := int(d.Minutes()) % 60
	if hours > 0 {
		return fmt.Sprintf("%dh%dm", hours, minutes)
	}
	return fmt.Sprintf("%dm", minutes)
}

func writeWorkflow(b *strings.Builder) {
	b.WriteString(`## Workflow
Bootstrap:     initial → help("workflow.*") or help("<domain>.*") as needed
Discovery:     search(query) → docs/tasks(get) for details
Docs:          docs.get(smart:true) → docs.get(toc:true) → docs.get(section:"...") for large docs
Task flow:     tasks(get/create) → follow refs → plan → implement → validate → done
Time:          time(start) when taking task, time(stop) when done
Progress:      tasks(update, appendNotes:"...") — not notes (replaces)

Use help on demand instead of assuming the visible MCP tool schema is complete.
`)
}

func writeToolsSummary(b *strings.Builder) {
	b.WriteString("## Tools (discover with help)\n")
	b.WriteString("tasks | docs | search | time | templates | validate | project | help\n")
	b.WriteString("Recipes: help(\"workflow.doc-read\"), help(\"workflow.plan-new\"), help(\"workflow.spec\"), help(\"workflow.verify\")")
}
