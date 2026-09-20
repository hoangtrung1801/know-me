package storage

import (
	"errors"
	"os"
	"strings"
	"testing"

	"github.com/hoangtrung1801/know-me/internal/models"
)

var tinyWebP = []byte{
	'R', 'I', 'F', 'F', 0x1a, 0x00, 0x00, 0x00, 'W', 'E', 'B', 'P',
	'V', 'P', '8', 'L', 0x0e, 0x00, 0x00, 0x00, 0x2f, 0x00, 0x00, 0x00,
	0x00, 0x07, 0x10, 0x88, 0x88, 0x08, 0x00, 0x00,
}

var sampleSVG = []byte(`<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><circle cx="5" cy="5" r="4"/></svg>`)

func TestAssetStore_SaveAndGet(t *testing.T) {
	tempDir, err := os.MkdirTemp("", "assetstore-*")
	if err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(tempDir)

	store := NewAssetStore(tempDir)

	asset, err := store.Save("screenshot.png", tinyPNG)
	if err != nil {
		t.Fatalf("expected save to succeed, got %v", err)
	}

	if asset.Name != "screenshot.png" {
		t.Errorf("expected name screenshot.png, got %s", asset.Name)
	}
	if !strings.HasSuffix(asset.Filename, ".png") {
		t.Errorf("expected .png suffix, got %s", asset.Filename)
	}
	if asset.ContentType != "image/png" {
		t.Errorf("expected image/png, got %s", asset.ContentType)
	}
	if asset.Size != int64(len(tinyPNG)) {
		t.Errorf("expected size %d, got %d", len(tinyPNG), asset.Size)
	}
	if asset.URL != "/api/assets/"+asset.Filename {
		t.Errorf("expected URL /api/assets/%s, got %s", asset.Filename, asset.URL)
	}

	// Verify file exists on disk
	filePath, err := store.GetAssetPath(asset.Filename)
	if err != nil {
		t.Fatalf("expected GetAssetPath to succeed, got %v", err)
	}
	data, err := os.ReadFile(filePath)
	if err != nil {
		t.Fatalf("failed to read asset file: %v", err)
	}
	if len(data) != len(tinyPNG) {
		t.Errorf("file size mismatch: expected %d, got %d", len(tinyPNG), len(data))
	}
}

func TestAssetStore_WebPAndSVG(t *testing.T) {
	tempDir, err := os.MkdirTemp("", "assetstore-*")
	if err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(tempDir)

	store := NewAssetStore(tempDir)

	webpAsset, err := store.Save("photo.webp", tinyWebP)
	if err != nil {
		t.Fatalf("expected webp save to succeed, got %v", err)
	}
	if webAssetContentType := webpAsset.ContentType; webAssetContentType != "image/webp" {
		t.Errorf("expected image/webp, got %s", webAssetContentType)
	}
	if !strings.HasSuffix(webpAsset.Filename, ".webp") {
		t.Errorf("expected .webp suffix, got %s", webpAsset.Filename)
	}

	svgAsset, err := store.Save("diagram.svg", sampleSVG)
	if err != nil {
		t.Fatalf("expected svg save to succeed, got %v", err)
	}
	if svgAsset.ContentType != "image/svg+xml" {
		t.Errorf("expected image/svg+xml, got %s", svgAsset.ContentType)
	}
	if !strings.HasSuffix(svgAsset.Filename, ".svg") {
		t.Errorf("expected .svg suffix, got %s", svgAsset.Filename)
	}
}

func TestAssetStore_Rejections(t *testing.T) {
	tempDir, err := os.MkdirTemp("", "assetstore-*")
	if err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(tempDir)

	store := NewAssetStore(tempDir)

	// Empty
	if _, err := store.Save("empty.png", []byte{}); !errors.Is(err, models.ErrInvalidAsset) {
		t.Errorf("expected ErrInvalidAsset on empty, got %v", err)
	}

	// Non-image text
	if _, err := store.Save("file.txt", []byte("plain text content")); !errors.Is(err, models.ErrUnsupportedAsset) {
		t.Errorf("expected ErrUnsupportedAsset on plain text, got %v", err)
	}

	// Path traversal on GetAssetPath
	traversalCases := []string{
		"../secret.txt",
		"/etc/passwd",
		"sub/folder.png",
		"..",
		".",
		"",
	}
	for _, tc := range traversalCases {
		_, err := store.GetAssetPath(tc)
		if err == nil {
			t.Errorf("expected error for traversal case %q, got nil", tc)
		}
	}
}

func TestAssetStore_Remove(t *testing.T) {
	tempDir, err := os.MkdirTemp("", "assetstore-*")
	if err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(tempDir)

	store := NewAssetStore(tempDir)

	asset, err := store.Save("image.png", tinyPNG)
	if err != nil {
		t.Fatal(err)
	}

	if err := store.Remove(asset.Filename); err != nil {
		t.Fatalf("expected Remove to succeed, got %v", err)
	}

	// Getting it should now return ErrAssetNotFound
	_, err = store.GetAssetPath(asset.Filename)
	if !errors.Is(err, models.ErrAssetNotFound) {
		t.Errorf("expected ErrAssetNotFound, got %v", err)
	}
}
