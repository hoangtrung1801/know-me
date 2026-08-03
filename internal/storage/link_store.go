package storage

import (
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"github.com/howznguyen/knowns/internal/models"
	"github.com/howznguyen/knowns/internal/util"
)

// LinkStore persists one global Link per JSON file under root/links.
type LinkStore struct {
	root string
}

func NewLinkStore(root string) *LinkStore {
	return &LinkStore{root: root}
}

func (s *LinkStore) linksDir() string {
	return filepath.Join(s.root, "links")
}

func (s *LinkStore) linkPath(id string) string {
	return filepath.Join(s.linksDir(), id+".json")
}

func validLinkID(id string) bool {
	return id != "" && filepath.Base(id) == id && !strings.ContainsAny(id, `/\\`)
}

func (s *LinkStore) List() ([]*models.Link, error) {
	entries, err := os.ReadDir(s.linksDir())
	if os.IsNotExist(err) {
		return []*models.Link{}, nil
	}
	if err != nil {
		return nil, fmt.Errorf("read links directory: %w", err)
	}

	links := make([]*models.Link, 0, len(entries))
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".json") {
			continue
		}
		var link models.Link
		if err := readJSON(filepath.Join(s.linksDir(), entry.Name()), &link); err != nil {
			return nil, fmt.Errorf("read link %s: %w", entry.Name(), err)
		}
		links = append(links, &link)
	}
	sort.Slice(links, func(i, j int) bool {
		if links[i].CreatedAt.Equal(links[j].CreatedAt) {
			return links[i].ID > links[j].ID
		}
		return links[i].CreatedAt.After(links[j].CreatedAt)
	})
	return links, nil
}

func (s *LinkStore) Tags() ([]string, error) {
	links, err := s.List()
	if err != nil {
		return nil, err
	}
	seen := make(map[string]struct{})
	for _, link := range links {
		for _, tag := range link.Tags {
			tag = strings.TrimSpace(tag)
			if tag != "" {
				seen[tag] = struct{}{}
			}
		}
	}
	tags := make([]string, 0, len(seen))
	for tag := range seen {
		tags = append(tags, tag)
	}
	sort.Strings(tags)
	return tags, nil
}

func (s *LinkStore) Get(id string) (*models.Link, error) {
	if !validLinkID(id) {
		return nil, models.ErrLinkNotFound
	}
	var link models.Link
	if err := readJSON(s.linkPath(id), &link); err != nil {
		if os.IsNotExist(err) {
			return nil, models.ErrLinkNotFound
		}
		return nil, fmt.Errorf("read link %s: %w", id, err)
	}
	return &link, nil
}

func (s *LinkStore) Save(link *models.Link) error {
	if link == nil || !validLinkID(link.ID) {
		return fmt.Errorf("link ID is required")
	}
	return writeJSON(s.linkPath(link.ID), link)
}

func (s *LinkStore) SaveImage(linkID string, data []byte, extension string) (string, error) {
	if !validLinkID(linkID) {
		return "", models.ErrInvalidLinkImage
	}
	extension = strings.TrimPrefix(strings.ToLower(strings.TrimSpace(extension)), ".")
	if extension == "" || strings.ContainsAny(extension, `/\\.`) {
		return "", models.ErrInvalidLinkImage
	}
	name := fmt.Sprintf("%s-%s.%s", linkID, util.GenerateID(), extension)
	relative := filepath.ToSlash(filepath.Join("images", name))
	if err := atomicWrite(filepath.Join(s.linksDir(), filepath.FromSlash(relative)), data); err != nil {
		return "", fmt.Errorf("save link image: %w", err)
	}
	return relative, nil
}

func (s *LinkStore) LocalImagePath(relativePath string) (string, error) {
	if relativePath == "" {
		return "", models.ErrInvalidLinkImage
	}
	if parsed, err := url.Parse(relativePath); err == nil && parsed.Scheme != "" {
		return "", models.ErrInvalidLinkImage
	}
	clean := filepath.Clean(filepath.FromSlash(relativePath))
	imagesRoot := filepath.Join(s.linksDir(), "images")
	candidate := filepath.Join(s.linksDir(), clean)
	rel, err := filepath.Rel(imagesRoot, candidate)
	if err != nil || rel == ".." || strings.HasPrefix(rel, ".."+string(filepath.Separator)) || filepath.IsAbs(rel) {
		return "", models.ErrInvalidLinkImage
	}
	return candidate, nil
}

func (s *LinkStore) RemoveImage(relativePath string) error {
	if relativePath == "" {
		return nil
	}
	if parsed, err := url.Parse(relativePath); err == nil && parsed.Scheme != "" {
		return nil
	}
	path, err := s.LocalImagePath(relativePath)
	if err != nil {
		return err
	}
	if err := os.Remove(path); err != nil && !os.IsNotExist(err) {
		return fmt.Errorf("remove link image: %w", err)
	}
	return nil
}
