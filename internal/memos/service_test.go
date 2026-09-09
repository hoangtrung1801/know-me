package memos

import (
	"errors"
	"testing"
	"time"

	"github.com/hoangtrung1801/know-me/internal/models"
)

func TestServiceLifecycleAndSearch(t *testing.T) {
	service := NewService(t.TempDir())
	now := time.Date(2026, 8, 2, 8, 0, 0, 0, time.UTC)
	service.now = func() time.Time { return now }
	first, err := service.Add("  # Morning\n\nCoffee  ")
	if err != nil {
		t.Fatal(err)
	}
	now = now.Add(time.Hour)
	second, err := service.Add("Ship the release")
	if err != nil {
		t.Fatal(err)
	}
	found, err := service.List("COFFEE")
	if err != nil {
		t.Fatal(err)
	}
	if len(found) != 1 || found[0].ID != first.ID {
		t.Fatalf("search = %+v", found)
	}
	now = now.Add(time.Hour)
	updated, err := service.Update(first.ID, "Edited **memo**")
	if err != nil {
		t.Fatal(err)
	}
	if !updated.CreatedAt.Equal(first.CreatedAt) || !updated.UpdatedAt.Equal(now) {
		t.Fatalf("updated = %+v", updated)
	}
	if err := service.Delete(second.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := service.Add(" \n\t "); !errors.Is(err, models.ErrInvalidMemoContent) {
		t.Fatalf("blank add error = %v", err)
	}
	if _, err := service.Update(first.ID, " "); !errors.Is(err, models.ErrInvalidMemoContent) {
		t.Fatalf("blank update error = %v", err)
	}
}
