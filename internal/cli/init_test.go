package cli

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"

	"github.com/hoangtrung1801/known-me/internal/models"
	"github.com/hoangtrung1801/known-me/internal/registry"
	"github.com/hoangtrung1801/known-me/internal/runtimeinstall"
	"github.com/hoangtrung1801/known-me/internal/storage"
	"gopkg.in/yaml.v3"
)

func TestCreateOpenCodeConfigQuietCreatesConfig(t *testing.T) {
	execLookPath = func(string) (string, error) { return "/usr/local/bin/knownme", nil }
	t.Cleanup(func() { execLookPath = defaultExecLookPath })

	projectRoot := t.TempDir()

	if err := createOpenCodeConfigQuiet(projectRoot); err != nil {
		t.Fatalf("createOpenCodeConfigQuiet returned error: %v", err)
	}

	config := readJSONFile(t, filepath.Join(projectRoot, "opencode.json"))

	if got := config["$schema"]; got != "https://opencode.ai/config.json" {
		t.Fatalf("expected OpenCode schema, got %#v", got)
	}

	mcp := getMap(t, config, "mcp")
	knowns := getMap(t, mcp, "knowns")
	if got := knowns["type"]; got != "local" {
		t.Fatalf("expected knownme MCP type local, got %#v", got)
	}
	if got := knowns["enabled"]; got != true {
		t.Fatalf("expected knownme MCP enabled true, got %#v", got)
	}

	command, ok := knowns["command"].([]any)
	if !ok {
		t.Fatalf("expected knownme command to be []any, got %T", knowns["command"])
	}
	if len(command) != 3 {
		t.Fatalf("expected 3 command parts, got %d", len(command))
	}
	expected := []string{"knownme", "mcp", "--stdio"}
	for i, want := range expected {
		if command[i] != want {
			t.Fatalf("expected command[%d] = %q, got %#v", i, want, command[i])
		}
	}
}

func TestRunInitCreatesGlobalDefaultConfig(t *testing.T) {
	t.Setenv("KNOWN_LSP_AUTO_INSTALL", "0")
	home := t.TempDir()
	projectRoot := t.TempDir()
	oldWD, err := os.Getwd()
	if err != nil {
		t.Fatalf("getwd: %v", err)
	}
	defer func() { _ = os.Chdir(oldWD) }()
	if err := os.Chdir(projectRoot); err != nil {
		t.Fatalf("chdir: %v", err)
	}
	oldHome := os.Getenv("HOME")
	oldUserProfile := os.Getenv("USERPROFILE")
	if err := os.Setenv("HOME", home); err != nil {
		t.Fatalf("set HOME: %v", err)
	}
	if err := os.Setenv("USERPROFILE", home); err != nil {
		t.Fatalf("set USERPROFILE: %v", err)
	}
	t.Cleanup(func() {
		_ = os.Setenv("HOME", oldHome)
		_ = os.Setenv("USERPROFILE", oldUserProfile)
	})

	settingsPath := filepath.Join(home, ".known-me", "settings.json")
	if err := os.MkdirAll(filepath.Dir(settingsPath), 0755); err != nil {
		t.Fatalf("mkdir settings dir: %v", err)
	}
	writeJSONFile(t, settingsPath, map[string]any{
		"projectDefaults": map[string]any{
			"projectName": "global-default-project",
			"settings": map[string]any{
				"gitTrackingMode": "git-ignored",
				"platforms":       []string{"codex", "agents"},
				"enableChatUI":    false,
				"taskLifecycle": map[string]any{
					"autoArchive": false,
				},
			},
		},
	})

	execLookPath = func(string) (string, error) { return "", os.ErrNotExist }
	t.Cleanup(func() { execLookPath = defaultExecLookPath })
	setInitBoolFlag(t, "no-wizard", true)
	setInitBoolFlag(t, "no-open", true)
	setInitBoolFlag(t, "git-tracked", false)
	setInitBoolFlag(t, "git-ignored", false)
	setInitBoolFlag(t, "force", false)

	if err := runInit(initCmd, nil); err != nil {
		t.Fatalf("runInit returned error: %v", err)
	}

	config, err := storage.NewStore(storage.GlobalRootPath()).Config.Load()
	if err != nil || config.Name != filepath.Base(projectRoot) {
		t.Fatalf("global config = %#v, err = %v, want name %q", config, err, filepath.Base(projectRoot))
	}
	for _, path := range []string{"KNOWNS.md", "AGENTS.md", "CLAUDE.md", "GEMINI.md", "OPENCODE.md"} {
		if _, err := os.Stat(filepath.Join(projectRoot, path)); !os.IsNotExist(err) {
			t.Fatalf("expected %s not to be created, got err=%v", path, err)
		}
	}
	if _, err := os.Stat(filepath.Join(projectRoot, ".codex", "config.toml")); !os.IsNotExist(err) {
		t.Fatalf("expected init not to create project Codex config, got err=%v", err)
	}
	if _, err := os.Stat(filepath.Join(projectRoot, ".mcp.json")); !os.IsNotExist(err) {
		t.Fatalf("expected init not to create project MCP config, got err=%v", err)
	}
}

func TestRunInitRegistersNamedProject(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)
	t.Setenv("USERPROFILE", home)
	projectRoot := t.TempDir()
	t.Chdir(projectRoot)

	if err := runInit(initCmd, []string{"Launch"}); err != nil {
		t.Fatalf("runInit returned error: %v", err)
	}

	reg := registry.NewRegistryWithPath(filepath.Join(home, ".known-me", "registry.json"))
	if err := reg.Load(); err != nil {
		t.Fatalf("load registry: %v", err)
	}
	if len(reg.Projects) != 1 {
		t.Fatalf("projects = %#v, want one project", reg.Projects)
	}
	project := reg.Projects[0]
	if project.Name != "Launch" || len(project.ID) != 6 {
		t.Fatalf("project = %#v, want generated ID and name Launch", project)
	}
	wantRoot, err := filepath.EvalSymlinks(projectRoot)
	if err != nil {
		t.Fatal(err)
	}
	if project.Path != wantRoot {
		t.Fatalf("project path = %q, want %q", project.Path, wantRoot)
	}
	if active := reg.GetActive(); active == nil || active.ID != project.ID {
		t.Fatalf("active = %#v, want %q", active, project.ID)
	}
}

