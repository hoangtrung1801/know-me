package cli

import (
	"encoding/json"
	"fmt"
	"io"
	"strings"

	"github.com/howznguyen/knowns/internal/models"
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

	// Check for structural traversal flags.
	direction, _ := cmd.Flags().GetString("direction")
	depth, _ := cmd.Flags().GetInt("depth")
	relation, _ := cmd.Flags().GetString("relation")
	entityType, _ := cmd.Flags().GetString("type")

	params := models.StructuralParams{
		Direction: direction,
		Depth:     depth,
	}
	if relation != "" {
		params.RelationTypes = splitCSVFlag(relation)
	}
	if entityType != "" {
		params.EntityTypes = splitCSVFlag(entityType)
	}

	out := cmd.OutOrStdout()

	// If structural params are present, use structural traversal.
	if params.IsStructural() {
		result, err := store.StructuralResolve(args[0], params)
		if err != nil {
			return err
		}

		if isJSON(cmd) {
			enc := json.NewEncoder(out)
			enc.SetIndent("", "  ")
			return enc.Encode(result)
		}
		if isPlain(cmd) {
			writePlainStructuralResult(out, result)
			return nil
		}
		writePrettyStructuralResult(out, result)
		return nil
	}

	// Otherwise, use the existing simple resolution.
	resolution, err := store.ResolveRawReference(args[0])
	if err != nil {
		return err
	}

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
	resolveCmd.Flags().String("direction", "", "Traversal direction: outbound (default), inbound, or both")
	resolveCmd.Flags().Int("depth", 0, "Max traversal hops (1-3, default 1)")
	resolveCmd.Flags().String("relation", "", "Filter by relation kinds (comma-separated)")
	resolveCmd.Flags().String("type", "", "Filter result entities by kind (comma-separated)")
	rootCmd.AddCommand(resolveCmd)
}

// splitCSVFlag splits a comma-separated flag value into trimmed non-empty parts.
func splitCSVFlag(s string) []string {
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

func writePlainStructuralResult(w io.Writer, result models.StructuralResult) {
	fmt.Fprintf(w, "Root: %s:%s\n", result.Root.Kind, result.Root.ID)
	if result.Root.Title != "" {
		fmt.Fprintf(w, "Root Title: %s\n", result.Root.Title)
	}
	fmt.Fprintf(w, "Edges: %d\n", len(result.Edges))
	for i, e := range result.Edges {
		fmt.Fprintf(w, "  [%d] %s:%s --%s--> %s:%s (depth=%d, origin=%s, dir=%s)\n",
			i+1, e.Source.Kind, e.Source.ID, e.Relation,
			e.Target.Kind, e.Target.ID, e.Depth, e.Origin, e.Direction)
	}
	if len(result.Unresolved) > 0 {
		fmt.Fprintf(w, "Unresolved: %d\n", len(result.Unresolved))
		for _, u := range result.Unresolved {
			fmt.Fprintf(w, "  - %s (%s)\n", u.Ref, u.Reason)
		}
	}
}

func writePrettyStructuralResult(w io.Writer, result models.StructuralResult) {
	fmt.Fprintf(w, "Structural Traversal\n====================\n\n")
	writePlainStructuralResult(w, result)
}
