package memos

import (
	"strings"
	"time"

	"github.com/hoangtrung1801/know-me/internal/models"
	"github.com/hoangtrung1801/know-me/internal/storage"
	"github.com/hoangtrung1801/know-me/internal/util"
)

type Service struct {
	store *storage.MemoStore
	now   func() time.Time
}

func NewService(root string) *Service {
	return &Service{
		store: storage.NewMemoStore(root),
		now:   func() time.Time { return time.Now().UTC() },
	}
}

func normalizeContent(value string) (string, error) {
	value = strings.TrimSpace(value)
	if value == "" {
		return "", models.ErrInvalidMemoContent
	}
	return value, nil
}

func (s *Service) Add(value string) (*models.Memo, error) {
	value, err := normalizeContent(value)
	if err != nil {
		return nil, err
	}
	now := s.now().UTC()
	memo := &models.Memo{ID: util.GenerateID(), Content: value, CreatedAt: now, UpdatedAt: now}
	if err := s.store.Save(memo); err != nil {
		return nil, err
	}
	return memo, nil
}

func (s *Service) List(query string) ([]*models.Memo, error) {
	items, err := s.store.List()
	if err != nil {
		return nil, err
	}
	query = strings.ToLower(strings.TrimSpace(query))
	if query == "" {
		return items, nil
	}
	found := make([]*models.Memo, 0)
	for _, memo := range items {
		if strings.Contains(strings.ToLower(memo.Content), query) {
			found = append(found, memo)
		}
	}
	return found, nil
}

func (s *Service) Update(id, value string) (*models.Memo, error) {
	value, err := normalizeContent(value)
	if err != nil {
		return nil, err
	}
	memo, err := s.store.Get(id)
	if err != nil {
		return nil, err
	}
	memo.Content = value
	memo.UpdatedAt = s.now().UTC()
	if err := s.store.Save(memo); err != nil {
		return nil, err
	}
	return memo, nil
}

func (s *Service) Delete(id string) error { return s.store.Delete(id) }
