package models

import (
	"errors"
	"time"
)

var (
	ErrMemoNotFound       = errors.New("memo not found")
	ErrInvalidMemoContent = errors.New("memo content is required")
)

type Memo struct {
	ID        string    `json:"id"`
	Content   string    `json:"content"`
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
}
