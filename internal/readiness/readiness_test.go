package readiness

import (

	"testing"
	"github.com/hoangtrung1801/know-me/internal/models"
	"github.com/hoangtrung1801/know-me/internal/search"
)


func TestSemanticRuntimeReadinessReportsDisabledState(t *testing.T) {
	t.Setenv("KNOWNS_SEMANTIC_RUNTIME_DISABLED", "1")
	search.DefaultSemanticRuntime().Close()
	t.Cleanup(search.DefaultSemanticRuntime().Close)

	got := buildSemanticRuntimeReadiness()
	if got.Enabled {
		t.Fatalf("enabled = true, want false")
	}
	if got.DisabledBy != "KNOWNS_SEMANTIC_RUNTIME_DISABLED" {
		t.Fatalf("disabledBy = %q", got.DisabledBy)
	}
	if got.Loaded {
		t.Fatalf("loaded = true, want false")
	}
}

func TestSemanticModelInstalledDoesNotRequireONNXForRemoteProviders(t *testing.T) {
	for _, provider := range []string{"api", "ollama"} {
		settings := &models.SemanticSearchSettings{Provider: provider, Model: "remote-model"}
		if !semanticModelInstalled(settings, false) {
			t.Fatalf("provider %q should not require a local ONNX runtime", provider)
		}
	}

	local := &models.SemanticSearchSettings{Provider: "local", Model: "gte-small"}
	if semanticModelInstalled(local, false) {
		t.Fatal("local provider should require an available ONNX runtime")
	}
	if !semanticModelInstalled(local, true) {
		t.Fatal("local provider with ONNX runtime should be ready")
	}
}

func TestBuildCapabilities(t *testing.T) {
	caps := buildCapabilities(nil, nil)
	expected := []string{"task-updates", "doc-updates", "link-management", "memo-management", "validation", "search", "template-generation"}
	for _, want := range expected {
		found := false
		for _, c := range caps {
			if c == want {
				found = true
				break
			}
		}
		if !found {
			t.Errorf("missing expected capability %q in %v", want, caps)
		}
	}

	for _, bad := range []string{"memory-tools", "system-decisions", "decision-migration", "graph", "code-search"} {
		for _, c := range caps {
			if c == bad {
				t.Errorf("unexpected purged capability %q found in %v", bad, caps)
			}
		}
	}
}

