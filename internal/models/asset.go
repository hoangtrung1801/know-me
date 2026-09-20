package models

import "errors"

var (
	ErrAssetNotFound    = errors.New("asset not found")
	ErrInvalidAsset     = errors.New("invalid asset")
	ErrAssetTooLarge    = errors.New("asset too large")
	ErrUnsupportedAsset = errors.New("unsupported asset type")
)

// Asset represents an uploaded asset or image.
type Asset struct {
	Filename    string `json:"filename"`
	URL         string `json:"url"`
	Name        string `json:"name,omitempty"`
	Size        int64  `json:"size"`
	ContentType string `json:"contentType"`
}
