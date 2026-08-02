package storage

import (
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/howznguyen/knowns/internal/models"
)

var tinyPNG = []byte{0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a}

func TestLinkStoreSavesDuplicateURLsAsSeparateFiles(t *testing.T) {
	store := NewLinkStore(t.TempDir())
	now := time.Date(2026, 8, 2, 10, 0, 0, 0, time.UTC)
	first := &models.Link{ID: "link01", URL: "https://example.com", Title: "First", CreatedAt: now, UpdatedAt: now}
	second := &models.Link{ID: "link02", URL: first.URL, Title: "Second", CreatedAt: now.Add(time.Minute), UpdatedAt: now.Add(time.Minute)}

	if err := store.Save(first); err != nil {
		t.Fatal(err)
	}
	if err := store.Save(second); err != nil {
		t.Fatal(err)
	}

	got, err := store.List()
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 2 || got[0].ID != "link02" || got[1].ID != "link01" {
		t.Fatalf("List() = %#v", got)
	}
	for _, id := range []string{"link01", "link02"} {
		if _, err := os.Stat(filepath.Join(store.root, "links", id+".json")); err != nil {
			t.Fatalf("missing %s.json: %v", id, err)
		}
	}
}

func TestLinkStoreImagePathStaysInsideImagesDirectory(t *testing.T) {
	store := NewLinkStore(t.TempDir())
	if _, err := store.LocalImagePath("../registry.json"); !errors.Is(err, models.ErrInvalidLinkImage) {
		t.Fatalf("LocalImagePath traversal error = %v", err)
	}

	path, err := store.SaveImage("link01", tinyPNG, ".png")
	if err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(filepath.ToSlash(path), "images/link01-") {
		t.Fatalf("saved path = %q", path)
	}
}
