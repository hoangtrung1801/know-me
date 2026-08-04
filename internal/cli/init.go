package cli

import (
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"

	"github.com/hoangtrung1801/known-me/internal/models"
	"github.com/hoangtrung1801/known-me/internal/runtimeinstall"
	"github.com/spf13/cobra"
)

// embeddingModelInfo describes a supported embedding model for semantic search.
type embeddingModelInfo struct {
	ID            string
	Title         string
	Description   string
	HuggingFaceID string
	Dimensions    int
	MaxTokens     int
}

var supportedEmbeddingModels = []embeddingModelInfo{
	{
		ID:            "gte-small",
		Title:         "gte-small (recommended)",
		Description:   "384 dims, 67MB — best balance",
		HuggingFaceID: "Xenova/gte-small",
		Dimensions:    384,
		MaxTokens:     512,
	},
	{
		ID:            "all-MiniLM-L6-v2",
		Title:         "all-MiniLM-L6-v2",
		Description:   "384 dims, 45MB — fastest",
		HuggingFaceID: "Xenova/all-MiniLM-L6-v2",
		Dimensions:    384,
		MaxTokens:     256,
	},
	{
		ID:            "gte-base",
		Title:         "gte-base",
		Description:   "768 dims, 220MB — highest quality",
		HuggingFaceID: "Xenova/gte-base",
		Dimensions:    768,
		MaxTokens:     512,
	},
	{
		ID:            "bge-small-en-v1.5",
		Title:         "bge-small-en-v1.5",
		Description:   "384 dims, 67MB — strong retrieval",
		HuggingFaceID: "Xenova/bge-small-en-v1.5",
		Dimensions:    384,
		MaxTokens:     512,
	},
	{
		ID:            "bge-base-en-v1.5",
		Title:         "bge-base-en-v1.5",
		Description:   "768 dims, 220MB — top retrieval quality",
		HuggingFaceID: "Xenova/bge-base-en-v1.5",
		Dimensions:    768,
		MaxTokens:     512,
	},
	{
		ID:            "nomic-embed-text-v1.5",
		Title:         "nomic-embed-text-v1.5",
		Description:   "768 dims, 274MB — long context (8192 tokens)",
		HuggingFaceID: "nomic-ai/nomic-embed-text-v1.5",
		Dimensions:    768,
		MaxTokens:     8192,
	},
	{
		ID:            "multilingual-e5-small",
		Title:         "multilingual-e5-small",
		Description:   "384 dims, 471MB — multilingual support",
		HuggingFaceID: "Xenova/multilingual-e5-small",
		Dimensions:    384,
		MaxTokens:     512,
	},
}

// instructionFile defines an agent instruction file to generate during init.
type instructionFile struct {
	Path       string
	Platform   string // display name passed to generateInstructionContent
	PlatformID string // matches allPlatformIDs entry
}

const canonicalInstructionFile = "KNOWNS.md"

var defaultInstructionFiles = []instructionFile{
	{Path: "CLAUDE.md", Platform: "Claude Code", PlatformID: "claude-code"},
	{Path: "OPENCODE.md", Platform: "OpenCode", PlatformID: "opencode"},
	{Path: "GEMINI.md", Platform: "Gemini CLI", PlatformID: "gemini"},
	{Path: "AGENTS.md", Platform: "Generic AI", PlatformID: "agents"},
	{Path: filepath.Join(".github", "copilot-instructions.md"), Platform: "GitHub Copilot", PlatformID: "copilot"},
}

var initCmd = &cobra.Command{
	Use:   "init [name]",
	Short: "Initialize a new Know-Me project",
	Long: `Initialize a new Know-Me project in the current directory.
Creates a .knowns/ directory with the required structure and a default config.json.`,
	Args: cobra.MaximumNArgs(1),
	RunE: runInit,
}

// allPlatformIDs is the full ordered list of supported platform identifiers.
var allPlatformIDs = []string{"claude-code", "opencode", "codex", "kiro", "hermes", "antigravity", "cursor", "gemini", "copilot", "agents"}

// wizardPlatformIDs is the subset shown in the wizard multi-select.
var wizardPlatformIDs = []string{"claude-code", "opencode", "codex", "kiro", "hermes", "antigravity", "cursor", "gemini", "copilot", "agents"}

// platformLabel returns the human-readable label for a platform ID.
func platformLabel(id string) string {
	if label := platformLabelFromRuntime(id); label != "" {
		return label
	}
	switch id {
	case "gemini":
		return "Google Gemini  (GEMINI.md)"
	case "antigravity":
		return "Antigravity  (.agents/rules/knowns.md, ~/.gemini/antigravity/mcp_config.json)"
	case "hermes":
		return "Hermes Agent  (AGENTS.md, .agents/skills, ~/.hermes/config.yaml)"
	case "cursor":
		return "Cursor  (.cursor/mcp.json)"
	case "copilot":
		return "GitHub Copilot  (.github/copilot-instructions.md)"
	case "agents":
		return "Generic Agents  (AGENTS.md, .agents/skills/)"
	default:
		return id
	}
}

func platformLabelFromRuntime(id string) string {
	switch id {
	case "claude-code", "codex", "opencode", "kiro":
		return compactRuntimePickerLabel(id, runtimeinstall.DefaultOptions())
	default:
		return ""
	}
}

func compactRuntimePickerLabel(id string, opts runtimeinstall.Options) string {
	status := runtimeinstall.RuntimeAvailabilitySummary(id, opts)
	specLabel := map[string]string{
		"claude-code": "Claude Code (CLAUDE.md, SKILL, hooks, ...)",
		"codex":       "Codex (.codex/config.toml, SKILL, hooks, ...)",
		"opencode":    "OpenCode (OPENCODE.md, SKILL, plugin, MCP, ...)",
		"kiro":        "Kiro IDE (.kiro/steering, SKILL, hooks, ...)",
	}[id]
	if specLabel == "" {
		return id
	}
	return fmt.Sprintf("%s %s", runtimeStatusDot(status), specLabel)
}

