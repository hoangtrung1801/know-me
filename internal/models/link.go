package models

import (
	"errors"
	"time"
)

var (
	ErrLinkNotFound     = errors.New("link not found")
	ErrInvalidLinkImage = errors.New("invalid link image")
)

// Link is a globally saved URL with fetched or user-supplied presentation data.
type Link struct {
	ID          string    `json:"id"`
	URL         string    `json:"url"`
	Title       string    `json:"title"`
	Description string    `json:"description"`
	Image       string    `json:"image,omitempty"`
	Tags        []string  `json:"tags,omitempty"`
	CreatedAt   time.Time `json:"createdAt"`
	UpdatedAt   time.Time `json:"updatedAt"`
}
