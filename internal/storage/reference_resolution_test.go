package storage

import (
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/hoangtrung1801/know-me/internal/models"
)

func TestStoreResolveRawReference(t *testing.T) {
	t.Setenv("HOME", t.TempDir())

	root := filepath.Join(t.TempDir(), ".know-me")
	store := NewStore(root)
	if err := store.Init("resolve-test"); err != nil {
		t.Fatalf("init store: %v", err)
	}

	now := time.Now().UTC()
	if err := store.Docs.Create(&models.Doc{
		Path:      "guides/setup",
		Title:     "Setup Guide",
		Tags:      []string{"guide", "semantic"},
		Content:   "# Overview\n\nHello.",
		CreatedAt: now,
		UpdatedAt: now,
	}); err != nil {
		t.Fatalf("create doc: %v", err)
	}
	if err := store.Tasks.Create(&models.Task{
		ID:        "rag001",
		Title:     "Implement runtime",
		Status:    "in-progress",
		Priority:  "high",
		Labels:    []string{"semantic", "cli"},
		CreatedAt: now,
		UpdatedAt: now,
	}); err != nil {
		t.Fatalf("create task: %v", err)
	}
	templateDir := filepath.Join(root, "templates", "go-feature")
	if err := os.MkdirAll(templateDir, 0o755); err != nil {
		t.Fatalf("create template dir: %v", err)
	}
	if err := os.WriteFile(filepath.Join(templateDir, "_template.yaml"), []byte("name: go-feature\ndescription: Go feature\nversion: 1.0.0\n"), 0o644); err != nil {
		t.Fatalf("write template: %v", err)
	}

	resolution, err := store.ResolveRawReference("@doc/guides/setup#overview{implements}")
	if err != nil {
		t.Fatalf("resolve doc ref: %v", err)
	}
	if !resolution.Found {
		t.Fatal("expected doc ref to resolve")
	}
	if resolution.Reference.Relation != "implements" {
		t.Fatalf("relation = %q, want implements", resolution.Reference.Relation)
	}
	if resolution.Reference.Fragment == nil || resolution.Reference.Fragment.Heading != "overview" {
		t.Fatalf("expected heading fragment, got %+v", resolution.Reference.Fragment)
	}
	if resolution.Entity == nil || resolution.Entity.Type != "doc" || resolution.Entity.Path != "guides/setup" {
		t.Fatalf("unexpected doc entity: %+v", resolution.Entity)
	}

	taskResolution, err := store.ResolveRawReference("@task-rag001{blocked-by}")
	if err != nil {
		t.Fatalf("resolve task ref: %v", err)
	}
	if !taskResolution.Found || taskResolution.Entity == nil {
		t.Fatal("expected task ref to resolve")
	}
	if taskResolution.Entity.Status != "in-progress" || taskResolution.Entity.Priority != "high" {
		t.Fatalf("unexpected task entity: %+v", taskResolution.Entity)
	}
	canonicalTaskResolution, err := store.ResolveRawReference("@task/rag001{blocked-by}")
	if err != nil {
		t.Fatalf("resolve canonical task ref: %v", err)
	}
	if !canonicalTaskResolution.Found || canonicalTaskResolution.Entity == nil || canonicalTaskResolution.Entity.ID != taskResolution.Entity.ID {
		t.Fatalf("canonical task did not resolve to same entity: %+v", canonicalTaskResolution)
	}

	templateResolution, err := store.ResolveRawReference("@template/go-feature")
	if err != nil {
		t.Fatalf("resolve template ref: %v", err)
	}
	if !templateResolution.Found || templateResolution.Entity == nil || templateResolution.Entity.ID != "go-feature" {
		t.Fatalf("unexpected template resolution: %+v", templateResolution)
	}
}

func TestStoreResolveRawReferenceInvalid(t *testing.T) {
	store := NewStore(filepath.Join(t.TempDir(), ".know-me"))
	if _, err := store.ResolveRawReference("not-a-ref"); err == nil {
		t.Fatal("expected invalid ref error")
	}
}