func runtimeStatusDot(status string) string {
	switch status {
	case "installed":
		return StyleSuccess.Render("●")
	case "available":
		return StyleWarning.Render("●")
	default:
		return StyleError.Render("●")
	}
}

// hasPlatform returns true if id is in platforms, or platforms is empty (= all enabled).
func hasPlatform(platforms []string, id string) bool {
	if len(platforms) == 0 {
		return true
	}
	for _, p := range platforms {
		if p == id {
			return true
		}
	}
	return false
}

func hasExplicitPlatform(platforms []string, id string) bool {
	for _, p := range platforms {
		if p == id {
			return true
		}
	}
	return false
}

func shouldCreateInstructionFile(platforms []string, f instructionFile) bool {
	if len(platforms) == 0 {
		return true
	}
	if f.PlatformID == "agents" && (hasExplicitPlatform(platforms, "codex") || hasExplicitPlatform(platforms, "hermes")) {
		return true
	}
	return hasExplicitPlatform(platforms, f.PlatformID)
}

// Aliases for centralized styles (see styles.go)
var (
	titleStyle   = StyleTitle
	successStyle = StyleSuccess
	warnStyle    = StyleWarning
	dimStyle     = StyleDim
)

func runInit(_ *cobra.Command, _ []string) error { return nil }

func gitTrackingSelectedSections(tracking *models.GitTracking) []string {
	defaults := models.GitTrackingDefaults()
	gt := tracking
	if gt == nil {
		gt = &defaults
	}
	selected := []string{}
	if gt.Tasks != nil && *gt.Tasks || gt.Tasks == nil && *defaults.Tasks {
		selected = append(selected, "tasks")
	}
	if gt.Docs != nil && *gt.Docs || gt.Docs == nil && *defaults.Docs {
		selected = append(selected, "docs")
	}
	if gt.Templates != nil && *gt.Templates || gt.Templates == nil && *defaults.Templates {
		selected = append(selected, "templates")
	}
	if gt.Memories != nil && *gt.Memories || gt.Memories == nil && *defaults.Memories {
		selected = append(selected, "memories")
	}
	if gt.Decisions != nil && *gt.Decisions || gt.Decisions == nil && *defaults.Decisions {
		selected = append(selected, "decisions")
	}
	return selected
}

func sectionSelected(selected []string, section string) bool {
	for _, s := range selected {
		if s == section {
			return true
		}
	}
	return false
}

func gitTrackingFromSelectedSections(selected []string) models.GitTracking {
	tasks := sectionSelected(selected, "tasks")
	docs := sectionSelected(selected, "docs")
	templates := sectionSelected(selected, "templates")
	memories := sectionSelected(selected, "memories")
	decisions := sectionSelected(selected, "decisions")
	return models.GitTracking{
		Tasks:     &tasks,
		Docs:      &docs,
		Templates: &templates,
		Memories:  &memories,
		Decisions: &decisions,
	}
}

// execLookPath is used to locate binaries in PATH. Overridable in tests.
var execLookPath = exec.LookPath

// defaultExecLookPath is the original value of execLookPath for test cleanup.
var defaultExecLookPath = exec.LookPath

// osUserHomeDir is overridable in tests.
var osUserHomeDir = os.UserHomeDir

// mcpCommand returns the command and args for starting the Know-Me MCP server
// in generated project configs. Uses the local knowns binary if available,
// otherwise falls back to npx so configs work on machines without a global install.
func mcpCommand() (command string, args []string) {
	if _, err := execLookPath("knowns"); err == nil {
		return "knowns", []string{"mcp", "--stdio"}
	}
	return "npx", []string{"-y", "knowns", "mcp", "--stdio"}
}

// mcpCommandFlat returns the MCP command as a single slice (for OpenCode config format).
func mcpCommandFlat() []string {
	cmd, args := mcpCommand()
	return append([]string{cmd}, args...)
}

// createMCPJsonFileQuiet creates .mcp.json without printing (for step runner).
func createMCPJsonFileQuiet(projectRoot string, force bool) error {
	mcpPath := filepath.Join(projectRoot, ".mcp.json")
	if _, err := os.Stat(mcpPath); err == nil && !force {
		return nil
	}

	cmd, args := mcpCommand()
	mcpConfig := map[string]interface{}{
		"mcpServers": map[string]interface{}{
			"knowns": map[string]interface{}{
				"command": cmd,
				"args":    args,
			},
		},
	}

	data, err := json.MarshalIndent(mcpConfig, "", "  ")
	if err != nil {
		return err
	}

	return os.WriteFile(mcpPath, data, 0644)
}

func createOpenCodeConfigQuiet(projectRoot string) error {
	configPath := filepath.Join(projectRoot, "opencode.json")

	config := map[string]any{
		"$schema": "https://opencode.ai/config.json",
	}

	if data, err := os.ReadFile(configPath); err == nil {
		if err := json.Unmarshal(data, &config); err != nil {
			return fmt.Errorf("parse opencode.json: %w", err)
		}
	} else if !os.IsNotExist(err) {
		return err
	}

	config["$schema"] = "https://opencode.ai/config.json"

	mcp, ok := config["mcp"].(map[string]any)
	if !ok || mcp == nil {
		mcp = make(map[string]any)
	}

	mcp["knowns"] = map[string]any{
		"type":    "local",
		"command": mcpCommandFlat(),
		"enabled": true,
	}

	config["mcp"] = mcp

	data, err := json.MarshalIndent(config, "", "  ")
	if err != nil {
		return err
	}

	return os.WriteFile(configPath, append(data, '\n'), 0644)
}

