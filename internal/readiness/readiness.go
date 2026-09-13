// Package readiness provides a unified readiness payload for Know-Me projects.
// It collects knowledge counts, search status, runtime health, and capabilities
// into one canonical model consumed by CLI, server API, and MCP.
package readiness

import (
	"path/filepath"
	"time"

	"github.com/hoangtrung1801/know-me/internal/models"
	"github.com/hoangtrung1801/know-me/internal/permissions"
	"github.com/hoangtrung1801/know-me/internal/search"
	"github.com/hoangtrung1801/know-me/internal/storage"
	"github.com/hoangtrung1801/know-me/internal/util"
)

// Payload is the canonical readiness response.
// Fields active, projectName, projectPath are preserved for backward compat
// with the existing GET /api/status contract.
type Payload struct {
	Active      bool   `json:"active"`
	ProjectName string `json:"projectName"`
	ProjectPath string `json:"projectPath"`
	Version     string `json:"version"`

	Knowledge    *KnowledgeStatus  `json:"knowledge,omitempty"`
	Search       *SearchStatus     `json:"search,omitempty"`
	Runtime      *RuntimeStatus    `json:"runtime,omitempty"`
	Permissions  *PermissionStatus `json:"permissions,omitempty"`
	Capabilities []string          `json:"capabilities,omitempty"`
}

// KnowledgeStatus reports entity counts.
type KnowledgeStatus struct {
	Docs      int            `json:"docs"`
	Tasks     int            `json:"tasks"`
	Templates int            `json:"templates"`
	Memories  MemoryCounts   `json:"memories"`
	Decisions DecisionCounts `json:"decisions"`
	Relations int            `json:"relations"`
	Imports   int            `json:"imports"`
}

// MemoryCounts breaks memory count by layer.
type MemoryCounts struct {
	Project        int `json:"project"`
	Global         int `json:"global"`
	LegacyDecision int `json:"legacyDecision"`
}

// DecisionCounts separates current guidance from records that require review
// or are retained only for history.
type DecisionCounts struct {
	Total      int `json:"total"`
	Current    int `json:"current"`
	Draft      int `json:"draft"`
	Historical int `json:"historical"`
}

// SearchStatus reports semantic search readiness.
type SearchStatus struct {
	SemanticEnabled   bool                      `json:"semanticEnabled"`
	ModelConfigured   bool                      `json:"modelConfigured"`
	ModelInstalled    bool                      `json:"modelInstalled"`
	ProjectIndexReady bool                      `json:"projectIndexReady"`
	ProjectIndexStale bool                      `json:"projectIndexStale"`
	ProjectIndexModel string                    `json:"projectIndexModel,omitempty"`
	GlobalIndexReady  bool                      `json:"globalIndexReady"`
	GlobalIndexStale  bool                      `json:"globalIndexStale"`
	GlobalIndexModel  string                    `json:"globalIndexModel,omitempty"`
	LastReindex       *time.Time                `json:"lastReindex,omitempty"`
	SemanticRuntime   *SemanticRuntimeReadiness `json:"semanticRuntime,omitempty"`
}

// SemanticRuntimeReadiness reports the shared semantic embedding runtime state.
type SemanticRuntimeReadiness struct {
	Enabled         bool       `json:"enabled"`
	DisabledBy      string     `json:"disabledBy,omitempty"`
	Loaded          bool       `json:"loaded"`
	Entries         int        `json:"entries"`
	ActiveSessions  int        `json:"activeSessions,omitempty"`
	Consumers       int        `json:"consumers,omitempty"`
	IdleTimeout     string     `json:"idleTimeout,omitempty"`
	IdleUnloadAfter *time.Time `json:"idleUnloadAfter,omitempty"`
}