func TestRunInitWritesWorkspaceProjectLink(t *testing.T) {
	home, projectRoot := t.TempDir(), t.TempDir()
	t.Setenv("HOME", home)
	t.Setenv("USERPROFILE", home)
	t.Chdir(projectRoot)

	if err := runInit(initCmd, []string{"Launch"}); err != nil {
		t.Fatal(err)
	}

	link := readJSONFile(t, filepath.Join(projectRoot, ".known-me.json"))
	reg := registry.NewRegistryWithPath(filepath.Join(home, ".known-me", "registry.json"))
	if err := reg.Load(); err != nil {
		t.Fatal(err)
	}
	if len(reg.Projects) != 1 || link["projectId"] != reg.Projects[0].ID {
		t.Fatalf("link = %#v, projects = %#v", link, reg.Projects)
	}
	projectStore := storage.NewProjectStore(filepath.Join(home, ".known-me"), reg.Projects[0].ID, projectRoot)
	if _, err := projectStore.Config.Load(); err != nil {
		t.Fatalf("project config: %v", err)
	}
}

func TestRunInitDefaultsProjectNameToDirectory(t *testing.T) {
	home := t.TempDir()
	projectRoot := t.TempDir()
	t.Setenv("HOME", home)
	t.Setenv("USERPROFILE", home)
	t.Chdir(projectRoot)

	if err := runInit(initCmd, nil); err != nil {
		t.Fatalf("runInit returned error: %v", err)
	}

	reg := registry.NewRegistryWithPath(filepath.Join(home, ".known-me", "registry.json"))
	if err := reg.Load(); err != nil {
		t.Fatalf("load registry: %v", err)
	}
	if len(reg.Projects) != 1 || reg.Projects[0].Name != filepath.Base(projectRoot) {
		t.Fatalf("projects = %#v, want directory name %q", reg.Projects, filepath.Base(projectRoot))
	}
}

func TestRunInitRejectsExplicitBlankProjectName(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)
	t.Setenv("USERPROFILE", home)
	t.Chdir(t.TempDir())

	err := runInit(initCmd, []string{"  "})
	if err == nil || !strings.Contains(err.Error(), "project name is required") {
		t.Fatalf("runInit error = %v, want project name validation", err)
	}
	if _, statErr := os.Stat(filepath.Join(home, ".known-me", "registry.json")); !os.IsNotExist(statErr) {
		t.Fatalf("registry exists after rejected name, stat error = %v", statErr)
	}
}

func TestSettingsCommandSurface(t *testing.T) {
	if settingsCmd.Flags().Lookup("global") == nil {
		t.Fatalf("expected settings --global flag to be registered")
	}
	for _, child := range configCmd.Commands() {
		if child.Name() == "toggle" {
			t.Fatalf("knownme config toggle must not be registered")
		}
	}
}

func setInitBoolFlag(t *testing.T, name string, value bool) {
	t.Helper()
	flag := initCmd.Flags().Lookup(name)
	if flag == nil {
		t.Fatalf("missing init flag %q", name)
	}
	old := flag.Value.String()
	if err := initCmd.Flags().Set(name, strconv.FormatBool(value)); err != nil {
		t.Fatalf("set flag %s: %v", name, err)
	}
	t.Cleanup(func() { _ = initCmd.Flags().Set(name, old) })
}

func TestCreateMCPJsonFileQuietUsesNpxKnowns(t *testing.T) {
	execLookPath = func(string) (string, error) { return "/usr/local/bin/knownme", nil }
	t.Cleanup(func() { execLookPath = defaultExecLookPath })

	projectRoot := t.TempDir()

	if err := createMCPJsonFileQuiet(projectRoot, false); err != nil {
		t.Fatalf("createMCPJsonFileQuiet returned error: %v", err)
	}

	config := readJSONFile(t, filepath.Join(projectRoot, ".mcp.json"))
	mcpServers := getMap(t, config, "mcpServers")
	knowns := getMap(t, mcpServers, "knowns")

	if got := knowns["command"]; got != "knownme" {
		t.Fatalf("expected command knowns, got %#v", got)
	}

	args, ok := knowns["args"].([]any)
	if !ok {
		t.Fatalf("expected args to be []any, got %T", knowns["args"])
	}
	expected := []string{"mcp", "--stdio"}
	if len(args) != len(expected) {
		t.Fatalf("expected %d args, got %d", len(expected), len(args))
	}
	for i, want := range expected {
		if args[i] != want {
			t.Fatalf("expected args[%d] = %q, got %#v", i, want, args[i])
		}
	}
}

func TestCreateOpenCodeConfigQuietMergesExistingConfig(t *testing.T) {
	projectRoot := t.TempDir()
	configPath := filepath.Join(projectRoot, "opencode.json")

	existing := map[string]any{
		"model": "anthropic/claude-sonnet-4-5",
		"tools": map[string]any{
			"bash": "ask",
		},
		"mcp": map[string]any{
			"context7": map[string]any{
				"type": "remote",
				"url":  "https://mcp.context7.com/mcp",
			},
		},
	}

	writeJSONFile(t, configPath, existing)

	if err := createOpenCodeConfigQuiet(projectRoot); err != nil {
		t.Fatalf("createOpenCodeConfigQuiet returned error: %v", err)
	}

	config := readJSONFile(t, configPath)
	if got := config["model"]; got != existing["model"] {
		t.Fatalf("expected existing model to be preserved, got %#v", got)
	}

	tools := getMap(t, config, "tools")
	if got := tools["bash"]; got != "ask" {
		t.Fatalf("expected existing tools to be preserved, got %#v", got)
	}

	mcp := getMap(t, config, "mcp")
	if _, ok := mcp["context7"]; !ok {
		t.Fatalf("expected existing MCP entry to be preserved")
	}
	if _, ok := mcp["knowns"]; !ok {
		t.Fatalf("expected knownme MCP entry to be added")
	}
}