// createKiroSteeringQuiet creates .kiro/steering/knowns.md with lightweight
// Know-Me MCP bootstrap guidance.
func createKiroSteeringQuiet(projectRoot string, force bool) error {
	steeringDir := filepath.Join(projectRoot, ".kiro", "steering")
	if err := os.MkdirAll(steeringDir, 0755); err != nil {
		return fmt.Errorf("create .kiro/steering: %w", err)
	}

	steeringPath := filepath.Join(steeringDir, "knowns.md")
	if _, err := os.Stat(steeringPath); err == nil && !force {
		return nil
	}

	content := `---
description: Know-Me project guidelines — prefer MCP initial/help and Know-Me tools.
---

# Know-Me Guidelines

Start with Know-Me MCP ` + "`initial`" + ` when available. Use ` + "`help(\"tool.*\")`" + ` or ` + "`help(\"workflow.*\")`" + ` for domain details on demand.

Use Know-Me docs, tasks, search, memory, and validation as the project working layer. If MCP is unavailable, use the ` + "`knowns`" + ` CLI for project context.
`
	return os.WriteFile(steeringPath, []byte(content), 0644)
}

// createKiroMCPConfigQuiet creates .kiro/settings/mcp.json with the Know-Me
// MCP server entry. It merges into an existing file if present.
func createKiroMCPConfigQuiet(projectRoot string) error {
	settingsDir := filepath.Join(projectRoot, ".kiro", "settings")
	if err := os.MkdirAll(settingsDir, 0755); err != nil {
		return fmt.Errorf("create .kiro/settings: %w", err)
	}

	configPath := filepath.Join(settingsDir, "mcp.json")

	config := map[string]any{}

	if data, err := os.ReadFile(configPath); err == nil {
		if err := json.Unmarshal(data, &config); err != nil {
			return fmt.Errorf("parse .kiro/settings/mcp.json: %w", err)
		}
	} else if !os.IsNotExist(err) {
		return err
	}

	servers, ok := config["mcpServers"].(map[string]any)
	if !ok || servers == nil {
		servers = make(map[string]any)
	}

	cmd, args := mcpCommand()
	servers["knowns"] = map[string]any{
		"command":     cmd,
		"args":        args,
		"disabled":    false,
		"autoApprove": []string{"*"},
	}

	config["mcpServers"] = servers

	data, err := json.MarshalIndent(config, "", "  ")
	if err != nil {
		return err
	}

	return os.WriteFile(configPath, append(data, '\n'), 0644)
}

func createCursorMCPConfigQuiet(projectRoot string) error {
	settingsDir := filepath.Join(projectRoot, ".cursor")
	if err := os.MkdirAll(settingsDir, 0755); err != nil {
		return fmt.Errorf("create .cursor: %w", err)
	}

	configPath := filepath.Join(settingsDir, "mcp.json")
	config := map[string]any{}

	if data, err := os.ReadFile(configPath); err == nil {
		if err := json.Unmarshal(data, &config); err != nil {
			return fmt.Errorf("parse .cursor/mcp.json: %w", err)
		}
	} else if !os.IsNotExist(err) {
		return err
	}

	servers, ok := config["mcpServers"].(map[string]any)
	if !ok || servers == nil {
		servers = make(map[string]any)
	}

	cmd, args := mcpCommand()
	servers["knowns"] = map[string]any{
		"command": cmd,
		"args":    args,
	}

	config["mcpServers"] = servers

	data, err := json.MarshalIndent(config, "", "  ")
	if err != nil {
		return err
	}

	return os.WriteFile(configPath, append(data, '\n'), 0644)
}

func createCodexMCPConfigQuiet(projectRoot string) error {
	configDir := filepath.Join(projectRoot, ".codex")
	if err := os.MkdirAll(configDir, 0755); err != nil {
		return fmt.Errorf("create .codex: %w", err)
	}

	configPath := filepath.Join(configDir, "config.toml")
	body, err := readTextIfExistsCLI(configPath)
	if err != nil {
		return err
	}

	cmd, args := mcpCommand()
	updated := runtimeinstall.SetCodexMCPServer(body, cmd, args)
	return os.WriteFile(configPath, []byte(updated), 0644)
}

func createAntigravityRulesQuiet(projectRoot string, force bool) error {
	rulesDir := filepath.Join(projectRoot, ".agents", "rules")
	if err := os.MkdirAll(rulesDir, 0755); err != nil {
		return fmt.Errorf("create .agents/rules: %w", err)
	}

	rulePath := filepath.Join(rulesDir, "knowns.md")
	if _, err := os.Stat(rulePath); err == nil && !force {
		return nil
	}

	content := `---
trigger: always_on
description: Prefer Know-Me MCP initial/help and Know-Me tools for project context.
---

# Know-Me Project Guidance

- Start with Know-Me MCP ` + "`initial`" + ` when available.
- Use ` + "`help(\"tool.*\")`" + ` or ` + "`help(\"workflow.*\")`" + ` for domain details on demand.
- Treat Know-Me docs, tasks, and memory as the working layer for the project.
- Prefer Know-Me MCP tools for docs, tasks, search, and validation when available.
- If MCP is unavailable, fall back to the ` + "`knowns`" + ` CLI.
`

	return os.WriteFile(rulePath, []byte(content), 0644)
}

func readTextIfExistsCLI(path string) (string, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return "", nil
		}
		return "", err
	}
	return string(data), nil
}

