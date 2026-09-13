package cli

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/hoangtrung1801/know-me/internal/readiness"
	"github.com/spf13/cobra"
)

var statusCmd = &cobra.Command{
	Use:   "status",
	Short: "Show project readiness summary",
	Long: `Display a unified readiness summary for the active Know-Me project.

Shows project identity, knowledge counts, search status, runtime health,
and available capabilities in one view.

Use --json for structured output consumed by scripts or AI clients.
Use --plain for clean text output suitable for piping.`,
	RunE: runStatus,
}

func runStatus(cmd *cobra.Command, args []string) error {
	store, err := getStoreErr()

	// Check for remote server configuration
	serverURL, urlErr := ResolveServerURL(cmd, store)
	if urlErr != nil {
		return urlErr
	}

	if serverURL != "" {
		return fetchAndRenderRemoteStatus(cmd, serverURL)
	}

	if err != nil {
		if isJSON(cmd) {
			printJSON(readiness.InactivePayload())
			return nil
		}
		return err
	}

	payload := readiness.BuildReadiness(store, readiness.Options{})
	if isJSON(cmd) {
		printJSON(payload)
		return nil
	}

	if isPlain(cmd) {
		renderStatusPlain(payload)
		return nil
	}

	renderStatusStyled(payload)
	return nil
}

func fetchAndRenderRemoteStatus(cmd *cobra.Command, serverURL string) error {
	client := &http.Client{Timeout: 3 * time.Second}
	reqURL := fmt.Sprintf("%s/api/status", strings.TrimRight(serverURL, "/"))
	req, err := http.NewRequest("GET", reqURL, nil)
	if err != nil {
		return fmt.Errorf("remote request creation failed: %w", err)
	}
	if token := strings.TrimSpace(os.Getenv("KNOWME_TOKEN")); token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}

	var payload readiness.Payload
	resp, err := client.Do(req)
	if err == nil && resp.StatusCode == http.StatusOK {
		defer resp.Body.Close()
		if decodeErr := json.NewDecoder(resp.Body).Decode(&payload); decodeErr == nil {
			if isJSON(cmd) {
				printJSON(payload)
				return nil
			}
			if isPlain(cmd) {
				renderStatusPlain(payload)
				return nil
			}
			renderStatusStyled(payload)
			return nil
		}
	}
	if resp != nil {
		resp.Body.Close()
	}

	// Fallback to synthesizing readiness from individual working endpoints
	// (/api/config, /api/tasks, /api/docs) in case /api/status is hung on server-side LSP lock.
	cfgReq, err := http.NewRequest("GET", fmt.Sprintf("%s/api/config", strings.TrimRight(serverURL, "/")), nil)
	if err == nil {
		if token := strings.TrimSpace(os.Getenv("KNOWME_TOKEN")); token != "" {
			cfgReq.Header.Set("Authorization", "Bearer "+token)
		}
		if cfgResp, err := client.Do(cfgReq); err == nil && cfgResp.StatusCode == http.StatusOK {
			defer cfgResp.Body.Close()
			var cfgWrapper struct {
				Config struct {
					Name string `json:"name"`
					ID   string `json:"id"`
				} `json:"config"`
			}
			if json.NewDecoder(cfgResp.Body).Decode(&cfgWrapper) == nil && cfgWrapper.Config.Name != "" {
				payload = readiness.Payload{
					Active:      true,
					ProjectName: cfgWrapper.Config.Name,
					ProjectPath: fmt.Sprintf("%s (remote: %s)", cfgWrapper.Config.ID, serverURL),
					Version:     "remote",
					Knowledge:   &readiness.KnowledgeStatus{},
				}

				// Query task count
				if tResp, err := client.Get(fmt.Sprintf("%s/api/tasks", strings.TrimRight(serverURL, "/"))); err == nil && tResp.StatusCode == http.StatusOK {
					var tasks []any
					if json.NewDecoder(tResp.Body).Decode(&tasks) == nil {
						payload.Knowledge.Tasks = len(tasks)
					}
					tResp.Body.Close()
				}
				// Query doc count
				if dResp, err := client.Get(fmt.Sprintf("%s/api/docs", strings.TrimRight(serverURL, "/"))); err == nil && dResp.StatusCode == http.StatusOK {
					var docsWrapper struct {
						Docs []any `json:"docs"`
					}
					if json.NewDecoder(dResp.Body).Decode(&docsWrapper) == nil {
						payload.Knowledge.Docs = len(docsWrapper.Docs)
					}
					dResp.Body.Close()
				}

				if isJSON(cmd) {
					printJSON(payload)
					return nil
				}
				if isPlain(cmd) {
					renderStatusPlain(payload)
					return nil
				}
				renderStatusStyled(payload)
				return nil
			}
		}
	}

	if isPlain(cmd) {
		fmt.Printf("Remote Server: %s (unreachable or timed out)\n", serverURL)
		return nil
	}
	if isJSON(cmd) {
		printJSON(map[string]any{
			"active":    false,
			"serverUrl": serverURL,
			"error":     "remote server unreachable or timed out",
		})
		return nil
	}
	return fmt.Errorf("remote server at %s unreachable or timed out", serverURL)
}

