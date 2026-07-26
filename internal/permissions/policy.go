package permissions

import "fmt"

// Preset names for permission policies.
const (
	PresetReadOnly          = "read-only"
	PresetReadWrite         = "read-write"
	PresetReadWriteNoDelete = "read-write-no-delete"
	PresetGenerateDryRun    = "generate-dry-run"
)

// DefaultPreset is used when no policy is configured.
const DefaultPreset = PresetReadWriteNoDelete

// PermissionConfig is stored in config.json under the "permissions" key.
type PermissionConfig struct {
	// Preset selects a named policy preset.
	Preset string `json:"preset,omitempty"`

	// Rules holds fine-grained attribute-based rules (Phase 2).
	// Phase 1 stores the schema but does not enforce rules.
	Rules []PermissionRule `json:"rules,omitempty"`
}

// PermissionRule defines a fine-grained permission rule (Phase 2 schema).
// Phase 1 ignores these during enforcement but preserves them in config.
type PermissionRule struct {
	Capability string            `json:"capability"`
	Target     string            `json:"target,omitempty"`
	Condition  map[string]string `json:"condition,omitempty"`
	Effect     string            `json:"effect"` // "allow" or "deny"
}

// PresetPolicy defines the allowed and denied capabilities for a preset.
type PresetPolicy struct {
	Name    string
	Allowed map[string]bool // capabilities that are allowed
	Denied  map[string]bool // capabilities that are denied

	// DryRunRequired lists capabilities that are only allowed with dryRun=true.
	DryRunRequired map[string]bool

	// DeleteRequiresDryRun means delete is allowed but only with dryRun=true first.
	DeleteRequiresDryRun bool
}

// presetPolicies defines the built-in policy presets.
var presetPolicies = map[string]*PresetPolicy{
	PresetReadOnly: {
		Name: PresetReadOnly,
		Allowed: map[string]bool{
			CapRead: true,
		},
		Denied: map[string]bool{
			CapWrite:    true,
			CapGenerate: true,
			CapArchive:  true,
			CapDelete:   true,
			CapAdmin:    true,
		},
	},
	PresetReadWrite: {
		Name: PresetReadWrite,
		Allowed: map[string]bool{
			CapRead:    true,
			CapWrite:   true,
			CapGenerate: true,
			CapArchive: true,
			CapDelete:  true, // allowed but requires dryRun first
		},
		Denied: map[string]bool{
			CapAdmin: true,
		},
		DeleteRequiresDryRun: true,
	},
	PresetReadWriteNoDelete: {
		Name: PresetReadWriteNoDelete,
		Allowed: map[string]bool{
			CapRead:    true,
			CapWrite:   true,
			CapGenerate: true,
			CapArchive: true,
		},
		Denied: map[string]bool{
			CapDelete: true,
			CapAdmin:  true,
		},
	},
	PresetGenerateDryRun: {
		Name: PresetGenerateDryRun,
		Allowed: map[string]bool{
			CapRead: true,
		},
		Denied: map[string]bool{
			CapWrite:   true,
			CapDelete:  true,
			CapAdmin:   true,
			CapArchive: true,
		},
		DryRunRequired: map[string]bool{
			CapGenerate: true,
		},
	},
}

// GetPresetPolicy returns the PresetPolicy for the given name.
// Returns nil if the preset is not recognized.
func GetPresetPolicy(name string) *PresetPolicy {
	return presetPolicies[name]
}

// EffectivePreset returns the preset name to use, falling back to the default
// when the config is nil or has no preset set.
func EffectivePreset(cfg *PermissionConfig) string {
	if cfg == nil || cfg.Preset == "" {
		return DefaultPreset
	}
	return cfg.Preset
}

// EffectivePolicy returns the PresetPolicy for the given config,
// falling back to the default preset when unconfigured.
func EffectivePolicy(cfg *PermissionConfig) *PresetPolicy {
	preset := EffectivePreset(cfg)
	if p := GetPresetPolicy(preset); p != nil {
		return p
	}
	// Unknown preset — fall back to default for safety.
	return presetPolicies[DefaultPreset]
}

// ValidPresets returns the list of valid preset names.
func ValidPresets() []string {
	return []string{
		PresetReadOnly,
		PresetReadWrite,
		PresetReadWriteNoDelete,
		PresetGenerateDryRun,
	}
}

// IsValidPreset checks if a preset name is recognized.
func IsValidPreset(name string) bool {
	_, ok := presetPolicies[name]
	return ok
}

// DenialPayload is the structured error returned when a permission check fails.
type DenialPayload struct {
	Denied     bool       `json:"denied"`
	Capability string     `json:"capability"`
	Target     string     `json:"target"`
	Reason     string     `json:"reason"`
	Suggestion string     `json:"suggestion,omitempty"`
	PolicyRef  *PolicyRef `json:"policyRef"`
}

// PolicyRef identifies the policy that caused a denial.
type PolicyRef struct {
	Source     string `json:"source"`
	Preset     string `json:"preset"`
	ConfigPath string `json:"configPath"`
}

// CheckCapability evaluates whether a capability is allowed by the policy.
// Returns nil if allowed, or a DenialPayload if denied.
func CheckCapability(policy *PresetPolicy, meta ActionMeta, dryRun bool) *DenialPayload {
	cap := meta.Capability
	target := meta.Target

	ref := &PolicyRef{
		Source:     "project",
		Preset:     policy.Name,
		ConfigPath: "config.json#permissions",
	}

	// Check if capability is explicitly denied.
	if policy.Denied[cap] {
		return &DenialPayload{
			Denied:     true,
			Capability: cap,
			Target:     target,
			Reason:     fmt.Sprintf("Policy '%s' does not allow %s operations", policy.Name, cap),
			Suggestion: suggestionFor(cap, policy.Name),
			PolicyRef:  ref,
		}
	}

	// Check dry-run requirements for specific capabilities.
	if policy.DryRunRequired[cap] && !dryRun {
		return &DenialPayload{
			Denied:     true,
			Capability: cap,
			Target:     target,
			Reason:     fmt.Sprintf("Policy '%s' requires dryRun=true for %s operations", policy.Name, cap),
			Suggestion: "Set dryRun=true to preview the operation",
			PolicyRef:  ref,
		}
	}

	// Check delete-requires-dryRun for read-write preset.
	if policy.DeleteRequiresDryRun && cap == CapDelete && !dryRun {
		return &DenialPayload{
			Denied:     true,
			Capability: cap,
			Target:     target,
			Reason:     fmt.Sprintf("Policy '%s' requires dryRun=true before delete operations", policy.Name),
			Suggestion: "Set dryRun=true to preview the deletion first",
			PolicyRef:  ref,
		}
	}

	// Capability is allowed.
	return nil
}

// suggestionFor returns a helpful suggestion based on the denied capability.
func suggestionFor(cap, preset string) string {
	switch cap {
	case CapDelete:
		return "Use archive instead, or update project permissions in config.json"
	case CapWrite:
		return "Update project permissions in config.json to allow write operations"
	case CapGenerate:
		return "Update project permissions in config.json to allow generate operations"
	case CapAdmin:
		return "Admin operations require explicit user action"
	default:
		return "Update project permissions in config.json"
	}
}