func createAntigravityMCPConfigQuiet(projectRoot string) error {
	home, err := osUserHomeDir()
	if err != nil {
		return fmt.Errorf("resolve user home: %w", err)
	}

	settingsDir := filepath.Join(home, ".gemini", "antigravity")
	if err := os.MkdirAll(settingsDir, 0755); err != nil {
		return fmt.Errorf("create antigravity config dir: %w", err)
	}

	configPath := filepath.Join(settingsDir, "mcp_config.json")
	config := map[string]any{}

	if data, err := os.ReadFile(configPath); err == nil {
		if err := json.Unmarshal(data, &config); err != nil {
			return fmt.Errorf("parse antigravity mcp_config.json: %w", err)
		}
	} else if !os.IsNotExist(err) {
		return err
	}

	servers, ok := config["mcpServers"].(map[string]any)
	if !ok || servers == nil {
		servers = make(map[string]any)
	}

	cmd, args := mcpCommand()
	args = append(args, "--project", projectRoot)
	servers["knowns"] = map[string]any{
		"command": cmd,
		"args":    args,
	}

	config["mcpServers"] = servers

	data, err := json.MarshalIndent(config, "", "  ")
	if err != nil {
		return err
	}

	return os.WriteFile(configPath, append(data, '\n'), 0644)
}

// createInstructionFilesForPlatforms generates only instruction files for the
// given platform IDs. If platforms is empty all files are generated.
func createInstructionFilesForPlatforms(projectRoot string, force bool, platforms []string) error {
	if err := writeInstructionFile(projectRoot, canonicalInstructionFile, "Know-Me", force); err != nil {
		return err
	}

	for _, f := range defaultInstructionFiles {
		if !shouldCreateInstructionFile(platforms, f) {
			continue
		}
		if err := writeInstructionFile(projectRoot, f.Path, f.Platform, force); err != nil {
			return err
		}
	}
	return nil
}

// createInstructionFilesQuiet generates agent instruction files without printing.
func createInstructionFilesQuiet(projectRoot string, force bool) error {
	if err := writeInstructionFile(projectRoot, canonicalInstructionFile, "Know-Me", force); err != nil {
		return err
	}

	for _, f := range defaultInstructionFiles {
		if err := writeInstructionFile(projectRoot, f.Path, f.Platform, force); err != nil {
			return err
		}
	}
	return nil
}

func writeInstructionFile(projectRoot, relativePath, platform string, force bool) error {
	filePath := filepath.Join(projectRoot, relativePath)
	fileExists := false
	if _, err := os.Stat(filePath); err == nil {
		fileExists = true
		if !force {
			return nil
		}
	}

	if dir := filepath.Dir(filePath); dir != projectRoot {
		if err := os.MkdirAll(dir, 0755); err != nil {
			return fmt.Errorf("create directory %s: %w", dir, err)
		}
	}

	content := generateInstructionContent(relativePath, platform, projectRoot)

	// For compatibility shim files that already exist, preserve user content
	// outside the managed marker block.
	if fileExists && relativePath != canonicalInstructionFile {
		return syncInstructionMarkerBlock(filePath, content)
	}

	if err := os.WriteFile(filePath, []byte(content), 0644); err != nil {
		return fmt.Errorf("could not create %s: %w", relativePath, err)
	}

	return nil
}

func generateInstructionContent(relativePath, platform, projectRoot string) string {
	if relativePath == canonicalInstructionFile {
		return renderCanonicalInstructionContent()
	}

	return renderCompatibilityInstructionContent(relativePath, platform, projectRoot)
}

