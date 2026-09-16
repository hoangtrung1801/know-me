package cli

import (
	"fmt"
	"os"
	"path/filepath"

	"github.com/hoangtrung1801/know-me/internal/codegen"
	"github.com/spf13/cobra"
)

var skillsCmd = &cobra.Command{
	Use:     "skills",
	Aliases: []string{"skill"},
	Short:   "Manage and install workflow skills",
	Long: `Manage and install Know-Me workflow skills (such as knowme-workflow,
kn-plan, kn-implement, kn-verify, kn-review) into local project or global agent directories.`,
}

var skillsInstallCmd = &cobra.Command{
	Use:   "install [skill-name]",
	Short: "Install Know-Me skills into project or global agent directories",
	Long: `Install Know-Me skills into project or global agent directories.

By default, installs skills into the current project's .agents/skills/ directory
(standard AgentSkills directory recognized by OMP, Codex, OpenCode, and Hermes).

Use --global to install skills into ~/.agents/skills/ for all interactive CLI sessions.
Specify an optional [skill-name] to install only that specific skill (e.g., 'knowme-workflow' or 'kn-workflow').
If no skill is specified, all built-in Know-Me workflow skills are installed.`,
	Args: cobra.MaximumNArgs(1),
	RunE: runSkillsInstallCmd,
}

func init() {
	skillsInstallCmd.Flags().BoolP("global", "g", false, "Install to global user directory (~/.agents/skills/)")
	skillsInstallCmd.Flags().String("target", "", "Custom target directory for installation (overrides default)")
	skillsCmd.AddCommand(skillsInstallCmd)
	rootCmd.AddCommand(skillsCmd)
}

func runSkillsInstallCmd(cmd *cobra.Command, args []string) error {
	global, _ := cmd.Flags().GetBool("global")
	targetDir, _ := cmd.Flags().GetString("target")

	destDir, err := resolveSkillsTargetDir(global, targetDir)
	if err != nil {
		return err
	}

	filter := ""
	if len(args) > 0 {
		filter = args[0]
	}

	installed, err := installSkillsToDir(destDir, filter)
	if err != nil {
		return fmt.Errorf("failed to install skills: %w", err)
	}

	if len(installed) == 0 {
		if filter != "" {
			return fmt.Errorf("no skill found matching %q", filter)
		}
		return fmt.Errorf("no skills were installed")
	}

	scope := "project"
	if global {
		scope = "global"
	}
	fmt.Printf("✓ Installed %d skill(s) (%s) into %s\n", len(installed), scope, destDir)
	for _, name := range installed {
		fmt.Printf("  • %s\n", name)
	}
	return nil
}

func resolveSkillsTargetDir(global bool, custom string) (string, error) {
	if custom != "" {
		return filepath.Abs(custom)
	}
	if global {
		home, err := os.UserHomeDir()
		if err != nil {
			return "", fmt.Errorf("resolve user home directory: %w", err)
		}
		return filepath.Join(home, ".agents", "skills"), nil
	}
	cwd, err := os.Getwd()
	if err != nil {
		return "", fmt.Errorf("resolve current directory: %w", err)
	}
	return filepath.Join(cwd, ".agents", "skills"), nil
}

func installSkillsToDir(destDir string, filter string) ([]string, error) {
	targets := map[string]string{
		"agents": destDir,
	}

	// If no filter, sync all skills using standard codegen
	if filter == "" {
		if err := codegen.SyncSkillsToTargets(targets); err != nil {
			return nil, err
		}
		// List what got installed in destDir
		entries, err := os.ReadDir(destDir)
		if err != nil {
			return nil, err
		}
		var names []string
		for _, e := range entries {
			if e.IsDir() {
				names = append(names, e.Name())
			}
		}
		return names, nil
	}

	// Normalized matching: allow "knowme-workflow", "kn-workflow", "known-me", or "know-me"
	matchDir := filter
	if matchDir == "knowme-workflow" {
		matchDir = "kn-workflow"
	} else if matchDir == "know-me" {
		matchDir = "known-me"
	}

	// Ensure destination directory exists
	if err := os.MkdirAll(destDir, 0o755); err != nil {
		return nil, err
	}

	// Use temporary directory to sync and then isolate the requested skill
	tmpDir, err := os.MkdirTemp("", "knowme-skills-install-*")
	if err != nil {
		return nil, err
	}
	defer os.RemoveAll(tmpDir)

	if err := codegen.SyncSkillsToTargets(map[string]string{"agents": tmpDir}); err != nil {
		return nil, err
	}

	entries, err := os.ReadDir(tmpDir)
	if err != nil {
		return nil, err
	}

	var foundSource string
	var destSkillName string
	for _, e := range entries {
		if !e.IsDir() {
			continue
		}
		name := e.Name()
		if name == matchDir || (filter == "knowme-workflow" && name == "kn-workflow") || (filter == "know-me" && name == "known-me") {
			foundSource = filepath.Join(tmpDir, name)
			destSkillName = name
			if filter == "knowme-workflow" {
				destSkillName = "knowme-workflow"
			} else if filter == "know-me" {
				destSkillName = "know-me"
			}
			break
		}
	}

	if foundSource == "" {
		return nil, nil
	}

	destPath := filepath.Join(destDir, destSkillName)
	if err := os.RemoveAll(destPath); err != nil && !os.IsNotExist(err) {
		return nil, err
	}
	if err := os.MkdirAll(destPath, 0o755); err != nil {
		return nil, err
	}

	skillFiles, err := os.ReadDir(foundSource)
	if err != nil {
		return nil, err
	}
	for _, f := range skillFiles {
		srcFile := filepath.Join(foundSource, f.Name())
		dstFile := filepath.Join(destPath, f.Name())
		content, err := os.ReadFile(srcFile)
		if err != nil {
			return nil, err
		}
		if err := os.WriteFile(dstFile, content, 0o644); err != nil {
			return nil, err
		}
	}

	return []string{destSkillName}, nil
}