func TestCreateCursorMCPConfigQuietCreatesConfig(t *testing.T) {
	execLookPath = func(string) (string, error) { return "/usr/local/bin/knownme", nil }
	t.Cleanup(func() { execLookPath = defaultExecLookPath })

	projectRoot := t.TempDir()

	if err := createCursorMCPConfigQuiet(projectRoot); err != nil {
		t.Fatalf("createCursorMCPConfigQuiet returned error: %v", err)
	}

	config := readJSONFile(t, filepath.Join(projectRoot, ".cursor", "mcp.json"))
	mcpServers := getMap(t, config, "mcpServers")
	knowns := getMap(t, mcpServers, "knowns")

	if got := knowns["command"]; got != "knownme" {
		t.Fatalf("expected command knowns, got %#v", got)
	}

	args, ok := knowns["args"].([]any)
	if !ok {
		t.Fatalf("expected args to be []any, got %T", knowns["args"])
	}
	expected := []string{"mcp", "--stdio"}
	if len(args) != len(expected) {
		t.Fatalf("expected %d args, got %d", len(expected), len(args))
	}
	for i, want := range expected {
		if args[i] != want {
			t.Fatalf("expected args[%d] = %q, got %#v", i, want, args[i])
		}
	}
}

func TestCreateCodexMCPConfigQuietCreatesConfig(t *testing.T) {
	execLookPath = func(string) (string, error) { return "/usr/local/bin/knownme", nil }
	t.Cleanup(func() { execLookPath = defaultExecLookPath })

	projectRoot := t.TempDir()

	if err := createCodexMCPConfigQuiet(projectRoot); err != nil {
		t.Fatalf("createCodexMCPConfigQuiet returned error: %v", err)
	}

	content := readTextFile(t, filepath.Join(projectRoot, ".codex", "config.toml"))
	assertContains(t, content, "[mcp_servers.knowns]")
	assertContains(t, content, `command = "knownme"`)
	assertContains(t, content, `args = ["mcp", "--stdio"]`)
}

func TestCreateCodexMCPConfigQuietMergesExistingConfig(t *testing.T) {
	execLookPath = func(string) (string, error) { return "/usr/local/bin/knownme", nil }
	t.Cleanup(func() { execLookPath = defaultExecLookPath })

	projectRoot := t.TempDir()
	configDir := filepath.Join(projectRoot, ".codex")
	if err := os.MkdirAll(configDir, 0755); err != nil {
		t.Fatalf("mkdir .codex: %v", err)
	}
	configPath := filepath.Join(configDir, "config.toml")
	seed := strings.Join([]string{
		"model = \"gpt-5.4\"",
		"",
		"[features]",
		"codex_hooks = true",
	}, "\n") + "\n"
	if err := os.WriteFile(configPath, []byte(seed), 0644); err != nil {
		t.Fatalf("seed config.toml: %v", err)
	}

	if err := createCodexMCPConfigQuiet(projectRoot); err != nil {
		t.Fatalf("createCodexMCPConfigQuiet returned error: %v", err)
	}

	content := readTextFile(t, configPath)
	assertContains(t, content, `model = "gpt-5.4"`)
	assertContains(t, content, `[features]`)
	assertNotContains(t, content, `hooks = true`)
	assertNotContains(t, content, `codex_hooks`)
	assertContains(t, content, `[mcp_servers.knowns]`)
	assertContains(t, content, `args = ["mcp", "--stdio"]`)
}

func TestCreateAntigravityRulesQuietCreatesRuleFile(t *testing.T) {
	projectRoot := t.TempDir()

	if err := createAntigravityRulesQuiet(projectRoot, false); err != nil {
		t.Fatalf("createAntigravityRulesQuiet returned error: %v", err)
	}

	content := readTextFile(t, filepath.Join(projectRoot, ".agents", "rules", "knowns.md"))
	assertContains(t, content, "trigger: always_on")
	assertContains(t, content, "Start with Know-Me MCP `initial`")
	assertContains(t, content, "Prefer Know-Me MCP tools")
	assertContains(t, content, "`knownme`")
}

func TestCreateAntigravityMCPConfigQuietUsesAbsoluteProjectPath(t *testing.T) {
	execLookPath = func(string) (string, error) { return "/usr/local/bin/knownme", nil }
	home := t.TempDir()
	osUserHomeDir = func() (string, error) { return home, nil }
	t.Cleanup(func() {
		execLookPath = defaultExecLookPath
		osUserHomeDir = os.UserHomeDir
	})

	projectRoot := t.TempDir()

	if err := createAntigravityMCPConfigQuiet(projectRoot); err != nil {
		t.Fatalf("createAntigravityMCPConfigQuiet returned error: %v", err)
	}

	config := readJSONFile(t, filepath.Join(home, ".gemini", "antigravity", "mcp_config.json"))
	mcpServers := getMap(t, config, "mcpServers")
	knowns := getMap(t, mcpServers, "knowns")

	if got := knowns["command"]; got != "knownme" {
		t.Fatalf("expected command knowns, got %#v", got)
	}

	args, ok := knowns["args"].([]any)
	if !ok {
		t.Fatalf("expected args to be []any, got %T", knowns["args"])
	}
	expected := []string{"mcp", "--stdio", "--project", projectRoot}
	if len(args) != len(expected) {
		t.Fatalf("expected %d args, got %d", len(expected), len(args))
	}
	for i, want := range expected {
		if args[i] != want {
			t.Fatalf("expected args[%d] = %q, got %#v", i, want, args[i])
		}
	}
}