func renderCanonicalInstructionContent() string {
	var sb strings.Builder
	sb.WriteString("# KNOWNS\n\n")
	sb.WriteString("Human-readable repository guidance for agents working in this project. Runtime-critical AI bootstrap guidance is provided by Know-Me MCP `initial` and on-demand `help`.\n\n")
	sb.WriteString("## Table of Contents\n\n")
	sb.WriteString("- [Source of Truth](#source-of-truth)\n")
	sb.WriteString("- [TL;DR](#tldr)\n")
	sb.WriteString("- [Repo Mental Model](#repo-mental-model)\n")
	sb.WriteString("- [How Agents Should Read This File](#how-agents-should-read-this-file)\n")
	sb.WriteString("- [Tool Selection](#tool-selection)\n")
	sb.WriteString("- [Memory Usage](#memory-usage)\n")
	sb.WriteString("- [Critical Rules](#critical-rules)\n")
	sb.WriteString("- [Git Safety](#git-safety)\n")
	sb.WriteString("- [Context Retrieval Strategy](#context-retrieval-strategy)\n")
	sb.WriteString("- [References](#references)\n")
	sb.WriteString("- [Common Mistakes](#common-mistakes)\n")
	sb.WriteString("- [Recommended File Roles](#recommended-file-roles)\n")
	sb.WriteString("- [Compatibility Pattern](#compatibility-pattern)\n")
	sb.WriteString("- [Maintenance Rules](#maintenance-rules)\n\n")
	sb.WriteString("## Source of Truth\n\n")
	sb.WriteString("- MCP `initial` is the primary runtime bootstrap for AI agents.\n")
	sb.WriteString("- MCP `help(\"tool.*\")` and `help(\"workflow.*\")` are the primary on-demand sources for tool schemas and workflow recipes.\n")
	sb.WriteString("- `KNOWNS.md` is a human-readable project reference and fallback when MCP is unavailable.\n")
	sb.WriteString("- `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `OPENCODE.md`, and `.github/copilot-instructions.md` are compatibility shims for runtimes that auto-detect those filenames.\n")
	sb.WriteString("- If guidance appears in multiple places, follow this precedence order:\n")
	sb.WriteString("  1. System instructions\n")
	sb.WriteString("  2. Developer instructions\n")
	sb.WriteString("  3. MCP `initial` / `help`\n")
	sb.WriteString("  4. Skills\n")
	sb.WriteString("  5. `KNOWNS.md`\n")
	sb.WriteString("  6. Compatibility shim files\n")
	sb.WriteString("  7. Other repository docs\n\n")
	sb.WriteString("## TL;DR\n\n")
	sb.WriteString("- Call `initial` at session start — it returns project readiness, knowledge counts, code intelligence rules, workflow guidance, and available tools.\n")
	sb.WriteString("- Use `help(\"tool.action\")`, `help(\"tool.*\")`, or `help(\"workflow.*\")` when a domain/action schema is not visible.\n")
	sb.WriteString("- Use Know-Me as the memory layer for humans and the AI-friendly working layer for agents.\n")
	sb.WriteString("- Search before reading; read only the sections and docs relevant to the current task.\n")
	sb.WriteString("- Never manually edit Know-Me-managed task or doc markdown.\n")
	sb.WriteString("- Prefer Know-Me MCP tools; use the `knowns` CLI only as fallback.\n")
	sb.WriteString("- Let skills handle detailed workflows; use this file for rules, conventions, and context routing.\n")
	sb.WriteString("- Validate before marking work complete.\n")
	sb.WriteString("- Do not revert user changes you did not make.\n\n")
	sb.WriteString("## Repo Mental Model\n\n")
	sb.WriteString("- Know-Me is the project's memory layer for humans and the AI-friendly operating layer for agents.\n")
	sb.WriteString("- Know-Me manages tasks, docs, templates, specs, references, and workflow state in one place.\n")
	sb.WriteString("- Tasks and docs may reference each other using `@task-<id>`, `@doc/<path>`, and `@template/<name>`.\n")
	sb.WriteString("- MCP `initial` defines runtime operating rules; skills define step-by-step execution flows.\n")
	sb.WriteString("- `KNOWNS.md` provides a stable human-readable reference for those conventions.\n")
	sb.WriteString("- Long guidance should be retrieved by section, not blindly injected in full on every request.\n\n")
	sb.WriteString("## How Agents Should Read This File\n\n")
	sb.WriteString("- Prefer MCP `initial` and `help` first. Read this file when MCP guidance is unavailable or deeper project context is needed.\n")
	sb.WriteString("- If reading this file, start with `## Source of Truth` and `## TL;DR`.\n")
	sb.WriteString("- For short or obvious tasks, use the summary sections plus the relevant section only.\n")
	sb.WriteString("- For tool usage questions, read `## Tool Selection` and `## Common Mistakes`.\n")
	sb.WriteString("- For safety-sensitive work, read `## Critical Rules` and `## Git Safety`.\n")
	sb.WriteString("- For large files or docs, read `## Context Retrieval Strategy`.\n")
	sb.WriteString("- For ambiguous requests, search the repo and related docs before asking the user.\n")
	sb.WriteString("- Do not assume the entire file is present in context; retrieve the needed sections when required.\n\n")
	sb.WriteString("## Tool Selection\n\n")
	sb.WriteString("- Call `initial` at session start — it includes project readiness, capabilities, and code intelligence rules.\n")
	sb.WriteString("- Use `help(\"tool.action\")` or `help(\"tool.*\")` for detailed per-action documentation on demand.\n")
	sb.WriteString("- Use Know-Me MCP tools first for tasks, docs, templates, validation, and time tracking.\n")
	sb.WriteString("- Use Know-Me `code` tools for code discovery, structure, and editing — not built-in Read/Grep/Edit.\n")
	sb.WriteString("- Use shell commands for git, tests, builds, generators, and other terminal operations.\n")
	sb.WriteString("- Prefer targeted retrieval over loading large files in full.\n")
	sb.WriteString("- Use `knowns search` for discovery and quick relevance checks.\n")
	sb.WriteString("- Use MCP `retrieve` tool when a workflow needs structured context with citations and context-pack assembly. Fall back to CLI `knowns retrieve` if MCP is unavailable.\n")
	sb.WriteString("- Prefer `--json` for structured CLI reads consumed by agents, scripts, or workflows, including `get`, `list`, `search`, and `retrieve` commands.\n")
	sb.WriteString("- Prefer `--plain` for human-facing inspection, quick content reads, and logs when JSON is unnecessary.\n")
	sb.WriteString("- Do not rely on styled default CLI output for automation or parsing.\n\n")
	sb.WriteString("### Preferred Tool Matrix\n\n")
	sb.WriteString("- `knowns_*`: canonical operations on tasks, docs, templates, validation, and time.\n")
	sb.WriteString("- `read`: inspect a known file.\n")
	sb.WriteString("- `glob`: find files by path pattern.\n")
	sb.WriteString("- `grep`: locate content by regex.\n")
	sb.WriteString("- `bash`: run git, builds, tests, package managers, or other terminal commands.\n")
	sb.WriteString("- `apply_patch`: make small, explicit file edits.\n")
	sb.WriteString("- `task`: delegate large research or multi-step exploration when useful.\n\n")
	sb.WriteString("## Memory Usage\n\n")
	sb.WriteString("- Session start: `memory({ action: \"list\", layer: \"project\" })` to load accumulated project knowledge.\n")
	sb.WriteString("- After task: use `memory({ action: \"add\" })` for reusable patterns and conventions; use the first-class Decision tool for durable project decisions.\n")
	sb.WriteString("- Cross-project: `memory({ action: \"promote\" })` to move project knowledge to global (`project→global`).\n")
	sb.WriteString("- Memory complements docs: memory is for fast agent recall, docs are for structured human-readable reference.\n")
	sb.WriteString("- Never duplicate the full doc content into memory — store a summary and reference the doc with `@doc/<path>`.\n")
	sb.WriteString("- During any skill: save reusable patterns, conventions, or failures with `memory({ action: \"add\", layer: \"project\" })`. Memory category `decision` is legacy; create a first-class System Decision instead.\n")
	sb.WriteString("- Proactively save durable memory without waiting for the user to say \"save this\" when confidence is high.\n")
	sb.WriteString("- Use `project` Memory for repo-specific patterns, conventions, recurring failures, and implementation context; use System Decisions for durable architecture or workflow choices.\n")
	sb.WriteString("- Use `global` for stable user preferences or workflow rules that should carry across repositories and future sessions.\n")
	sb.WriteString("- Ask the user only when the information appears durable but the correct scope (`working`, `project`, or `global`) is genuinely ambiguous.\n")
	sb.WriteString("- After any meaningful user instruction, correction, or newly discovered pattern, quickly evaluate whether it should be stored as memory and save it when appropriate.\n")
	sb.WriteString("- If the user states a stable collaboration preference, default to saving it as `global` memory unless they clearly scoped it to this repository only.\n\n")
	sb.WriteString("## Critical Rules\n\n")
	sb.WriteString("- Never manually edit Know-Me-managed task or doc markdown.\n")
	sb.WriteString("- Search first, then read only relevant docs and code.\n")
	sb.WriteString("- Follow `@task-<id>`, `@doc/<path>`, and `@template/<name>` references before acting.\n")
	sb.WriteString("- Use `appendNotes` for progress updates; `notes` replaces existing notes and should only be used intentionally.\n")
	sb.WriteString("- Validate before marking work complete.\n")
	sb.WriteString("- Use skills for detailed workflow execution instead of duplicating step-by-step process here.\n")
	sb.WriteString("- Compatibility shim files must stay lightweight and must direct agents to MCP `initial`/`help` first, with `KNOWNS.md` as fallback reference.\n\n")
	sb.WriteString("## Git Safety\n\n")
	sb.WriteString("- Assume the worktree may already contain user changes.\n")
	sb.WriteString("- Never revert or overwrite unrelated user changes unless explicitly requested.\n")
	sb.WriteString("- Avoid destructive git commands unless explicitly requested.\n")
	sb.WriteString("- Do not amend commits unless explicitly requested.\n")
	sb.WriteString("- Do not create commits unless the user explicitly asks for a commit.\n")
	sb.WriteString("- Do not push unless the user explicitly asks for it.\n\n")
	sb.WriteString("## Context Retrieval Strategy\n\n")
	sb.WriteString("- Treat `KNOWNS.md` as an indexed manual, not a required startup prompt or content to fully inject every time.\n")
	sb.WriteString("- Read in this order when context is limited:\n")
	sb.WriteString("  1. `## Source of Truth`\n")
	sb.WriteString("  2. `## TL;DR`\n")
	sb.WriteString("  3. The section most relevant to the task\n")
	sb.WriteString("- For large or complex tasks, retrieve additional sections on demand.\n")
	sb.WriteString("- Prefer section headings with stable names so tools can target them precisely.\n")
	sb.WriteString("- If a downstream runtime supports startup loading, preload only the top-level summary and fetch deeper sections lazily.\n\n")
	sb.WriteString("## References\n\n")
	sb.WriteString("- Task references use `@task-<id>`.\n")
	sb.WriteString("- Doc references use `@doc/<path>`.\n")
	sb.WriteString("- Template references use `@template/<name>`.\n")
	sb.WriteString("- Doc references support line and range suffixes:\n")
	sb.WriteString("  - `@doc/<path>:42` — link to a specific line.\n")
	sb.WriteString("  - `@doc/<path>:10-25` — link to a line range.\n")
	sb.WriteString("  - `@doc/<path>#heading-slug` — link to a heading anchor.\n")
	sb.WriteString("- Follow references recursively before planning, implementation, or validation work.\n\n")
	sb.WriteString("## Common Mistakes\n\n")
	sb.WriteString("### Notes vs Append Notes\n\n")
	sb.WriteString("- Use `appendNotes` for progress updates and audit trail entries.\n")
	sb.WriteString("- Use `notes` only when intentionally replacing the task's notes content.\n\n")
	sb.WriteString("### CLI Pitfalls\n\n")
	sb.WriteString("- In `task create` and `task edit`, `-a` means `--assignee`, not acceptance criteria.\n")
	sb.WriteString("- In `doc edit`, `-a` means `--append`.\n")
	sb.WriteString("- Use raw task IDs where a command expects an ID value rather than a mention.\n")
	sb.WriteString("- Use `--plain` for read, list, and search commands, not for create or edit commands.\n")
	sb.WriteString("- Use `--json` for structured reads like `get`, `list`, `search`, and `retrieve` when the output will be parsed or fed into an agent workflow.\n")
	sb.WriteString("- Use `--plain` when inspecting manually or when only clean text output is needed.\n")
	sb.WriteString("- Use `--smart` when reading docs through the CLI.\n\n")
	sb.WriteString("### Retrieval Pitfalls\n\n")
	sb.WriteString("- Do not read every doc hoping to find the answer; search first.\n")
	sb.WriteString("- Do not replace discovery-oriented `search` with `retrieve` by default; use `retrieve` only when you need assembled context, citations, or expansion metadata.\n")
	sb.WriteString("- Do not repeatedly list the same tasks or docs if the needed context is already loaded.\n")
	sb.WriteString("- Do not quote large file contents when a concise summary is enough.\n\n")
	sb.WriteString("## Recommended File Roles\n\n")
	sb.WriteString("- `KNOWNS.md`: human-readable repo-level reference and fallback.\n")
	sb.WriteString("- Compatibility shim files: lightweight entrypoints that introduce Know-Me and redirect runtimes to MCP `initial`/`help`.\n")
	sb.WriteString("- Other docs: deeper domain, feature, or workflow references.\n\n")
	sb.WriteString("## Compatibility Pattern\n\n")
	sb.WriteString("- Keep shim files short.\n")
	sb.WriteString("- In every shim file, explicitly say MCP `initial` is the primary bootstrap and `KNOWNS.md` is optional fallback/reference.\n")
	sb.WriteString("- Preserve the `<!-- KNOWNS GUIDELINES START -->` and `<!-- KNOWNS GUIDELINES END -->` markers in shim files so tooling can detect and sync them reliably.\n\n")
	sb.WriteString("## Maintenance Rules\n\n")
	sb.WriteString("- Update the Know-Me generator when the repository's operational rules change.\n")
	sb.WriteString("- Keep top sections stable so automated loaders can depend on them.\n")
	sb.WriteString("- Prefer adding new sections over bloating the TL;DR.\n")
	sb.WriteString("- Keep workflow details in skills and MCP `help` when possible; keep `KNOWNS.md` focused on human-readable rules, conventions, and routing.\n")

	return sb.String()
}

