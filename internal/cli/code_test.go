package cli

import (
	"bytes"
	"encoding/json"
	"io"
	"os"
	"path/filepath"
	"testing"

	"github.com/hoangtrung1801/know-me/internal/registry"
	"github.com/hoangtrung1801/know-me/internal/storage"
	"github.com/spf13/cobra"
)

func TestRunCodeSearchDoesNotUseRegexFallbackWhenLSPUnavailable(t *testing.T) {
	home, projectRoot := t.TempDir(), t.TempDir()
	t.Setenv("HOME", home)
	t.Setenv("USERPROFILE", home)
	reg := registry.NewRegistryWithPath(filepath.Join(home, ".know-me", "registry.json"))
	if err := reg.Load(); err != nil {
		t.Fatalf("load registry: %v", err)
	}
	project, err := reg.Create("code-search-lsp-only")
	if err != nil {
		t.Fatalf("create project: %v", err)
	}
	store := storage.NewProjectStore(filepath.Join(home, ".know-me"), project.ID, projectRoot)
	if err := store.Init("code-search-lsp-only"); err != nil {
		t.Fatalf("init store: %v", err)
	}
	if err := writeWorkspaceProjectLink(projectRoot, project.ID); err != nil {
		t.Fatalf("write workspace link: %v", err)
	}
	sourcePath := filepath.Join(projectRoot, "Sample.java")
	if err := os.WriteFile(sourcePath, []byte("public class RegexOnlySymbol {}\n"), 0o644); err != nil {
		t.Fatalf("write source: %v", err)
	}

	origDir, _ := os.Getwd()
	if err := os.Chdir(projectRoot); err != nil {
		t.Fatalf("chdir: %v", err)
	}
	t.Cleanup(func() { _ = os.Chdir(origDir) })

	cmd := &cobra.Command{}
	cmd.Flags().String("path", "", "")
	cmd.Flags().Int("limit", 20, "")
	cmd.Flags().Bool("json", false, "")
	if err := cmd.Flags().Set("json", "true"); err != nil {
		t.Fatalf("set json: %v", err)
	}
	if err := cmd.Flags().Set("path", "Sample.java"); err != nil {
		t.Fatalf("set path: %v", err)
	}

	stdout := captureStdout(t, func() {
		if err := runCodeSearch(cmd, []string{"RegexOnlySymbol"}); err != nil {
			t.Fatalf("runCodeSearch: %v", err)
		}
	})

	var payload struct {
		Results []map[string]any `json:"results"`
		Total   int              `json:"total"`
	}
	if err := json.Unmarshal([]byte(stdout), &payload); err != nil {
		t.Fatalf("unmarshal output: %v\n%s", err, stdout)
	}
	if payload.Total != 0 || len(payload.Results) != 0 {
		t.Fatalf("expected no regex fallback results, got total=%d results=%v", payload.Total, payload.Results)
	}
}

func captureStdout(t *testing.T, fn func()) string {
	t.Helper()
	origStdout := os.Stdout
	r, w, err := os.Pipe()
	if err != nil {
		t.Fatalf("pipe: %v", err)
	}
	os.Stdout = w
	defer func() { os.Stdout = origStdout }()
	fn()
	_ = w.Close()
	var out bytes.Buffer
	if _, err := io.Copy(&out, r); err != nil {
		t.Fatalf("read stdout: %v", err)
	}
	return out.String()
}
