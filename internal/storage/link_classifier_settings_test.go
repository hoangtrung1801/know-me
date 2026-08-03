package storage

import (
	"path/filepath"
	"testing"
)

func TestLinkClassifierSettingsStoreRoundTrip(t *testing.T) {
	store := NewLinkClassifierSettingsStoreWithPath(filepath.Join(t.TempDir(), "classifier.json"))
	want := LinkClassifierConfig{APIBase: "https://api.example/v1", APIKey: "secret", Model: "tagger"}
	if err := store.Save(want); err != nil {
		t.Fatal(err)
	}
	got, err := store.Load()
	if err != nil {
		t.Fatal(err)
	}
	if *got != want {
		t.Fatalf("settings = %#v", got)
	}
}