func TestCreateHermesMCPConfigQuietUsesAbsoluteProjectPathAndSkills(t *testing.T) {
	execLookPath = func(string) (string, error) { return "/usr/local/bin/knownme", nil }
	home := t.TempDir()
	osUserHomeDir = func() (string, error) { return home, nil }
	t.Cleanup(func() {
		execLookPath = defaultExecLookPath
		osUserHomeDir = os.UserHomeDir
	})

	projectRoot := t.TempDir()

	if err := createHermesMCPConfigQuiet(projectRoot); err != nil {
		t.Fatalf("createHermesMCPConfigQuiet returned error: %v", err)
	}

	config := readYAMLFile(t, filepath.Join(home, ".hermes", "config.yaml"))
	mcpServers := getMap(t, config, "mcp_servers")
	knowns := getMap(t, mcpServers, "knowns")

	if got := knowns["command"]; got != "knownme" {
		t.Fatalf("expected command knowns, got %#v", got)
	}

	args := anyStringSlice(knowns["args"])
	expected := []string{"mcp", "--stdio", "--project", projectRoot}
	if !sameStrings(args, expected) {
		t.Fatalf("expected args %v, got %v", expected, args)
	}

	skills := getMap(t, config, "skills")
	externalDirs := anyStringSlice(skills["external_dirs"])
	expectedSkillDir := filepath.Join(projectRoot, ".agents", "skills")
	if !sameStrings(externalDirs, []string{expectedSkillDir}) {
		t.Fatalf("expected external_dirs %v, got %v", []string{expectedSkillDir}, externalDirs)
	}
}

func TestSetupGlobalHermesMCPUsesGlobalSkillsWithoutProject(t *testing.T) {
	execLookPath = func(string) (string, error) { return "/usr/local/bin/knownme", nil }
	t.Cleanup(func() { execLookPath = defaultExecLookPath })

	home := t.TempDir()
	if err := setupGlobalHermesMCP(home); err != nil {
		t.Fatalf("setupGlobalHermesMCP returned error: %v", err)
	}

	config := readYAMLFile(t, filepath.Join(home, ".hermes", "config.yaml"))
	mcpServers := getMap(t, config, "mcp_servers")
	knowns := getMap(t, mcpServers, "knowns")
	args := anyStringSlice(knowns["args"])
	expected := []string{"mcp", "--stdio"}
	if !sameStrings(args, expected) {
		t.Fatalf("expected args %v, got %v", expected, args)
	}

	skills := getMap(t, config, "skills")
	externalDirs := anyStringSlice(skills["external_dirs"])
	expectedSkillDir := filepath.Join(home, ".agents", "skills")
	if !sameStrings(externalDirs, []string{expectedSkillDir}) {
		t.Fatalf("expected external_dirs %v, got %v", []string{expectedSkillDir}, externalDirs)
	}
}

func TestRunSyncPlatformConfigsSkipsWhenPlatformsUnset(t *testing.T) {
	projectRoot := t.TempDir()
	home := t.TempDir()
	execLookPath = func(string) (string, error) { return "/usr/local/bin/knownme", nil }
	osUserHomeDir = func() (string, error) { return home, nil }
	t.Cleanup(func() {
		execLookPath = defaultExecLookPath
		osUserHomeDir = os.UserHomeDir
	})

	if err := runSyncPlatformConfigs(projectRoot, true, nil); err != nil {
		t.Fatalf("runSyncPlatformConfigs returned error: %v", err)
	}

	if _, err := os.Stat(filepath.Join(projectRoot, ".cursor", "mcp.json")); !os.IsNotExist(err) {
		t.Fatalf("expected .cursor/mcp.json not to be created, got err=%v", err)
	}
	if _, err := os.Stat(filepath.Join(projectRoot, ".agents", "rules", "knowns.md")); !os.IsNotExist(err) {
		t.Fatalf("expected .agents/rules/knowns.md not to be created, got err=%v", err)
	}
	if _, err := os.Stat(filepath.Join(home, ".gemini", "antigravity", "mcp_config.json")); !os.IsNotExist(err) {
		t.Fatalf("expected antigravity MCP config not to be created, got err=%v", err)
	}
	if _, err := os.Stat(filepath.Join(home, ".hermes", "config.yaml")); !os.IsNotExist(err) {
		t.Fatalf("expected hermes MCP config not to be created, got err=%v", err)
	}
}

func TestRunSyncPlatformConfigsCreatesCursorHermesAndAntigravityArtifacts(t *testing.T) {
	projectRoot := t.TempDir()
	home := t.TempDir()
	execLookPath = func(string) (string, error) { return "/usr/local/bin/knownme", nil }
	osUserHomeDir = func() (string, error) { return home, nil }
	t.Cleanup(func() {
		execLookPath = defaultExecLookPath
		osUserHomeDir = os.UserHomeDir
	})

	platforms := []string{"cursor", "hermes", "antigravity"}
	if err := runSyncPlatformConfigs(projectRoot, true, platforms); err != nil {
		t.Fatalf("runSyncPlatformConfigs returned error: %v", err)
	}

	_ = readJSONFile(t, filepath.Join(projectRoot, ".cursor", "mcp.json"))
	hermesConfig := readYAMLFile(t, filepath.Join(home, ".hermes", "config.yaml"))
	hermesKnowns := getMap(t, getMap(t, hermesConfig, "mcp_servers"), "knowns")
	if got := anyStringSlice(hermesKnowns["args"]); !sameStrings(got, []string{"mcp", "--stdio", "--project", projectRoot}) {
		t.Fatalf("unexpected hermes args: %v", got)
	}
	assertContains(t, readTextFile(t, filepath.Join(projectRoot, ".agents", "rules", "knowns.md")), "trigger: always_on")
	config := readJSONFile(t, filepath.Join(home, ".gemini", "antigravity", "mcp_config.json"))
	mcpServers := getMap(t, config, "mcpServers")
	knowns := getMap(t, mcpServers, "knowns")
	args, ok := knowns["args"].([]any)
	if !ok {
		t.Fatalf("expected args to be []any, got %T", knowns["args"])
	}
	expected := []string{"mcp", "--stdio", "--project", projectRoot}
	if len(args) != len(expected) {
		t.Fatalf("expected %d args, got %d", len(expected), len(args))
	}
	for i, want := range expected {
		if args[i] != want {
			t.Fatalf("expected args[%d] = %q, got %#v", i, want, args[i])
		}
	}
}

