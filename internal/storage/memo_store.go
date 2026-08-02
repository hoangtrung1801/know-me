package storage

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"github.com/howznguyen/knowns/internal/models"
	"gopkg.in/yaml.v3"
)

type MemoStore struct {
	root string
}

type memoFrontmatter struct {
	CreatedAt string `yaml:"createdAt"`
	UpdatedAt string `yaml:"updatedAt"`
}

func NewMemoStore(root string) *MemoStore { return &MemoStore{root: root} }

func (s *MemoStore) dir() string { return filepath.Join(s.root, "memos") }

func (s *MemoStore) path(id string) string { return filepath.Join(s.dir(), id+".md") }

func validMemoID(id string) bool {
	return id != "" && filepath.Base(id) == id && !strings.ContainsAny(id, `/\`)
}

func (s *MemoStore) List() ([]*models.Memo, error) {
	entries, err := os.ReadDir(s.dir())
	if os.IsNotExist(err) {
		return []*models.Memo{}, nil
	}
	if err != nil {
		return nil, fmt.Errorf("read memos directory: %w", err)
	}
	items := make([]*models.Memo, 0, len(entries))
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".md") {
			continue
		}
		id := strings.TrimSuffix(entry.Name(), ".md")
		memo, err := s.Get(id)
		if err != nil {
			return nil, fmt.Errorf("read memo %s: %w", id, err)
		}
		items = append(items, memo)
	}
	sort.Slice(items, func(i, j int) bool {
		if items[i].CreatedAt.Equal(items[j].CreatedAt) {
			return items[i].ID > items[j].ID
		}
		return items[i].CreatedAt.After(items[j].CreatedAt)
	})
	return items, nil
}

func (s *MemoStore) Get(id string) (*models.Memo, error) {
	if !validMemoID(id) {
		return nil, models.ErrMemoNotFound
	}
	data, err := os.ReadFile(s.path(id))
	if errors.Is(err, os.ErrNotExist) {
		return nil, models.ErrMemoNotFound
	}
	if err != nil {
		return nil, err
	}
	yamlBlock, body := splitFrontmatter(string(data))
	if yamlBlock == "" {
		return nil, fmt.Errorf("memo %s: missing frontmatter", id)
	}
	var fm memoFrontmatter
	if err := yaml.Unmarshal([]byte(yamlBlock), &fm); err != nil {
		return nil, fmt.Errorf("memo %s frontmatter: %w", id, err)
	}
	createdAt, err := parseISO(fm.CreatedAt)
	if err != nil {
		return nil, fmt.Errorf("memo %s createdAt: %w", id, err)
	}
	updatedAt, err := parseISO(fm.UpdatedAt)
	if err != nil {
		return nil, fmt.Errorf("memo %s updatedAt: %w", id, err)
	}
	return &models.Memo{
		ID:        id,
		Content:   strings.TrimSpace(body),
		CreatedAt: createdAt,
		UpdatedAt: updatedAt,
	}, nil
}

func (s *MemoStore) Save(memo *models.Memo) error {
	if memo == nil || !validMemoID(memo.ID) {
		return fmt.Errorf("memo ID is required")
	}
	if memo.CreatedAt.IsZero() || memo.UpdatedAt.IsZero() {
		return fmt.Errorf("memo timestamps are required")
	}
	content := fmt.Sprintf(
		"---\ncreatedAt: %s\nupdatedAt: %s\n---\n\n%s\n",
		formatISO(memo.CreatedAt), formatISO(memo.UpdatedAt), strings.TrimSpace(memo.Content),
	)
	return atomicWrite(s.path(memo.ID), []byte(content))
}

func (s *MemoStore) Delete(id string) error {
	if !validMemoID(id) {
		return models.ErrMemoNotFound
	}
	if err := os.Remove(s.path(id)); errors.Is(err, os.ErrNotExist) {
		return models.ErrMemoNotFound
	} else {
		return err
	}
}