func renderCompatibilityInstructionContent(relativePath, platform, projectRoot string) string {
	projectName := filepath.Base(projectRoot)
	var sb strings.Builder
	sb.WriteString(fmt.Sprintf("# %s\n\n", compatibilityInstructionTitle(relativePath, platform, projectName)))
	sb.WriteString(fmt.Sprintf("Compatibility entrypoint for runtimes that auto-detect `%s`.\n\n", relativePath))
	sb.WriteString("<!-- KNOWNS GUIDELINES START -->\n\n")

	sb.WriteString("**CRITICAL: Start with Know-Me MCP `initial` when available. Use `help(\"tool.*\")` or `help(\"workflow.*\")` for domain details on demand.**\n\n")
	sb.WriteString("## Runtime Guidance\n\n")
	sb.WriteString("- Know-Me is the repository memory layer for humans and the AI-friendly working layer for agents.\n")
	sb.WriteString("- MCP `initial` is the primary AI bootstrap: project state, tool domains, code rules, and workflow routing.\n")
	sb.WriteString("- MCP `help` is the primary on-demand source for action schemas and recipes.\n")
	sb.WriteString("- Treat this file only as a lightweight compatibility entrypoint.\n\n")
	sb.WriteString("## Minimum Rules\n\n")
	sb.WriteString("- Use Know-Me as the canonical system for tasks, docs, templates, and workflow state.\n")
	sb.WriteString("- Never manually edit Know-Me-managed task or doc markdown.\n")
	sb.WriteString("- Search first, then read only relevant docs and code.\n")
	sb.WriteString("- Use `search` for discovery; use MCP `retrieve` tool when a workflow needs structured context with citations. Fall back to CLI `knowns retrieve` if MCP is unavailable.\n")
	sb.WriteString("- For code operations, use `code` tool: `find`/`symbols` for structure, `references`/`definition` for navigation, `rename`/`replace`/`replace_body`/`insert`/`delete` for editing. Use `help(\"code.*\")` or `help(\"workflow.code-edit\")` for details.\n")
	sb.WriteString("- Plan before implementation unless the user explicitly overrides that workflow.\n")
	sb.WriteString("- Validate before considering work complete.\n")
	sb.WriteString("- Use memory tools: `memory({ action: \"list\" })` at session start, `memory({ action: \"add\" })` after tasks for reusable knowledge.\n")
	sb.WriteString("- Proactively capture durable memory when scope and durability are clear.\n\n")
	sb.WriteString("## Quick Reference\n\n")
	sb.WriteString("```bash\n")
	sb.WriteString("knowns doc list --plain               # List docs\n")
	sb.WriteString("knowns task list --plain              # List tasks\n")
	sb.WriteString("knowns task <id> --plain              # View task\n")
	sb.WriteString("knowns doc \"<path>\" --plain --smart  # View doc\n")
	sb.WriteString("knowns search \"query\" --plain        # Search docs/tasks\n")
	sb.WriteString("knowns retrieve \"query\" --json      # Retrieve structured context pack (CLI fallback)\n")
	sb.WriteString("```\n\n")
	sb.WriteString("<!-- KNOWNS GUIDELINES END -->\n")
	return sb.String()
}

