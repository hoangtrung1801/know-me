package links

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"strings"
	"testing"
)

var tinyPNG = []byte{0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a}

func TestServiceAddUsesFallbackAndAllowsDuplicates(t *testing.T) {
	fetch := func(context.Context, string) (Metadata, error) {
		return Metadata{}, errors.New("offline")
	}
	service := NewServiceWithFetcher(t.TempDir(), fetch)

	first, err := service.Add(context.Background(), "https://example.com/a", nil)
	if err != nil {
		t.Fatal(err)
	}
	second, err := service.Add(context.Background(), "https://example.com/a", nil)
	if err != nil {
		t.Fatal(err)
	}

	if first.ID == second.ID || first.Title != "example.com" || first.Description != "" || first.Image != "" {
		t.Fatalf("fallback links = %#v %#v", first, second)
	}
}

func TestServiceImportedImageOverridesSEOAndUpdateKeepsMetadata(t *testing.T) {
	fetch := func(context.Context, string) (Metadata, error) {
		return Metadata{Title: "Fetched", Description: "SEO", Image: "https://cdn.example.com/seo.jpg"}, nil
	}
	service := NewServiceWithFetcher(t.TempDir(), fetch)
	link, err := service.Add(context.Background(), "https://example.com", bytes.NewReader(tinyPNG))
	if err != nil {
		t.Fatal(err)
	}
	if strings.HasPrefix(link.Image, "http") {
		t.Fatalf("import did not override SEO image: %#v", link)
	}

	title := "Edited"
	updated, err := service.Update(context.Background(), link.ID, &title, nil, nil)
	if err != nil {
		t.Fatal(err)
	}
	if updated.Title != title || updated.Description != "SEO" {
		t.Fatalf("updated = %#v", updated)
	}
}

func TestServiceRejectsUnsafeURLWithoutSaving(t *testing.T) {
	fetch := func(context.Context, string) (Metadata, error) {
		return Metadata{}, fmt.Errorf("%w: loopback", ErrUnsafeURL)
	}
	service := NewServiceWithFetcher(t.TempDir(), fetch)
	if _, err := service.Add(context.Background(), "http://127.0.0.1", nil); !errors.Is(err, ErrUnsafeURL) {
		t.Fatalf("Add error = %v", err)
	}
	got, err := service.List()
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 0 {
		t.Fatalf("saved unsafe link: %#v", got)
	}
}
