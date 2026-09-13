package cli

import (
	"encoding/json"
	"fmt"
	"io"
	"strings"

	"github.com/hoangtrung1801/know-me/internal/models"
	"github.com/spf13/cobra"
)

var resolveCmd = &cobra.Command{
	Use:   "resolve <semantic-ref>",
	Short: "Resolve a semantic reference",
	Args:  cobra.ExactArgs(1),
	RunE:  runResolve,
}

func runResolve(cmd *cobra.Command, args []string) error {
	store, err := getStoreErr()
	if err != nil {
		return err
	}

	// Otherwise, use the existing simple resolution.
	resolution, err := store.ResolveRawReference(args[0])
	if err != nil {
		return err
	}
	out := cmd.OutOrStdout()

	if isJSON(cmd) {
		enc := json.NewEncoder(out)
		enc.SetIndent("", "  ")
		return enc.Encode(resolution)
	}

	if isPlain(cmd) {
		writePlainResolution(out, resolution)
		return nil
	}

	writePrettyResolution(out, resolution)
	return nil
}

func writePlainResolution(w io.Writer, resolution models.SemanticResolution) {
	fmt.Fprintf(w, "Reference: %s\n", resolution.Reference.Raw)
	fmt.Fprintf(w, "Type: %s\n", resolution.Reference.Type)
	fmt.Fprintf(w, "Target: %s\n", resolution.Reference.Target)
	fmt.Fprintf(w, "Relation: %s\n", resolution.Reference.Relation)
	fmt.Fprintf(w, "Explicit Relation: %t\n", resolution.Reference.ExplicitRelation)
	fmt.Fprintf(w, "Valid Relation: %t\n", resolution.Reference.ValidRelation)
	fmt.Fprintf(w, "Resolved: %t\n", resolution.Found)
	if resolution.Reference.Fragment != nil {
		fmt.Fprintf(w, "Fragment: %s\n", formatReferenceFragment(resolution.Reference.Fragment))
	}
	if resolution.Entity != nil {
		fmt.Fprintf(w, "Entity Type: %s\n", resolution.Entity.Type)
		fmt.Fprintf(w, "Entity ID: %s\n", resolution.Entity.ID)
		if resolution.Entity.Path != "" {
			fmt.Fprintf(w, "Path: %s\n", resolution.Entity.Path)
		}
		if resolution.Entity.Title != "" {
			fmt.Fprintf(w, "Title: %s\n", resolution.Entity.Title)
		}
		if resolution.Entity.Status != "" {
			fmt.Fprintf(w, "Status: %s\n", resolution.Entity.Status)
		}
		if resolution.Entity.Priority != "" {
			fmt.Fprintf(w, "Priority: %s\n", resolution.Entity.Priority)
		}
		if len(resolution.Entity.Tags) > 0 {
			fmt.Fprintf(w, "Tags: %s\n", strings.Join(resolution.Entity.Tags, ", "))
		}
		if resolution.Entity.MemoryLayer != "" {
			fmt.Fprintf(w, "Memory Layer: %s\n", resolution.Entity.MemoryLayer)
		}
		if resolution.Entity.Category != "" {
			fmt.Fprintf(w, "Category: %s\n", resolution.Entity.Category)
		}
		if resolution.Entity.Imported {
			fmt.Fprintf(w, "Imported: true\n")
			if resolution.Entity.Source != "" {
				fmt.Fprintf(w, "Source: %s\n", resolution.Entity.Source)
			}
		}
	}
}

func writePrettyResolution(w io.Writer, resolution models.SemanticResolution) {
	fmt.Fprintf(w, "Semantic Reference\n==================\n\n")
	writePlainResolution(w, resolution)
}

func formatReferenceFragment(fragment *models.DocReferenceFragment) string {
	if fragment == nil {
		return ""
	}
	if fragment.Heading != "" {
		return "#" + fragment.Heading
	}
	if fragment.RangeStart > 0 && fragment.RangeEnd > 0 {
		return fmt.Sprintf(":%d-%d", fragment.RangeStart, fragment.RangeEnd)
	}
	if fragment.Line > 0 {
		return fmt.Sprintf(":%d", fragment.Line)
	}
	return fragment.Raw
}

func init() {
	rootCmd.AddCommand(resolveCmd)
}