// RuntimeStatus reports runtime health. This is typically injected from a
// cached snapshot on the server side, or probed directly by the CLI.
type RuntimeStatus struct {
	Enabled          bool   `json:"enabled"`
	Running          bool   `json:"running"`
	ConnectedClients int    `json:"connectedClients"`
	QueuedJobs       int    `json:"queuedJobs"`
	RunningJobs      int    `json:"runningJobs"`
	State            string `json:"state"` // "healthy", "degraded", "stopped"
}


// PermissionStatus reports the active AI permission policy.
type PermissionStatus struct {
	Preset              string   `json:"preset"`
	AllowedCapabilities []string `json:"allowedCapabilities"`
	DeniedCapabilities  []string `json:"deniedCapabilities"`
	IsDefault           bool     `json:"isDefault"`
}

// Options configures how BuildReadiness collects data.
type Options struct {
	// Runtime is an optional pre-built runtime snapshot (from server cache).
	// When nil, runtime section is omitted or shows disabled.
	Runtime *RuntimeStatus
}

// BuildReadiness collects all readiness sections from the given store.
// Entity counts and search status are computed real-time.
// Runtime health comes from opts.Runtime (cached snapshot).
func BuildReadiness(store *storage.Store, opts Options) Payload {
	projectPath := store.RepositoryRoot()
	projectName := filepath.Base(projectPath)

	p := Payload{
		Active:      true,
		ProjectName: projectName,
		ProjectPath: projectPath,
		Version:     util.Version,
	}

	p.Knowledge = buildKnowledge(store)
	p.Search = buildSearch(store)
	p.Runtime = opts.Runtime
	p.Permissions = buildPermissions(store)
	p.Capabilities = buildCapabilities(p.Search, p.Runtime)

	return p
}

// InactivePayload returns a minimal payload for when no project is active.
func InactivePayload() Payload {
	return Payload{
		Active:  false,
		Version: util.Version,
	}
}

func buildKnowledge(store *storage.Store) *KnowledgeStatus {
	ks := &KnowledgeStatus{}

	if docs, err := store.Docs.List(); err == nil {
		ks.Docs = len(docs)
	}
	if tasks, err := store.Tasks.List(); err == nil {
		ks.Tasks = len(tasks)
	}
	if templates, err := store.Templates.List(); err == nil {
		ks.Templates = len(templates)
	}



	return ks
}

func buildSearch(store *storage.Store) *SearchStatus {
	ss := &SearchStatus{}
	ss.SemanticRuntime = buildSemanticRuntimeReadiness()

	cfg, err := store.Config.Load()
	if err != nil {
		return ss
	}

	if cfg.Settings.SemanticSearch != nil {
		sem := cfg.Settings.SemanticSearch
		ss.SemanticEnabled = sem.Enabled
		ss.ModelConfigured = sem.Model != ""

		onnxAvail, _ := search.IsONNXAvailable()
		ss.ModelInstalled = semanticModelInstalled(sem, onnxAvail)
	}

	// Project index readiness.
	searchDir := filepath.Join(store.Root, ".search")
	vs := search.NewSQLiteVectorStore(searchDir, "", 0)
	count, projectIndexModel, indexedAt := vs.Stats()
	ss.ProjectIndexReady = count > 0
	ss.ProjectIndexModel = projectIndexModel
	if ss.ProjectIndexReady && cfg.Settings.SemanticSearch != nil {
		configuredModel := cfg.Settings.SemanticSearch.Model
		ss.ProjectIndexStale = configuredModel != "" && projectIndexModel != "" && projectIndexModel != configuredModel
	}
	if !indexedAt.IsZero() {
		ss.LastReindex = &indexedAt
	}

	// Global index readiness.
	globalRoot := storage.GlobalSemanticStoreRoot()
	globalSearchDir := filepath.Join(globalRoot, ".search")
	gvs := search.NewSQLiteVectorStore(globalSearchDir, "", 0)
	gCount, globalIndexModel, _ := gvs.Stats()
	ss.GlobalIndexReady = gCount > 0
	ss.GlobalIndexModel = globalIndexModel
	if ss.GlobalIndexReady && cfg.Settings.SemanticSearch != nil {
		configuredModel := cfg.Settings.SemanticSearch.Model
		ss.GlobalIndexStale = configuredModel != "" && globalIndexModel != "" && globalIndexModel != configuredModel
	}

	return ss
}