func TestResolveSyncPlatformTargets(t *testing.T) {
	tests := []struct {
		name      string
		platform  string
		config    []string
		want      []string
		wantError bool
	}{
		{name: "config defaults", platform: "", config: []string{"cursor"}, want: []string{"cursor"}},
		{name: "codex override", platform: "codex", config: []string{"agents"}, want: []string{"codex"}},
		{name: "cursor override", platform: "cursor", config: []string{"agents"}, want: []string{"cursor"}},
		{name: "hermes override", platform: "hermes", config: []string{"agents"}, want: []string{"hermes"}},
		{name: "antigravity override", platform: "antigravity", config: nil, want: []string{"antigravity"}},
		{name: "instruction-only platform returns none", platform: "claude", config: []string{"claude-code"}, want: nil},
		{name: "unknown platform errors", platform: "unknown", config: nil, wantError: true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := resolveSyncPlatformTargets(tt.platform, tt.config)
			if tt.wantError {
				if err == nil {
					t.Fatalf("expected error, got nil")
				}
				return
			}
			if err != nil {
				t.Fatalf("resolveSyncPlatformTargets returned error: %v", err)
			}
			if len(got) != len(tt.want) {
				t.Fatalf("expected %d targets, got %d (%v)", len(tt.want), len(got), got)
			}
			for i, want := range tt.want {
				if got[i] != want {
					t.Fatalf("expected target[%d] = %q, got %q", i, want, got[i])
				}
			}
		})
	}
}

func TestResolveSyncPlatformSelection(t *testing.T) {
	tests := []struct {
		name      string
		platform  string
		config    []string
		want      []string
		wantError bool
	}{
		{name: "config defaults", platform: "", config: []string{"codex", "agents"}, want: []string{"codex", "agents"}},
		{name: "claude alias", platform: "claude", config: nil, want: []string{"claude-code"}},
		{name: "codex target", platform: "codex", config: []string{"agents"}, want: []string{"codex"}},
		{name: "hermes target", platform: "hermes", config: []string{"agents"}, want: []string{"hermes"}},
		{name: "all target", platform: "all", config: nil, want: allPlatformIDs},
		{name: "unknown platform errors", platform: "unknown", config: nil, wantError: true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := resolveSyncPlatformSelection(tt.platform, tt.config)
			if tt.wantError {
				if err == nil {
					t.Fatalf("expected error, got nil")
				}
				return
			}
			if err != nil {
				t.Fatalf("resolveSyncPlatformSelection returned error: %v", err)
			}
			if len(got) != len(tt.want) {
				t.Fatalf("expected %d targets, got %d (%v)", len(tt.want), len(got), got)
			}
			for i, want := range tt.want {
				if got[i] != want {
					t.Fatalf("expected target[%d] = %q, got %q", i, want, got[i])
				}
			}
		})
	}
}

func TestRunSyncInstructionsCreatesAgentsForCodexConfig(t *testing.T) {
	projectRoot := t.TempDir()

	if err := runSyncInstructions(projectRoot, "", true, []string{"codex"}); err != nil {
		t.Fatalf("runSyncInstructions returned error: %v", err)
	}

	if _, err := os.Stat(filepath.Join(projectRoot, "AGENTS.md")); err != nil {
		t.Fatalf("expected AGENTS.md to be created for codex config: %v", err)
	}
	if _, err := os.Stat(filepath.Join(projectRoot, "CLAUDE.md")); !os.IsNotExist(err) {
		t.Fatalf("expected CLAUDE.md not to be created for codex-only sync, got err=%v", err)
	}
}

func TestRunSyncInstructionsCreatesAgentsForCodexPlatform(t *testing.T) {
	projectRoot := t.TempDir()

	if err := runSyncInstructions(projectRoot, "codex", true, nil); err != nil {
		t.Fatalf("runSyncInstructions returned error: %v", err)
	}

	if _, err := os.Stat(filepath.Join(projectRoot, "AGENTS.md")); err != nil {
		t.Fatalf("expected AGENTS.md to be created for --platform codex: %v", err)
	}
	if _, err := os.Stat(filepath.Join(projectRoot, "CLAUDE.md")); !os.IsNotExist(err) {
		t.Fatalf("expected CLAUDE.md not to be created for --platform codex, got err=%v", err)
	}
}

func TestRunSyncInstructionsCreatesAgentsForHermesPlatform(t *testing.T) {
	projectRoot := t.TempDir()

	if err := runSyncInstructions(projectRoot, "hermes", true, nil); err != nil {
		t.Fatalf("runSyncInstructions returned error: %v", err)
	}

	if _, err := os.Stat(filepath.Join(projectRoot, "AGENTS.md")); err != nil {
		t.Fatalf("expected AGENTS.md to be created for --platform hermes: %v", err)
	}
	if _, err := os.Stat(filepath.Join(projectRoot, "CLAUDE.md")); !os.IsNotExist(err) {
		t.Fatalf("expected CLAUDE.md not to be created for --platform hermes, got err=%v", err)
	}
}

