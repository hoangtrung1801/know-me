package storage

import (
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/hoangtrung1801/know-me/internal/models"
	"github.com/hoangtrung1801/know-me/internal/util"
)

const (
	// MaxAssetBytes is the maximum size allowed for an uploaded asset (20MB).
	MaxAssetBytes = 20 * 1024 * 1024
)

// AssetStore manages uploaded files and images in .know-me/assets/.
type AssetStore struct {
	root string
}

// NewAssetStore returns an AssetStore rooted at the given store directory.
func NewAssetStore(root string) *AssetStore {
	return &AssetStore{root: root}
}

func (s *AssetStore) assetsDir() string {
	return filepath.Join(s.root, "assets")
}

// detectImageMime inspects bytes and original filename to identify supported image types.
func detectImageMime(data []byte, originalFilename string) (string, string, error) {
	if len(data) == 0 {
		return "", "", models.ErrInvalidAsset
	}

	mimeType := http.DetectContentType(data)

	// WebP detection: RIFF....WEBP
	if len(data) >= 12 && string(data[:4]) == "RIFF" && string(data[8:12]) == "WEBP" {
		mimeType = "image/webp"
	}

	// AVIF detection: ....ftypavif or ....ftypavis
	if len(data) >= 12 && string(data[4:8]) == "ftyp" && (string(data[8:12]) == "avif" || string(data[8:12]) == "avis") {
		mimeType = "image/avif"
	}

	// SVG detection
	sampleLen := len(data)
	if sampleLen > 1024 {
		sampleLen = 1024
	}
	sample := strings.TrimSpace(string(data[:sampleLen]))
	if strings.HasPrefix(sample, "<svg") || (strings.HasPrefix(sample, "<?xml") && strings.Contains(sample, "<svg")) {
		mimeType = "image/svg+xml"
	}

	var ext string
	switch mimeType {
	case "image/png":
		ext = ".png"
	case "image/jpeg":
		ext = ".jpg"
	case "image/gif":
		ext = ".gif"
	case "image/webp":
		ext = ".webp"
	case "image/svg+xml":
		ext = ".svg"
	case "image/avif":
		ext = ".avif"
	case "image/bmp", "image/x-ms-bmp":
		ext = ".bmp"
		mimeType = "image/bmp"
	default:
		fileExt := strings.ToLower(filepath.Ext(originalFilename))
		if (fileExt == ".svg" || fileExt == ".svgz") && (strings.Contains(mimeType, "xml") || strings.Contains(mimeType, "text")) {
			ext = ".svg"
			mimeType = "image/svg+xml"
		} else {
			return "", "", fmt.Errorf("%w: %s", models.ErrUnsupportedAsset, mimeType)
		}
	}

	return mimeType, ext, nil
}

// Save validates and persists an uploaded asset in the assets directory.
func (s *AssetStore) Save(originalFilename string, data []byte) (*models.Asset, error) {
	if len(data) == 0 {
		return nil, models.ErrInvalidAsset
	}
	if len(data) > MaxAssetBytes {
		return nil, fmt.Errorf("%w: size %d exceeds limit %d", models.ErrAssetTooLarge, len(data), MaxAssetBytes)
	}

	mimeType, ext, err := detectImageMime(data, originalFilename)
	if err != nil {
		return nil, err
	}

	timestamp := time.Now().UTC().Format("20060102_150405")
	randomID := util.GenerateID()
	filename := fmt.Sprintf("%s_%s%s", timestamp, randomID, ext)

	targetPath := filepath.Join(s.assetsDir(), filename)
	if err := atomicWrite(targetPath, data); err != nil {
		return nil, fmt.Errorf("save asset: %w", err)
	}

	cleanOriginal := filepath.Base(originalFilename)
	if cleanOriginal == "." || cleanOriginal == "/" || cleanOriginal == "" {
		cleanOriginal = filename
	}

	return &models.Asset{
		Filename:    filename,
		URL:         "/api/assets/" + filename,
		Name:        cleanOriginal,
		Size:        int64(len(data)),
		ContentType: mimeType,
	}, nil
}

// GetAssetPath safely resolves and checks existence of an asset in the store.
func (s *AssetStore) GetAssetPath(filename string) (string, error) {
	if filename == "" {
		return "", models.ErrAssetNotFound
	}
	clean := filepath.Clean(filename)
	if clean != filepath.Base(clean) || clean == "." || clean == ".." || strings.ContainsAny(clean, `/\\`) {
		return "", models.ErrInvalidAsset
	}

	candidate := filepath.Join(s.assetsDir(), clean)
	fi, err := os.Stat(candidate)
	if err != nil {
		if os.IsNotExist(err) {
			return "", models.ErrAssetNotFound
		}
		return "", err
	}
	if fi.IsDir() {
		return "", models.ErrInvalidAsset
	}

	return candidate, nil
}

// Remove deletes an asset by filename.
func (s *AssetStore) Remove(filename string) error {
	path, err := s.GetAssetPath(filename)
	if err != nil {
		return err
	}
	if err := os.Remove(path); err != nil && !os.IsNotExist(err) {
		return fmt.Errorf("remove asset: %w", err)
	}
	return nil
}