func semanticModelInstalled(settings *models.SemanticSearchSettings, onnxAvailable bool) bool {
	if settings == nil || settings.Model == "" {
		return false
	}
	if settings.Provider == "api" || settings.Provider == "ollama" {
		// Remote providers manage model availability outside the bundled
		// ONNX runtime. Runtime health is reported separately.
		return true
	}
	return onnxAvailable
}

func buildSemanticRuntimeReadiness() *SemanticRuntimeReadiness {
	status := search.ObservedSemanticRuntimeStatus()
	readiness := &SemanticRuntimeReadiness{
		Enabled:     status.Enabled,
		DisabledBy:  status.DisabledBy,
		Entries:     len(status.Entries),
		IdleTimeout: status.IdleTimeout.Round(time.Second).String(),
	}
	var idleUnloadAfter time.Time
	for _, entry := range status.Entries {
		if entry.Loaded {
			readiness.Loaded = true
		}
		readiness.ActiveSessions += entry.ActiveSessions
		readiness.Consumers += len(entry.StoreConsumers)
		if entry.IdleUnloadAfter.After(idleUnloadAfter) {
			idleUnloadAfter = entry.IdleUnloadAfter
		}
	}
	if !idleUnloadAfter.IsZero() {
		readiness.IdleUnloadAfter = &idleUnloadAfter
	}
	return readiness
}


func buildCapabilities(ss *SearchStatus, rs *RuntimeStatus) []string {
	var caps []string

	// Always available when project is active.
	caps = append(caps, "task-updates", "doc-updates", "memory-tools", "system-decisions", "decision-migration", "validation")

	// Search capabilities.
	caps = append(caps, "search") // keyword search always available
	if ss != nil && ss.SemanticEnabled && ss.ModelInstalled && ss.ProjectIndexReady {
		caps = append(caps, "semantic-search")
	}

	// Template generation always available.
	caps = append(caps, "template-generation")

	// Code and graph features if code index exists.
	if ss != nil && ss.ProjectIndexReady {
		caps = append(caps, "code-search", "graph")
	}

	// Browser chat requires runtime.
	if rs != nil && rs.Running && rs.State == "healthy" {
		caps = append(caps, "browser-chat")
	}

	return caps
}

func buildPermissions(store *storage.Store) *PermissionStatus {
	cfg, err := store.Config.Load()
	if err != nil {
		// Can't load config — report default.
		return &PermissionStatus{
			Preset:              permissions.DefaultPreset,
			AllowedCapabilities: sortedKeys(permissions.EffectivePolicy(nil).Allowed),
			DeniedCapabilities:  sortedKeys(permissions.EffectivePolicy(nil).Denied),
			IsDefault:           true,
		}
	}

	permCfg := cfg.Settings.Permissions
	isDefault := permCfg == nil || permCfg.Preset == ""
	policy := permissions.EffectivePolicy(permCfg)

	ps := &PermissionStatus{
		Preset:              policy.Name,
		AllowedCapabilities: sortedKeys(policy.Allowed),
		DeniedCapabilities:  sortedKeys(policy.Denied),
		IsDefault:           isDefault,
	}

	return ps
}

// sortedKeys returns the keys of a bool map in sorted order.
func sortedKeys(m map[string]bool) []string {
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	// Simple insertion sort for small slices.
	for i := 1; i < len(keys); i++ {
		for j := i; j > 0 && keys[j] < keys[j-1]; j-- {
			keys[j], keys[j-1] = keys[j-1], keys[j]
		}
	}
	return keys
}
