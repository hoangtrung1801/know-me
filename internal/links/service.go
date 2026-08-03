package links

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/hoangtrung1801/known-me/internal/models"
	"github.com/hoangtrung1801/known-me/internal/storage"
	"github.com/hoangtrung1801/known-me/internal/util"
)

const maxImportedImageBytes = 10 << 20

type FetchFunc func(context.Context, string) (Metadata, error)
type ClassifyFunc func(context.Context, string, Metadata, []string) ([]string, error)

type Service struct {
	store    *storage.LinkStore
	fetch    FetchFunc
	classify ClassifyFunc
	now      func() time.Time
}

func NewService(root string) *Service {
	return NewServiceWithFetcherAndClassifier(root, FetchMetadata, classifierFromGlobalSettings())
}

func classifierFromGlobalSettings() ClassifyFunc {
	settings := storage.NewLinkClassifierSettingsStore()
	return func(ctx context.Context, rawURL string, metadata Metadata, existing []string) ([]string, error) {
		config, err := settings.Load()
		if err != nil {
			return nil, err
		}
		if config.APIBase == "" || config.Model == "" {
			return nil, errors.New("link classifier is not configured")
		}
		return NewOpenAIClassifier(*config).Classify(ctx, rawURL, metadata, existing)
	}
}

func NewServiceWithFetcher(root string, fetch FetchFunc) *Service {
	return NewServiceWithFetcherAndClassifier(root, fetch, nil)
}

func NewServiceWithFetcherAndClassifier(root string, fetch FetchFunc, classify ClassifyFunc) *Service {
	if fetch == nil {
		fetch = FetchMetadata
	}
	return &Service{store: storage.NewLinkStore(root), fetch: fetch, classify: classify, now: func() time.Time { return time.Now().UTC() }}
}

func (s *Service) Add(ctx context.Context, rawURL string, image io.Reader) (*models.Link, error) {
	target, err := validateLinkURL(rawURL)
	if err != nil {
		return nil, err
	}
	metadata, fetchErr := s.fetch(ctx, strings.TrimSpace(rawURL))
	if fetchErr != nil && errors.Is(fetchErr, ErrUnsafeURL) {
		return nil, fetchErr
	}

	now := s.now()
	link := &models.Link{
		ID:          util.GenerateID(),
		URL:         strings.TrimSpace(rawURL),
		Title:       target.Hostname(),
		Description: "",
		CreatedAt:   now,
		UpdatedAt:   now,
	}
	if metadata.Title != "" {
		link.Title = metadata.Title
	}
	link.Description = metadata.Description
	link.Image = metadata.Image
	if fetchErr == nil && s.classify != nil {
		if existing, err := s.store.Tags(); err == nil {
			if tags, err := s.classify(ctx, link.URL, metadata, existing); err == nil {
				link.Tags = normalizeTags(tags)
			}
		}
	}

	newImage := ""
	if image != nil {
		newImage, err = s.importImage(link.ID, image)
		if err != nil {
			return nil, err
		}
		link.Image = newImage
	}
	if err := s.store.Save(link); err != nil {
		_ = s.store.RemoveImage(newImage)
		return nil, fmt.Errorf("save link: %w", err)
	}
	return link, nil
}

func (s *Service) List() ([]*models.Link, error) {
	return s.store.List()
}

func (s *Service) Update(ctx context.Context, id string, title, description *string, image io.Reader) (*models.Link, error) {
	_ = ctx
	link, err := s.store.Get(id)
	if err != nil {
		return nil, err
	}
	if title != nil {
		link.Title = strings.TrimSpace(*title)
	}
	if description != nil {
		link.Description = strings.TrimSpace(*description)
	}
	oldImage := link.Image
	newImage := ""
	if image != nil {
		newImage, err = s.importImage(link.ID, image)
		if err != nil {
			return nil, err
		}
		link.Image = newImage
	}
	link.UpdatedAt = s.now()
	if err := s.store.Save(link); err != nil {
		_ = s.store.RemoveImage(newImage)
		return nil, err
	}
	if newImage != "" && oldImage != newImage {
		_ = s.store.RemoveImage(oldImage)
	}
	return link, nil
}

func (s *Service) LocalImagePath(id string) (string, error) {
	link, err := s.store.Get(id)
	if err != nil {
		return "", err
	}
	return s.store.LocalImagePath(link.Image)
}

func validateLinkURL(rawURL string) (*url.URL, error) {
	target, err := url.Parse(strings.TrimSpace(rawURL))
	if err != nil {
		return nil, fmt.Errorf("%w: %v", ErrInvalidURL, err)
	}
	if target.User != nil || target.Hostname() == "" {
		return nil, ErrInvalidURL
	}
	switch strings.ToLower(target.Scheme) {
	case "http", "https":
		return target, nil
	default:
		return nil, ErrInvalidURL
	}
}

func (s *Service) importImage(linkID string, reader io.Reader) (string, error) {
	data, err := io.ReadAll(io.LimitReader(reader, maxImportedImageBytes+1))
	if err != nil {
		return "", err
	}
	if len(data) > maxImportedImageBytes {
		return "", fmt.Errorf("%w: image exceeds %d bytes", models.ErrInvalidLinkImage, maxImportedImageBytes)
	}
	mimeType := http.DetectContentType(data)
	if len(data) >= 12 && string(data[:4]) == "RIFF" && string(data[8:12]) == "WEBP" {
		mimeType = "image/webp"
	}
	extension := map[string]string{
		"image/jpeg": ".jpg",
		"image/png":  ".png",
		"image/gif":  ".gif",
		"image/webp": ".webp",
	}[mimeType]
	if extension == "" {
		return "", fmt.Errorf("%w: unsupported MIME type %s", models.ErrInvalidLinkImage, mimeType)
	}
	return s.store.SaveImage(linkID, data, extension)
}
