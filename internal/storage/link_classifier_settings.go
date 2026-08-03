package storage

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
)

type LinkClassifierConfig struct {
	APIBase string `json:"apiBase"`
	APIKey  string `json:"apiKey,omitempty"`
	Model   string `json:"model"`
}

type LinkClassifierSettingsStore struct {
	filePath string
}

func NewLinkClassifierSettingsStore() *LinkClassifierSettingsStore {
	return NewLinkClassifierSettingsStoreWithPath(filepath.Join(GlobalRootPath(), "link-classifier.json"))
}

func NewLinkClassifierSettingsStoreWithPath(path string) *LinkClassifierSettingsStore {
	return &LinkClassifierSettingsStore{filePath: path}
}

func (s *LinkClassifierSettingsStore) Load() (*LinkClassifierConfig, error) {
	data, err := os.ReadFile(s.filePath)
	if os.IsNotExist(err) {
		return &LinkClassifierConfig{}, nil
	}
	if err != nil {
		return nil, fmt.Errorf("read link classifier settings: %w", err)
	}
	var config LinkClassifierConfig
	if err := json.Unmarshal(data, &config); err != nil {
		return nil, fmt.Errorf("parse link classifier settings: %w", err)
	}
	return &config, nil
}

func (s *LinkClassifierSettingsStore) Save(config LinkClassifierConfig) error {
	if err := os.MkdirAll(filepath.Dir(s.filePath), 0700); err != nil {
		return fmt.Errorf("create link classifier settings directory: %w", err)
	}
	data, err := json.MarshalIndent(config, "", "  ")
	if err != nil {
		return fmt.Errorf("marshal link classifier settings: %w", err)
	}
	if err := os.WriteFile(s.filePath, data, 0600); err != nil {
		return fmt.Errorf("write link classifier settings: %w", err)
	}
	return nil
}
