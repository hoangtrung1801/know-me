package storage

import (
	"path/filepath"
	"testing"

	"github.com/howznguyen/knowns/internal/models"
)

func TestUserPrefsStoreLoadEmpty(t *testing.T) {
	t.Parallel()
	store := NewUserPrefsStoreWithPath(filepath.Join(t.TempDir(), "prefs.json"))
	prefs, err := store.Load()
	if err != nil {
		t.Fatalf("Load failed: %v", err)
	}
	if prefs.OpenCodeModels != nil {
		t.Fatal("expected nil OpenCodeModels for missing file")
	}
}

func TestUserPrefsStoreSaveAndLoad(t *testing.T) {
	t.Parallel()
	store := NewUserPrefsStoreWithPath(filepath.Join(t.TempDir(), "prefs.json"))

	prefs := &UserPrefs{
		OpenCodeModels: &models.OpenCodeModelSettings{
			Version: 1,
			DefaultModel: &models.OpenCodeModelRef{
				ProviderID: "anthropic",
				ModelID:    "claude-sonnet-4-5",
			},
			ActiveModels: []string{"anthropic:claude-sonnet-4-5", "openai:gpt-5.4"},
		},
	}
	if err := store.Save(prefs); err != nil {
		t.Fatalf("Save failed: %v", err)
	}

	loaded, err := store.Load()
	if err != nil {
		t.Fatalf("Load failed: %v", err)
	}
	if loaded.OpenCodeModels == nil {
		t.Fatal("expected non-nil OpenCodeModels")
	}
	if loaded.OpenCodeModels.DefaultModel.ProviderID != "anthropic" {
		t.Fatalf("ProviderID = %q, want %q", loaded.OpenCodeModels.DefaultModel.ProviderID, "anthropic")
	}
	if len(loaded.OpenCodeModels.ActiveModels) != 2 {
		t.Fatalf("ActiveModels len = %d, want 2", len(loaded.OpenCodeModels.ActiveModels))
	}
}

func TestUserPrefsStoreOverwrite(t *testing.T) {
	t.Parallel()
	store := NewUserPrefsStoreWithPath(filepath.Join(t.TempDir(), "prefs.json"))

	// Save initial
	store.Save(&UserPrefs{
		OpenCodeModels: &models.OpenCodeModelSettings{
			Version:      1,
			ActiveModels: []string{"a:b"},
		},
	})

	// Overwrite with nil
	store.Save(&UserPrefs{OpenCodeModels: nil})

	loaded, _ := store.Load()
	if loaded.OpenCodeModels != nil {
		t.Fatal("expected nil OpenCodeModels after overwrite")
	}
}