func TestSyncAntigravityMCPConfigUpdatesCommandAndProject(t *testing.T) {
	home := t.TempDir()
	osUserHomeDir = func() (string, error) { return home, nil }
	t.Cleanup(func() { osUserHomeDir = os.UserHomeDir })

	projectRoot := t.TempDir()
	configPath := filepath.Join(home, ".gemini", "antigravity", "mcp_config.json")
	if err := os.MkdirAll(filepath.Dir(configPath), 0755); err != nil {
		t.Fatalf("mkdir antigravity dir: %v", err)
	}
	writeJSONFile(t, configPath, map[string]any{
		"mcpServers": map[string]any{
			"knowns": map[string]any{
				"command": "npx",
				"args":    []string{"-y", "knowns", "mcp", "--stdio"},
			},
		},
	})

	updated, err := syncAntigravityMCPConfig(projectRoot, "knownme", []string{"mcp", "--stdio"})
	if err != nil {
		t.Fatalf("syncAntigravityMCPConfig returned error: %v", err)
	}
	if updated != 1 {
		t.Fatalf("expected updated=1, got %d", updated)
	}

	config := readJSONFile(t, configPath)
	mcpServers := getMap(t, config, "mcpServers")
	knowns := getMap(t, mcpServers, "knowns")
	if got := knowns["command"]; got != "knownme" {
		t.Fatalf("expected command knowns, got %#v", got)
	}
	args, ok := knowns["args"].([]any)
	if !ok {
		t.Fatalf("expected args to be []any, got %T", knowns["args"])
	}
	expected := []string{"mcp", "--stdio", "--project", projectRoot}
	if len(args) != len(expected) {
		t.Fatalf("expected %d args, got %d", len(expected), len(args))
	}
	for i, want := range expected {
		if args[i] != want {
			t.Fatalf("expected args[%d] = %q, got %#v", i, want, args[i])
		}
	}
}

func TestSyncCodexMCPConfigUpdatesCommand(t *testing.T) {
	projectRoot := t.TempDir()
	configDir := filepath.Join(projectRoot, ".codex")
	if err := os.MkdirAll(configDir, 0755); err != nil {
		t.Fatalf("mkdir .codex: %v", err)
	}
	configPath := filepath.Join(configDir, "config.toml")
	seed := strings.Join([]string{
		"[mcp_servers.knowns]",
		`command = "npx"`,
		`args = ["-y", "knowns", "mcp", "--stdio"]`,
	}, "\n") + "\n"
	if err := os.WriteFile(configPath, []byte(seed), 0644); err != nil {
		t.Fatalf("seed config.toml: %v", err)
	}

	updated, err := syncCodexMCPConfig(projectRoot, "knownme", []string{"mcp", "--stdio"})
	if err != nil {
		t.Fatalf("syncCodexMCPConfig returned error: %v", err)
	}
	if updated != 1 {
		t.Fatalf("expected updated=1, got %d", updated)
	}

	content := readTextFile(t, configPath)
	assertContains(t, content, `command = "knownme"`)
	assertContains(t, content, `args = ["mcp", "--stdio"]`)
	assertNotContains(t, content, `command = "npx"`)
}

func TestCreateInstructionFilesQuietIncludesOpenCode(t *testing.T) {
	projectRoot := t.TempDir()

	if err := createInstructionFilesQuiet(projectRoot, false); err != nil {
		t.Fatalf("createInstructionFilesQuiet returned error: %v", err)
	}

	if _, err := os.Stat(filepath.Join(projectRoot, "OPENCODE.md")); err != nil {
		t.Fatalf("expected OPENCODE.md to be created: %v", err)
	}
}

func TestCreateInstructionFilesForCodexCreatesAgentsShimOnly(t *testing.T) {
	projectRoot := t.TempDir()

	if err := createInstructionFilesForPlatforms(projectRoot, false, []string{"codex"}); err != nil {
		t.Fatalf("createInstructionFilesForPlatforms returned error: %v", err)
	}

	assertContains(t, readTextFile(t, filepath.Join(projectRoot, "KNOWNS.md")), "# KNOWNS")
	assertContains(t, readTextFile(t, filepath.Join(projectRoot, "AGENTS.md")), "Compatibility entrypoint")
	if _, err := os.Stat(filepath.Join(projectRoot, "CLAUDE.md")); !os.IsNotExist(err) {
		t.Fatalf("expected CLAUDE.md not to be created for codex-only instructions, got err=%v", err)
	}
}

func TestRenderCanonicalInstructionContentIncludesProactiveMemoryRules(t *testing.T) {
	content := renderCanonicalInstructionContent()

	assertContains(t, content, "- Proactively save durable memory without waiting for the user to say \"save this\" when confidence is high.")
	assertContains(t, content, "- Use `global` for stable user preferences or workflow rules that should carry across repositories and future sessions.")
	assertContains(t, content, "- If the user states a stable collaboration preference, default to saving it as `global` memory unless they clearly scoped it to this repository only.")
	assertContains(t, content, "- Compatibility shim files must stay lightweight and must direct agents to MCP `initial`/`help` first, with `KNOWNS.md` as fallback reference.")
}

func TestRenderCompatibilityInstructionContentUsesMCPBootstrap(t *testing.T) {
	content := renderCompatibilityInstructionContent("AGENTS.md", "Generic AI", "/tmp/example-project")

	assertContains(t, content, "Start with Know-Me MCP `initial`")
	assertNotContains(t, content, "KNOWNS.md")
	assertContains(t, content, "- Proactively capture durable memory when scope and durability are clear.")
}

