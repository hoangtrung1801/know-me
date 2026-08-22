package cli

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/hoangtrung1801/known-me/internal/lsp"
	"github.com/hoangtrung1801/known-me/internal/lsp/adapters"
	"github.com/hoangtrung1801/known-me/internal/models"
	"github.com/hoangtrung1801/known-me/internal/registry"
	"github.com/hoangtrung1801/known-me/internal/storage"
	"github.com/spf13/cobra"
)

type workspaceProjectLink struct {
	ProjectID string `json:"projectId"`
}

// getStore finds the project root and returns a Store instance.
// On error it prints to stderr and exits.
func getStore() *storage.Store {
	cwd, err := os.Getwd()
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error: cannot determine working directory: %v\n", err)
		os.Exit(1)
	}
	store, err := resolveProjectStore(cwd)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error: %v\n", err)
		fmt.Fprintf(os.Stderr, "Run 'knowns init' to initialize a project.\n")
		os.Exit(1)
	}
	return store
}

// getStoreErr finds the project root and returns a Store instance, or an error.
func getStoreErr() (*storage.Store, error) {
	cwd, err := os.Getwd()
	if err != nil {
		return nil, fmt.Errorf("cannot determine working directory: %w", err)
	}
	return resolveProjectStore(cwd)
}

func projectIDFlagOrStore(cmd *cobra.Command, store *storage.Store) string {
	projectID, _ := cmd.Flags().GetString("project-id")
	if projectID == "" && store != nil {
		return store.ProjectID
	}
	return projectID
}

func resolveProjectStore(start string) (*storage.Store, error) {
	projectID, projectRoot, err := findWorkspaceProjectLink(start)
	if err != nil {
		return nil, err
	}

	reg := registry.NewRegistry()
	if err := reg.Load(); err != nil {
		return nil, fmt.Errorf("load project registry: %w", err)
	}

	var project *registry.Project
	if projectID == "" {
		project = reg.GetActive()
		if project == nil {
			return nil, fmt.Errorf("no active project; run 'knowns init'")
		}
		projectID = project.ID
	} else {
		var known bool
		project, known = reg.Get(projectID)
		if !known {
			return nil, fmt.Errorf("workspace link references unknown project %q", projectID)
		}
	}
	if projectRoot != "" {
		if err := reg.SetPath(projectID, projectRoot); err != nil {
			return nil, fmt.Errorf("save project path: %w", err)
		}
		project, _ = reg.Get(projectID)
		if project != nil {
			projectRoot = project.Path
		}
	} else if project != nil {
		projectRoot = project.Path
	}

	return storage.NewProjectStore(storage.GlobalRootPath(), projectID, projectRoot), nil
}

func findWorkspaceProjectLink(start string) (string, string, error) {
	dir, err := filepath.Abs(start)
	if err != nil {
		return "", "", fmt.Errorf("resolve workspace directory: %w", err)
	}

	for {
		path := filepath.Join(dir, ".known-me.json")
		data, readErr := os.ReadFile(path)
		if readErr == nil {
			var link workspaceProjectLink
			if err := json.Unmarshal(data, &link); err != nil {
				return "", "", fmt.Errorf("parse workspace link %s: %w", path, err)
			}
			link.ProjectID = strings.TrimSpace(link.ProjectID)
			if link.ProjectID == "" {
				return "", "", fmt.Errorf("workspace link %s has no projectId", path)
			}
			return link.ProjectID, dir, nil
		}
		if !os.IsNotExist(readErr) {
			return "", "", fmt.Errorf("read workspace link %s: %w", path, readErr)
		}

		parent := filepath.Dir(dir)
		if parent == dir {
			return "", "", nil
		}
		dir = parent
	}
}

// isPlain returns true if the --plain flag is set.
func isPlain(cmd *cobra.Command) bool {
	v, _ := cmd.Flags().GetBool("plain")
	if v {
		return true
	}
	// also check persistent flags on ancestors
	v, _ = cmd.Root().PersistentFlags().GetBool("plain")
	return v
}

// isJSON returns true if the --json flag is set.
func isJSON(cmd *cobra.Command) bool {
	v, _ := cmd.Flags().GetBool("json")
	if v {
		return true
	}
	v, _ = cmd.Root().PersistentFlags().GetBool("json")
	return v
}

// printJSON marshals v to indented JSON and prints it.
func printJSON(v any) {
	data, err := json.MarshalIndent(v, "", "  ")
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error encoding JSON: %v\n", err)
		return
	}
	fmt.Println(string(data))
}

// formatDuration formats a duration in seconds to a human-readable string.
func formatDuration(seconds int) string {
	if seconds <= 0 {
		return "0m"
	}
	h := seconds / 3600
	m := (seconds % 3600) / 60
	s := seconds % 60
	if h > 0 && m > 0 {
		return fmt.Sprintf("%dh %dm", h, m)
	} else if h > 0 {
		return fmt.Sprintf("%dh", h)
	} else if m > 0 && s > 0 {
		return fmt.Sprintf("%dm %ds", m, s)
	} else if m > 0 {
		return fmt.Sprintf("%dm", m)
	}
	return fmt.Sprintf("%ds", s)
}

// joinStrings joins a slice of strings with the given separator.
func joinStrings(ss []string, sep string) string {
	return strings.Join(ss, sep)
}

// isPagerDisabled returns true if pager is disabled via flag or env var.
func isPagerDisabled(cmd any) bool {
	if c, ok := cmd.(*cobra.Command); ok {
		v, _ := c.Flags().GetBool("no-pager")
		if v {
			return true
		}
		v, _ = c.Root().PersistentFlags().GetBool("no-pager")
		if v {
			return true
		}
	}
	return os.Getenv("KNOWNS_NO_PAGER") != ""
}

// splitCSV splits a comma-separated string into trimmed parts.
func splitCSV(s string) []string {
	if s == "" {
		return nil
	}
	parts := strings.Split(s, ",")
	result := make([]string, 0, len(parts))
	for _, p := range parts {
		p = strings.TrimSpace(p)
		if p != "" {
			result = append(result, p)
		}
	}
	return result
}

// unescapeText replaces literal \n and \t sequences with actual newlines and tabs.
// This handles the common case where shell passes "line1\nline2" as literal characters.
func unescapeText(s string) string {
	s = strings.ReplaceAll(s, `\n`, "\n")
	s = strings.ReplaceAll(s, `\t`, "\t")
	return s
}

func getLSPManagerForRoot(root string) *lsp.Manager {
	store := storage.NewStore(root)
	project, _ := store.Config.Load()
	manager := lsp.NewManager(root, lspConfigWithGlobalDefaults(project))
	for _, adapter := range adapters.All() {
		if err := manager.RegisterAdapter(adapter); err != nil {
			fmt.Fprintf(os.Stderr, "warn: could not register LSP adapter %s: %v\n", adapter.ID(), err)
		}
	}
	for _, loadErr := range manager.RegisterPluginAdapters(lsp.PluginAdapterLoadOptions{}) {
		fmt.Fprintf(os.Stderr, "warn: could not load LSP plugin adapter: %v\n", loadErr)
	}
	return manager
}

func lspConfigWithGlobalDefaults(project *models.Project) lsp.Config {
	var defaults *storage.ProjectDefaults
	if settings, err := storage.NewEmbeddingSettingsStore().Load(); err == nil {
		defaults = settings.ProjectDefaults
	}
	return lsp.ConfigFromProjectWithDefaults(project, defaults)
}
