package cli

import (
	"fmt"
	"os"
	"path/filepath"

	"gopkg.in/yaml.v3"
)

func createHermesMCPConfigQuiet(projectRoot string) error {
	home, err := osUserHomeDir()
	if err != nil {
		return fmt.Errorf("resolve user home: %w", err)
	}

	return upsertHermesConfig(
		filepath.Join(home, ".hermes", "config.yaml"),
		filepath.Join(projectRoot, ".agents", "skills"),
		projectRoot,
	)
}

func setupGlobalHermesMCP(home string) error {
	return upsertHermesConfig(
		filepath.Join(home, ".hermes", "config.yaml"),
		filepath.Join(home, ".agents", "skills"),
		"",
	)
}

func upsertHermesConfig(configPath, skillsDir, projectRoot string) error {
	if err := os.MkdirAll(filepath.Dir(configPath), 0755); err != nil {
		return err
	}

	config := map[string]any{}
	if data, err := os.ReadFile(configPath); err == nil {
		if err := yaml.Unmarshal(data, &config); err != nil {
			return fmt.Errorf("parse hermes config.yaml: %w", err)
		}
	} else if !os.IsNotExist(err) {
		return err
	}

	cmd, args := mcpCommand()
	if projectRoot != "" {
		args = append(args, "--project", projectRoot)
	}

	servers := mapValue(config, "mcp_servers")
	servers["knowns"] = map[string]any{
		"command": cmd,
		"args":    args,
	}
	config["mcp_servers"] = servers

	skills := mapValue(config, "skills")
	skills["external_dirs"] = appendUniqueString(anyStringSlice(skills["external_dirs"]), skillsDir)
	config["skills"] = skills

	data, err := yaml.Marshal(config)
	if err != nil {
		return err
	}
	return os.WriteFile(configPath, data, 0644)
}

func syncHermesMCPConfig(projectRoot, cmd string, args []string) (int, error) {
	home, err := osUserHomeDir()
	if err != nil {
		return 0, err
	}

	configPath := filepath.Join(home, ".hermes", "config.yaml")
	data, err := os.ReadFile(configPath)
	if err != nil {
		return 0, nil
	}

	config := map[string]any{}
	if err := yaml.Unmarshal(data, &config); err != nil {
		return 0, err
	}

	expectedArgs := append(append([]string(nil), args...), "--project", projectRoot)
	skillsDir := filepath.Join(projectRoot, ".agents", "skills")

	servers := mapValue(config, "mcp_servers")
	knowns, _ := servers["knowns"].(map[string]any)
	if knowns == nil {
		knowns = map[string]any{}
	}

	skills := mapValue(config, "skills")
	currentExternalDirs := anyStringSlice(skills["external_dirs"])
	nextExternalDirs := appendUniqueString(currentExternalDirs, skillsDir)

	changed := knowns["command"] != cmd || !sameStrings(anyStringSlice(knowns["args"]), expectedArgs) || len(nextExternalDirs) != len(currentExternalDirs)
	if !changed {
		return 0, nil
	}

	knowns["command"] = cmd
	knowns["args"] = expectedArgs
	servers["knowns"] = knowns
	config["mcp_servers"] = servers
	skills["external_dirs"] = nextExternalDirs
	config["skills"] = skills

	out, err := yaml.Marshal(config)
	if err != nil {
		return 0, err
	}
	if err := os.WriteFile(configPath, out, 0644); err != nil {
		return 0, err
	}

	fmt.Printf("  %s %s\n", StyleInfo.Render("synced"), "~/.hermes/config.yaml")
	return 1, nil
}

func mapValue(config map[string]any, key string) map[string]any {
	value, ok := config[key].(map[string]any)
	if !ok || value == nil {
		return map[string]any{}
	}
	return value
}

func anyStringSlice(value any) []string {
	switch values := value.(type) {
	case []string:
		return append([]string(nil), values...)
	case []any:
		out := make([]string, 0, len(values))
		for _, item := range values {
			if s, ok := item.(string); ok {
				out = append(out, s)
			}
		}
		return out
	default:
		return nil
	}
}

func appendUniqueString(values []string, value string) []string {
	for _, existing := range values {
		if existing == value {
			return values
		}
	}
	return append(values, value)
}

func sameStrings(values, expected []string) bool {
	if len(values) != len(expected) {
		return false
	}
	for i, want := range expected {
		if values[i] != want {
			return false
		}
	}
	return true
}
