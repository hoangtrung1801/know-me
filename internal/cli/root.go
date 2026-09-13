package cli

import (
	"fmt"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"time"

	"github.com/spf13/cobra"

	"github.com/hoangtrung1801/know-me/internal/codegen"
	"github.com/hoangtrung1801/know-me/internal/paths"
	"github.com/hoangtrung1801/know-me/internal/util"
)

var bannerLines = []string{
	"▄▄▄   ▄▄▄ ▄▄▄    ▄▄▄   ▄▄▄▄▄   ▄▄▄▄  ▄▄▄  ▄▄▄▄ ▄▄▄    ▄▄▄  ▄▄▄▄▄▄▄",
	"███ ▄███▀ ████▄  ███ ▄███████▄ ▀███  ███  ███▀ ████▄  ███ █████▀▀▀",
	"███████   ███▀██▄███ ███   ███  ███  ███  ███  ███▀██▄███  ▀████▄",
	"███▀███▄  ███  ▀████ ███▄▄▄███  ███▄▄███▄▄███  ███  ▀████    ▀████",
	"███  ▀███ ███    ███  ▀█████▀    ▀████▀████▀   ███    ███ ███████▀",
}

var rootCmd = &cobra.Command{
	Use:     "knowme [options] [command]",
	Short:   "The memory layer for AI-native software development",
	Version: util.Version,
	Run: func(cmd *cobra.Command, args []string) {
		fmt.Println()
		for _, line := range bannerLines {
			fmt.Println(StyleInfo.Render(line))
		}
		fmt.Println()
		fmt.Printf("  %s %s\n", StyleBold.Render("Know-Me"), StyleSuccess.Render(util.Version))
		fmt.Println("  The memory layer for AI-native software development.")
		fmt.Println("  Enabling AI to understand your project instantly.")
		fmt.Println()
		fmt.Println(StyleBold.Render("  Quick Start:"))
		fmt.Printf("    %s  %s\n", StyleInfo.Render("knowme init"), "Initialize project")
		fmt.Printf("    %s  %s\n", StyleInfo.Render("knowme task list"), "List all tasks")
		fmt.Printf("    %s  %s\n", StyleInfo.Render("knowme browser"), "Open web UI")
		fmt.Printf("    %s  %s\n", StyleInfo.Render("knowme --help"), "Show all commands")
		fmt.Println()
		fmt.Printf("  %s  %s\n", StyleBold.Render("Discord:  "), StyleInfo.Render("https://discord.knowns.dev"))
		fmt.Println()
	},
}

// customHelpFunc renders a clean, styled help output matching the TS CLI style.
func customHelpFunc(cmd *cobra.Command, args []string) {
	// Header
	fmt.Printf("%s %s\n", StyleBold.Render(cmd.Short), StyleDim.Render("(v"+util.Version+")"))
	fmt.Println()

	// Usage
	fmt.Printf("%s %s\n", StyleBold.Render("Usage:"), StyleInfo.Render(cmd.UseLine()))
	fmt.Println()

	// Commands - grouped
	if cmd.HasAvailableSubCommands() {
		fmt.Println(StyleBold.Render("Commands:"))

		// Find max command name length for alignment
		maxLen := 0
		for _, c := range cmd.Commands() {
			if !c.IsAvailableCommand() || c.Name() == "help" || c.Name() == "completion" {
				continue
			}
			if len(c.Name()) > maxLen {
				maxLen = len(c.Name())
			}
		}

		for _, c := range cmd.Commands() {
			if !c.IsAvailableCommand() || c.Name() == "help" || c.Name() == "completion" {
				continue
			}
			padding := strings.Repeat(" ", maxLen-len(c.Name())+2)
			fmt.Printf("  %s%s%s\n",
				StyleInfo.Render(c.Name()),
				padding,
				StyleDim.Render(c.Short),
			)
		}
		fmt.Println()
	}

	// Flags
	if cmd.HasAvailableLocalFlags() {
		fmt.Println(StyleBold.Render("Options:"))
		fmt.Println(StyleDim.Render(cmd.LocalFlags().FlagUsages()))
	}

	// Footer
	fmt.Printf("%s\n", StyleDim.Render("Use \"knowme [command] --help\" for more information about a command."))
}

// maybeWarnSkillsOutOfSync prints a one-line warning if embedded skills differ
// from the on-disk copies. This nudges the user to run `knowme setup agents` after upgrading.
func maybeWarnSkillsOutOfSync() {
	cwd, err := os.Getwd()
	if err != nil {
		return
	}
	root := filepath.Join(cwd, paths.StoreDirName)
	if _, err := os.Stat(root); err != nil {
		return
	}
	if codegen.SkillsOutOfSync(cwd) {
		fmt.Fprintf(os.Stderr, "%s\n", StyleWarning.Render("⚠ Skills are out of sync. Run 'knowme setup agents' to update."))
	}
}

func shouldSkipCLIWarnings(args []string) bool {
	for _, name := range []string{"doctor", "runtime", "runtime-memory", "__runtime"} {
		if slices.Contains(args, name) {
			return true
		}
	}
	return false
}

// Execute runs the root command.
func Execute() error {
	if shouldSkipCLIWarnings(os.Args[1:]) {
		return rootCmd.Execute()
	}

	// Warn if skills are out of sync after a CLI upgrade.
	maybeWarnSkillsOutOfSync()


	// Start update check in background while command runs
	msgCh := make(chan string, 1)
	go func() {
		msgCh <- util.CheckForUpdate()
	}()

	err := rootCmd.Execute()

	// After command completes, wait for update check (max 3s) and print if available
	select {
	case msg := <-msgCh:
		if msg != "" {
			fmt.Fprint(os.Stderr, msg)
		}
	case <-time.After(3 * time.Second):
	}

	return err
}

func init() {
	rootCmd.SetHelpFunc(customHelpFunc)
	rootCmd.PersistentFlags().Bool("plain", false, "Plain text output (for AI agents)")
	rootCmd.PersistentFlags().Bool("json", false, "JSON output")
	rootCmd.PersistentFlags().Bool("no-pager", false, "Disable TUI pager (print styled output directly)")
	rootCmd.PersistentFlags().Int("page", 0, "Page number for paginated output (e.g. --page 2)")
	rootCmd.PersistentFlags().Int("page-size", 0, "Lines per page (default 50)")
	rootCmd.PersistentFlags().String("server-url", "", "Remote Know-Me server URL (overrides .know-me/config.json and KNOWME_SERVER_URL)")
}