func TestPlatformLabelUsesUnifiedRuntimeArtifactSummary(t *testing.T) {
	label := platformLabel("opencode")
	if !strings.Contains(label, "plugin") {
		t.Fatalf("expected OpenCode label to include plugin artifact summary, got %q", label)
	}
	label = platformLabel("codex")
	if !strings.Contains(label, ".codex/config.toml") {
		t.Fatalf("expected Codex label to include config artifact summary, got %q", label)
	}
}

func TestRuntimeInstallHelpersExposeAvailabilitySummary(t *testing.T) {
	opts := runtimeinstall.Options{
		HomeDir:        t.TempDir(),
		ExecutablePath: "/usr/local/bin/knownme",
		LookPath: func(name string) (string, error) {
			if name == "claude" {
				return "/usr/local/bin/claude", nil
			}
			return "", os.ErrNotExist
		},
	}
	if got := runtimeinstall.RuntimeAvailabilitySummary("claude-code", opts); got != "available" {
		t.Fatalf("RuntimeAvailabilitySummary = %q, want available", got)
	}
	if got := runtimeinstall.RuntimePickerDescription("opencode", opts); !strings.Contains(strings.ToLower(got), "install") {
		t.Fatalf("expected install-oriented OpenCode description, got %q", got)
	}
}

func TestWriteKnownsGitignoreGitIgnoredTracksKnowledgeSections(t *testing.T) {
	dir := t.TempDir()
	rootGitignorePath := filepath.Join(dir, ".gitignore")

	if err := os.WriteFile(rootGitignorePath, []byte("bin/\n"), 0644); err != nil {
		t.Fatalf("seed .gitignore: %v", err)
	}

	if err := writeKnownsGitignore(dir, "git-ignored", nil); err != nil {
		t.Fatalf("writeKnownsGitignore returned error: %v", err)
	}

	// Root .gitignore should be unchanged (no legacy block to remove).
	rootContent := readTextFile(t, rootGitignorePath)
	if rootContent != "bin/\n" {
		t.Fatalf("root .gitignore modified unexpectedly:\n%s", rootContent)
	}

	// .known-me/.gitignore should ignore everything except tracked dirs.
	knownsGitignore := filepath.Join(dir, ".known-me", ".gitignore")
	content := readTextFile(t, knownsGitignore)
	assertContains(t, content, "*")
	assertContains(t, content, "!docs/")
	assertContains(t, content, "!docs/**")
	assertContains(t, content, "!templates/")
	assertContains(t, content, "!templates/**")
	assertContains(t, content, "!tasks/")
	assertContains(t, content, "!tasks/**")
	assertContains(t, content, "!tombstones/")
	assertContains(t, content, "!tombstones/tasks/")
	assertContains(t, content, "!tombstones/tasks/**")
	assertContains(t, content, "!decisions/")
	assertContains(t, content, "!decisions/**")
	assertContains(t, content, "!config.json")
	assertNotContains(t, content, "!memories/")
}

func TestWriteKnownsGitignoreGitTrackedRemovesManagedBlock(t *testing.T) {
	dir := t.TempDir()
	rootGitignorePath := filepath.Join(dir, ".gitignore")
	seed := strings.Join([]string{
		"bin/",
		knownsGitignoreBegin,
		".known-me/*",
		"!.known-me/docs/**",
		knownsGitignoreEnd,
		"tmp/",
	}, "\n") + "\n"

	if err := os.WriteFile(rootGitignorePath, []byte(seed), 0644); err != nil {
		t.Fatalf("seed .gitignore: %v", err)
	}

	if err := writeKnownsGitignore(dir, "git-tracked", nil); err != nil {
		t.Fatalf("writeKnownsGitignore returned error: %v", err)
	}

	// Legacy block should be removed from root .gitignore.
	rootContent := readTextFile(t, rootGitignorePath)
	if want := "bin/\ntmp/\n"; rootContent != want {
		t.Fatalf("unexpected root .gitignore content:\nwant:\n%s\n got:\n%s", want, rootContent)
	}

	// .known-me/.gitignore should contain runtime/cache ignores.
	knownsGitignore := filepath.Join(dir, ".known-me", ".gitignore")
	content := readTextFile(t, knownsGitignore)
	assertContains(t, content, ".search/")
	assertContains(t, content, "runtime/")
	assertContains(t, content, ".server-port")
}

func TestWriteKnownsGitignoreNoneLeavesGitignoreUnmanaged(t *testing.T) {
	dir := t.TempDir()
	gitignorePath := filepath.Join(dir, ".gitignore")
	seed := strings.Join([]string{
		"bin/",
		knownsGitignoreBegin,
		".known-me/*",
		"!.known-me/docs/**",
		knownsGitignoreEnd,
	}, "\n") + "\n"

	if err := os.WriteFile(gitignorePath, []byte(seed), 0644); err != nil {
		t.Fatalf("seed .gitignore: %v", err)
	}

	if err := writeKnownsGitignore(dir, "none", nil); err != nil {
		t.Fatalf("writeKnownsGitignore returned error: %v", err)
	}

	content := readTextFile(t, gitignorePath)
	if want := "bin/\n"; content != want {
		t.Fatalf("unexpected .gitignore content:\nwant:\n%s\n got:\n%s", want, content)
	}
}

func readJSONFile(t *testing.T, path string) map[string]any {
	t.Helper()

	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read file %s: %v", path, err)
	}

	var result map[string]any
	if err := json.Unmarshal(data, &result); err != nil {
		t.Fatalf("unmarshal file %s: %v", path, err)
	}

	return result
}

func readYAMLFile(t *testing.T, path string) map[string]any {
	t.Helper()

	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read file %s: %v", path, err)
	}

	var result map[string]any
	if err := yaml.Unmarshal(data, &result); err != nil {
		t.Fatalf("unmarshal file %s: %v", path, err)
	}

	return result
}