func compatibilityInstructionTitle(relativePath, platform, projectName string) string {
	switch relativePath {
	case "AGENTS.md":
		return "AGENTS"
	case "CLAUDE.md":
		return "CLAUDE"
	case "GEMINI.md":
		return "GEMINI"
	case "OPENCODE.md":
		return "OPENCODE"
	case filepath.Join(".github", "copilot-instructions.md"):
		return projectName + " - GitHub Copilot Instructions"
	default:
		return platform
	}
}

const (
	knownsGitignoreBegin = "# >>> KNOWNS >>>"
	knownsGitignoreEnd   = "# <<< KNOWNS <<<"
)

// writeKnownsGitignore creates .knowns/.gitignore with ignore rules based on
// the git tracking mode and per-section toggles. Also removes any legacy marker
// block from root .gitignore.
func writeKnownsGitignore(dir, mode string, tracking *models.GitTracking) error {
	// Remove legacy marker block from root .gitignore if present.
	removeLegacyGitignoreBlock(dir)

	knownsDir := filepath.Join(dir, ".knowns")
	gitignorePath := filepath.Join(knownsDir, ".gitignore")

	switch mode {
	case "git-tracked", "git-ignored":
		if err := os.MkdirAll(knownsDir, 0755); err != nil {
			return err
		}
	}

	// Resolve per-section tracking: explicit toggle > mode default.
	modeDefaults := models.GitTrackingModeDefaults(mode)
	gt := tracking
	if gt == nil {
		gt = &models.GitTracking{}
	}
	sectionTracked := func(section string) bool {
		var explicit *bool
		switch section {
		case "tasks":
			explicit = gt.Tasks
		case "docs":
			explicit = gt.Docs
		case "templates":
			explicit = gt.Templates
		case "memories":
			explicit = gt.Memories
		case "decisions":
			explicit = gt.Decisions
		}
		if explicit != nil {
			return *explicit
		}
		switch section {
		case "tasks":
			return *modeDefaults.Tasks
		case "docs":
			return *modeDefaults.Docs
		case "templates":
			return *modeDefaults.Templates
		case "memories":
			return *modeDefaults.Memories
		case "decisions":
			return *modeDefaults.Decisions
		}
		return false
	}

	switch mode {
	case "git-tracked":
		// Track all .knowns/ content; only ignore runtime/cache files and
		// sections explicitly disabled.
		var buf strings.Builder
		buf.WriteString("# Managed by Know-Me CLI — do not edit manually.\n")
		buf.WriteString("# Run 'knowns init' to regenerate.\n\n")
		buf.WriteString("# Runtime & cache\n")
		buf.WriteString(".search/\n")
		buf.WriteString(".working-memory/\n")
		buf.WriteString("runtime/\n")
		buf.WriteString("worktrees/\n")
		buf.WriteString(".server-port\n")
		buf.WriteString(".DS_Store\n")
		if !sectionTracked("tasks") {
			buf.WriteString("\n# Per-section tracking disabled\n")
			buf.WriteString("tasks/\n")
			buf.WriteString("tombstones/tasks/\n")
		}
		if !sectionTracked("docs") {
			buf.WriteString("docs/\n")
		}
		if !sectionTracked("templates") {
			buf.WriteString("templates/\n")
		}
		if !sectionTracked("memories") {
			buf.WriteString("memories/\n")
		}
		if !sectionTracked("decisions") {
			buf.WriteString("decisions/\n")
		}
		return os.WriteFile(gitignorePath, []byte(buf.String()), 0644)

	case "git-ignored":
		// Ignore everything by default, then un-ignore sections that are enabled.
		var buf strings.Builder
		buf.WriteString("# Managed by Know-Me CLI — do not edit manually.\n")
		buf.WriteString("# Run 'knowns init' to regenerate.\n\n")
		buf.WriteString("# Ignore everything by default\n")
		buf.WriteString("*\n\n")
		buf.WriteString("# Track these\n")
		buf.WriteString("!.gitignore\n")
		buf.WriteString("!config.json\n")
		if sectionTracked("docs") {
			buf.WriteString("!docs/\n")
			buf.WriteString("!docs/**\n")
		}
		if sectionTracked("templates") {
			buf.WriteString("!templates/\n")
			buf.WriteString("!templates/**\n")
		}
		if sectionTracked("tasks") {
			buf.WriteString("!tasks/\n")
			buf.WriteString("!tasks/**\n")
			buf.WriteString("!tombstones/\n")
			buf.WriteString("!tombstones/tasks/\n")
			buf.WriteString("!tombstones/tasks/**\n")
		}
		if sectionTracked("memories") {
			buf.WriteString("!memories/\n")
			buf.WriteString("!memories/**\n")
		}
		if sectionTracked("decisions") {
			buf.WriteString("!decisions/\n")
			buf.WriteString("!decisions/**\n")
		}
		return os.WriteFile(gitignorePath, []byte(buf.String()), 0644)

	case "none":
		// Remove .knowns/.gitignore if it exists.
		_ = os.Remove(gitignorePath)
		return nil
	}

	return nil
}

