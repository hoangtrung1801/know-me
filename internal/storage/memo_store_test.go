package storage

import (
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/hoangtrung1801/known-me/internal/models"
)

func TestMemoStoreRoundTripOrderingAndDelete(t *testing.T) {
	root := t.TempDir()
	store := NewMemoStore(root)
	first := &models.Memo{ID: "aaaaaa", Content: "# First", CreatedAt: time.Date(2026, 8, 1, 9, 0, 0, 0, time.UTC), UpdatedAt: time.Date(2026, 8, 1, 9, 0, 0, 0, time.UTC)}
	second := &models.Memo{ID: "bbbbbb", Content: "Second **memo**", CreatedAt: time.Date(2026, 8, 2, 9, 0, 0, 0, time.UTC), UpdatedAt: time.Date(2026, 8, 2, 9, 0, 0, 0, time.UTC)}
	if err := store.Save(first); err != nil {
		t.Fatal(err)
	}
	if err := store.Save(second); err != nil {
		t.Fatal(err)
	}
	data, err := os.ReadFile(filepath.Join(root, "memos", "aaaaaa.md"))
	if err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(string(data), "---\ncreatedAt:") || !strings.Contains(string(data), "\n# First\n") {
		t.Fatalf("memo file = %q", data)
	}
	items, err := store.List()
	if err != nil {
		t.Fatal(err)
	}
	if len(items) != 2 || items[0].ID != second.ID || items[1].ID != first.ID {
		t.Fatalf("ordered memos = %+v", items)
	}
	if _, err := store.Get("../escape"); !errors.Is(err, models.ErrMemoNotFound) {
		t.Fatalf("unsafe ID error = %v", err)
	}
	if err := store.Delete(first.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := store.Get(first.ID); !errors.Is(err, models.ErrMemoNotFound) {
		t.Fatalf("deleted memo error = %v", err)
	}
}