func writeJSONFile(t *testing.T, path string, value map[string]any) {
	t.Helper()

	data, err := json.MarshalIndent(value, "", "  ")
	if err != nil {
		t.Fatalf("marshal JSON: %v", err)
	}

	if err := os.WriteFile(path, append(data, '\n'), 0644); err != nil {
		t.Fatalf("write file %s: %v", path, err)
	}
}

func getMap(t *testing.T, value map[string]any, key string) map[string]any {
	t.Helper()

	result, ok := value[key].(map[string]any)
	if !ok {
		t.Fatalf("expected %q to be map[string]any, got %T", key, value[key])
	}

	return result
}

func readTextFile(t *testing.T, path string) string {
	t.Helper()

	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read file %s: %v", path, err)
	}

	return string(data)
}

func assertContains(t *testing.T, content, want string) {
	t.Helper()

	if !strings.Contains(content, want) {
		t.Fatalf("expected content to contain %q, got:\n%s", want, content)
	}
}

func TestWriteKnownsGitignoreTrackedWithExplicitDisabled(t *testing.T) {
	dir := t.TempDir()

	trackDocs := false
	trackMemories := true
	trackDecisions := false
	tracking := &models.GitTracking{
		Docs:      &trackDocs,
		Memories:  &trackMemories,
		Decisions: &trackDecisions,
	}

	if err := writeKnownsGitignore(dir, "git-tracked", tracking); err != nil {
		t.Fatalf("writeKnownsGitignore returned error: %v", err)
	}

	content := readTextFile(t, filepath.Join(dir, ".known-me", ".gitignore"))

	assertContains(t, content, "docs/")
	assertContains(t, content, "decisions/")
	assertNotContains(t, content, "memories/")
	assertNotContains(t, content, "tasks/")
	assertNotContains(t, content, "templates/")
}

func TestWriteKnownsGitignoreIgnoredWithDisabledDocs(t *testing.T) {
	dir := t.TempDir()

	trackDocs := false
	tracking := &models.GitTracking{
		Docs: &trackDocs,
	}

	if err := writeKnownsGitignore(dir, "git-ignored", tracking); err != nil {
		t.Fatalf("writeKnownsGitignore returned error: %v", err)
	}

	content := readTextFile(t, filepath.Join(dir, ".known-me", ".gitignore"))

	assertNotContains(t, content, "!docs/")
	assertContains(t, content, "!tasks/")
	assertContains(t, content, "!templates/")
	assertContains(t, content, "!decisions/")
}

func TestWriteKnownsGitignoreTaskToggleControlsTaskTombstones(t *testing.T) {
	dir := t.TempDir()
	trackTasks := false
	tracking := &models.GitTracking{Tasks: &trackTasks}

	if err := writeKnownsGitignore(dir, "git-ignored", tracking); err != nil {
		t.Fatalf("writeKnownsGitignore git-ignored: %v", err)
	}
	content := readTextFile(t, filepath.Join(dir, ".known-me", ".gitignore"))
	assertNotContains(t, content, "!tasks/")
	assertNotContains(t, content, "!tombstones/")
	assertNotContains(t, content, "!tombstones/tasks/")

	if err := writeKnownsGitignore(dir, "git-tracked", tracking); err != nil {
		t.Fatalf("writeKnownsGitignore git-tracked: %v", err)
	}
	content = readTextFile(t, filepath.Join(dir, ".known-me", ".gitignore"))
	assertContains(t, content, "tasks/")
	assertContains(t, content, "tombstones/tasks/")
}

func TestWriteKnownsGitignoreIgnoredWithDisabledDecisions(t *testing.T) {
	dir := t.TempDir()

	trackDecisions := false
	tracking := &models.GitTracking{
		Decisions: &trackDecisions,
	}

	if err := writeKnownsGitignore(dir, "git-ignored", tracking); err != nil {
		t.Fatalf("writeKnownsGitignore returned error: %v", err)
	}

	content := readTextFile(t, filepath.Join(dir, ".known-me", ".gitignore"))

	assertNotContains(t, content, "!decisions/")
	assertContains(t, content, "!tasks/")
	assertContains(t, content, "!templates/")
	assertContains(t, content, "!docs/")
}

func TestWriteKnownsGitignoreTrackedMemoriesDisabledByDefault(t *testing.T) {
	dir := t.TempDir()

	if err := writeKnownsGitignore(dir, "git-tracked", nil); err != nil {
		t.Fatalf("writeKnownsGitignore returned error: %v", err)
	}

	content := readTextFile(t, filepath.Join(dir, ".known-me", ".gitignore"))

	assertContains(t, content, "memories/")
	assertNotContains(t, content, "decisions/")
	assertNotContains(t, content, "tasks/")
	assertNotContains(t, content, "docs/")
	assertNotContains(t, content, "templates/")
}

func TestSyncGitIntegrationPreservesSectionToggles(t *testing.T) {
	dir := t.TempDir()
	trackDecisions := false
	trackMemories := true
	cfg := &models.Project{
		Settings: models.ProjectSettings{
			GitTrackingMode: "git-ignored",
			GitTracking: &models.GitTracking{
				Decisions: &trackDecisions,
				Memories:  &trackMemories,
			},
		},
	}

	if err := syncGitIntegration(dir, cfg); err != nil {
		t.Fatalf("syncGitIntegration returned error: %v", err)
	}

	content := readTextFile(t, filepath.Join(dir, ".known-me", ".gitignore"))

	assertNotContains(t, content, "!decisions/")
	assertContains(t, content, "!memories/")
	assertContains(t, content, "!tasks/")
	assertContains(t, content, "!docs/")
	assertContains(t, content, "!templates/")
}

func assertNotContains(t *testing.T, content, want string) {
	t.Helper()

	if strings.Contains(content, want) {
		t.Fatalf("expected content not to contain %q, got:\n%s", want, content)
	}
}