// removeLegacyGitignoreBlock removes the old marker-delimited Know-Me block
// from root .gitignore (migration from older versions).
func removeLegacyGitignoreBlock(dir string) {
	gitignorePath := filepath.Join(dir, ".gitignore")

	data, err := os.ReadFile(gitignorePath)
	if err != nil {
		return
	}

	existing := string(data)
	if !strings.Contains(existing, knownsGitignoreBegin) {
		return
	}

	var cleaned []string
	inside := false
	for _, line := range strings.Split(existing, "\n") {
		if strings.TrimSpace(line) == knownsGitignoreBegin {
			inside = true
			continue
		}
		if strings.TrimSpace(line) == knownsGitignoreEnd {
			inside = false
			continue
		}
		if !inside {
			cleaned = append(cleaned, line)
		}
	}

	// Trim trailing blank lines.
	for len(cleaned) > 0 && strings.TrimSpace(cleaned[len(cleaned)-1]) == "" {
		cleaned = cleaned[:len(cleaned)-1]
	}

	content := ""
	if len(cleaned) > 0 {
		content = strings.Join(cleaned, "\n") + "\n"
	}
	_ = os.WriteFile(gitignorePath, []byte(content), 0644)
}

func init() {
	initCmd.Flags().Bool("git-tracked", false, "Track .knowns/ files in git")
	initCmd.Flags().Bool("git-ignored", false, "Add .knowns/ to .gitignore")
	initCmd.Flags().Bool("wizard", false, "Run interactive setup wizard")
	initCmd.Flags().Bool("no-wizard", false, "Skip interactive prompts, use defaults")
	initCmd.Flags().BoolP("force", "f", false, "Force reinitialize even if already initialized")
	initCmd.Flags().Bool("open", false, "Launch Chat UI immediately after init")
	initCmd.Flags().Bool("no-open", false, "Skip the Chat UI launch prompt after init")

	rootCmd.AddCommand(initCmd)
}