func renderStatusPlain(p readiness.Payload) {
	if !p.Active {
		fmt.Println("No active project.")
		return
	}

	fmt.Printf("Project: %s (%s)\n", p.ProjectName, p.ProjectPath)
	fmt.Printf("Version: %s\n", p.Version)

	if p.Knowledge != nil {
		k := p.Knowledge
		fmt.Printf("Knowledge: %d docs, %d tasks, %d templates\n", k.Docs, k.Tasks, k.Templates)
	}

	if p.Search != nil {
		s := p.Search
		if s.SemanticEnabled && s.ModelInstalled && s.ProjectIndexReady {
			freshness := "unknown"
			if s.LastReindex != nil {
				freshness = formatTimeSince(*s.LastReindex)
			}
			fmt.Printf("Search: semantic ready, indices fresh (%s)\n", freshness)
		} else if s.SemanticEnabled && !s.ModelInstalled {
			fmt.Println("Search: semantic enabled but model not installed")
		} else if s.SemanticEnabled && !s.ProjectIndexReady {
			fmt.Println("Search: semantic enabled but index empty (run: knowme search --reindex)")
		} else {
			fmt.Println("Search: keyword-only mode")
		}
	}

	if p.Runtime != nil {
		r := p.Runtime
		if r.Running {
			fmt.Printf("Runtime: %s, %d clients, %d queued, %d running\n",
				r.State, r.ConnectedClients, r.QueuedJobs, r.RunningJobs)
		} else if r.Enabled {
			fmt.Println("Runtime: enabled but not running")
		} else {
			fmt.Println("Runtime: disabled")
		}
	} else {
		fmt.Println("Runtime: not running")
	}


	if len(p.Capabilities) > 0 {
		fmt.Printf("Capabilities: %s\n", strings.Join(p.Capabilities, ", "))
	}
}

func renderStatusStyled(p readiness.Payload) {
	if !p.Active {
		fmt.Println(StyleWarning.Render("No active project."))
		return
	}

	// Header
	fmt.Printf("%s %s\n", StyleBold.Render("Project:"), StyleSuccess.Render(p.ProjectName))
	fmt.Printf("%s %s\n", StyleDim.Render("  Path:"), p.ProjectPath)
	fmt.Printf("%s %s\n", StyleDim.Render("  Version:"), p.Version)
	fmt.Println()

	// Knowledge
	if p.Knowledge != nil {
		k := p.Knowledge
		fmt.Println(StyleBold.Render("Knowledge"))
		fmt.Printf("  %s %d docs, %d tasks, %d templates\n",
			StyleSuccess.Render("✓"), k.Docs, k.Tasks, k.Templates)
		fmt.Println()
	}

	// Search
	if p.Search != nil {
		s := p.Search
		fmt.Println(StyleBold.Render("Search"))
		if s.SemanticEnabled && s.ModelInstalled && s.ProjectIndexReady {
			freshness := "unknown"
			if s.LastReindex != nil {
				freshness = formatTimeSince(*s.LastReindex)
			}
			fmt.Printf("  %s semantic ready, indices fresh (%s)\n", StyleSuccess.Render("✓"), freshness)
		} else if !s.SemanticEnabled {
			fmt.Printf("  %s keyword-only mode\n", StyleDim.Render("○"))
		} else if !s.ModelInstalled {
			fmt.Printf("  %s model not installed\n", StyleWarning.Render("⚠"))
		} else if !s.ProjectIndexReady {
			fmt.Printf("  %s index empty — run: knowme search --reindex\n", StyleWarning.Render("⚠"))
		}
		fmt.Println()
	}

	// Runtime
	if p.Runtime != nil {
		r := p.Runtime
		fmt.Println(StyleBold.Render("Runtime"))
		if r.Running && r.State == "healthy" {
			fmt.Printf("  %s healthy, %d clients, %d queued, %d running\n",
				StyleSuccess.Render("✓"), r.ConnectedClients, r.QueuedJobs, r.RunningJobs)
		} else if r.Running && r.State == "degraded" {
			fmt.Printf("  %s degraded, %d clients\n", StyleWarning.Render("⚠"), r.ConnectedClients)
		} else if r.Enabled {
			fmt.Printf("  %s enabled but not running\n", StyleWarning.Render("⚠"))
		} else {
			fmt.Printf("  %s disabled\n", StyleDim.Render("○"))
		}
		fmt.Println()
	} else {
		fmt.Println(StyleBold.Render("Runtime"))
		fmt.Printf("  %s not running\n", StyleDim.Render("○"))
		fmt.Println()
	}


	// Capabilities
	if len(p.Capabilities) > 0 {
		fmt.Println(StyleBold.Render("Capabilities"))
		fmt.Printf("  %s\n", strings.Join(p.Capabilities, ", "))
		fmt.Println()
	}
}

func formatTimeSince(t time.Time) string {
	d := time.Since(t)
	switch {
	case d < time.Minute:
		return "just now"
	case d < time.Hour:
		return fmt.Sprintf("%dm ago", int(d.Minutes()))
	case d < 24*time.Hour:
		return fmt.Sprintf("%dh ago", int(d.Hours()))
	default:
		return fmt.Sprintf("%dd ago", int(d.Hours()/24))
	}
}

func init() {
	rootCmd.AddCommand(statusCmd)
}
