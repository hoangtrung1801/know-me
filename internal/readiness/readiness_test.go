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

