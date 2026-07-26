package models

// StructuralParams holds the optional traversal parameters for structural
// retrieval via the resolve action.
type StructuralParams struct {
	// Direction controls traversal direction from the root entity.
	// "outbound" (default), "inbound", or "both".
	Direction string `json:"direction,omitempty"`

	// Depth is the maximum number of traversal hops (1–3, default 1).
	Depth int `json:"depth,omitempty"`

	// RelationTypes filters edges to only these relation kinds (comma-separated).
	// Empty means all relations.
	RelationTypes []string `json:"relationTypes,omitempty"`

	// EntityTypes filters result entities to only these kinds (comma-separated).
	// Empty means all entity kinds.
	EntityTypes []string `json:"entityTypes,omitempty"`
}

// IsStructural returns true if any structural traversal param is set.
func (p StructuralParams) IsStructural() bool {
	return p.Direction != "" || p.Depth > 0 || len(p.RelationTypes) > 0 || len(p.EntityTypes) > 0
}

// Normalize fills in defaults for unset fields.
func (p *StructuralParams) Normalize() {
	if p.Direction == "" {
		p.Direction = "outbound"
	}
	if p.Depth <= 0 {
		p.Depth = 1
	}
	if p.Depth > 3 {
		p.Depth = 3
	}
}

// StructuralEntity is a lightweight entity reference used in structural edges.
type StructuralEntity struct {
	Kind  string `json:"kind"`
	ID    string `json:"id"`
	Title string `json:"title,omitempty"`
}

// StructuralEdge represents a single typed relation edge in a structural
// traversal result.
type StructuralEdge struct {
	Source   StructuralEntity `json:"source"`
	Target   StructuralEntity `json:"target"`
	Relation string           `json:"relation"`
	// Direction is "outbound" or "inbound" relative to the traversal root.
	Direction string `json:"direction"`
	// Depth is the traversal hop count (1-based) at which this edge was found.
	Depth  int    `json:"depth"`
	Origin string `json:"origin"` // "field-backed", "inline", "code-graph"
	// Resolved indicates whether the target entity was found in the store.
	Resolved bool `json:"resolved"`
}

// UnresolvedEdge represents an edge whose target could not be found.
type UnresolvedEdge struct {
	Ref    string `json:"ref"`
	Reason string `json:"reason"`
}

// StructuralResult is the response shape for structural retrieval.
type StructuralResult struct {
	Root       StructuralEntity `json:"root"`
	Edges      []StructuralEdge `json:"edges"`
	Unresolved []UnresolvedEdge `json:"unresolved"`
}

// Origin priority constants for deduplication.
const (
	OriginFieldBacked = "field-backed"
	OriginInline      = "inline"
	OriginCodeGraph   = "code-graph"
)

// OriginPriority returns a numeric priority for deduplication (lower = higher priority).
func OriginPriority(origin string) int {
	switch origin {
	case OriginFieldBacked:
		return 0
	case OriginInline:
		return 1
	case OriginCodeGraph:
		return 2
	default:
		return 3
	}
}
