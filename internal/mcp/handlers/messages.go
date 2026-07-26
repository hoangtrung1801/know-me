package handlers

import (
	"fmt"

	mcp "github.com/mark3labs/mcp-go/mcp"
)

// Static error messages.
const (
	ErrNoProject   = "No project set. Call set_project with the project root path."
	ErrTaskIDReq   = "taskId is required"
	ErrPathReq     = "path is required"
	ErrNoKnownsDir = "No .knowns/ directory found at %s"
	ErrLoadConfig  = "Failed to load project config: %s"

	// Format patterns used by errNotFound / errFailed.
	fmtNotFound = "%s not found: %s"
	fmtFailed   = "Failed to %s: %s"
)

// Success / info messages.
const (
	MsgTimerStarted    = "Timer started for task '%s'"
	MsgDeletedTask     = "Deleted task %s: %s"
	MsgWouldDeleteTask = "Would delete task %s: %s"
	MsgDeletedDoc      = "Deleted doc: %s (%s)"
	MsgWouldDeleteDoc  = "Would delete doc: %s (%s)"
	MsgDryRunTemplate  = "Dry run: no files were written. Set dryRun: false to generate files."
	MsgTemplateNotImpl = "Template execution (non-dry-run) is not yet implemented in the Go MCP server. Use the TypeScript CLI for template generation."
)

// noProjectError returns a standard MCP tool error for missing project.
func noProjectError() (*mcp.CallToolResult, error) {
	return mcp.NewToolResultError(ErrNoProject), nil
}

// errResult wraps a plain string as an MCP tool error.
func errResult(msg string) (*mcp.CallToolResult, error) {
	return mcp.NewToolResultError(msg), nil
}

// errResultf wraps a formatted string as an MCP tool error.
func errResultf(format string, args ...any) (*mcp.CallToolResult, error) {
	return mcp.NewToolResultError(fmt.Sprintf(format, args...)), nil
}

// errNotFound returns "X not found: <err>".
func errNotFound(entity string, err error) (*mcp.CallToolResult, error) {
	return errResultf(fmtNotFound, entity, err.Error())
}

// errFailed returns "Failed to X: <err>".
func errFailed(action string, err error) (*mcp.CallToolResult, error) {
	return errResultf(fmtFailed, action, err.Error())
}
