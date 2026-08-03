package links

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/hoangtrung1801/known-me/internal/storage"
)

type LinkClassifierConfig = storage.LinkClassifierConfig

type OpenAIClassifier struct {
	client *http.Client
	config LinkClassifierConfig
}

func NewOpenAIClassifier(config LinkClassifierConfig) *OpenAIClassifier {
	return &OpenAIClassifier{client: &http.Client{Timeout: 10 * time.Second}, config: config}
}

func (c *OpenAIClassifier) Classify(ctx context.Context, rawURL string, metadata Metadata, existing []string) ([]string, error) {
	if strings.TrimSpace(c.config.APIBase) == "" || strings.TrimSpace(c.config.Model) == "" {
		return nil, fmt.Errorf("classifier API base and model are required")
	}
	existingJSON, err := json.Marshal(existing)
	if err != nil {
		return nil, fmt.Errorf("marshal existing tags: %w", err)
	}
	payload := struct {
		Model    string `json:"model"`
		Messages []struct {
			Role    string `json:"role"`
			Content string `json:"content"`
		} `json:"messages"`
	}{
		Model: c.config.Model,
		Messages: []struct {
			Role    string `json:"role"`
			Content string `json:"content"`
		}{
			{Role: "system", Content: `Classify saved links. Return only valid JSON in the form {"tags":["tag"]}. Return at most three concise tags. Reuse an existing tag when it fits; create a new tag when none fits.`},
			{Role: "user", Content: fmt.Sprintf("URL: %s\nTitle: %s\nDescription: %s\nExisting tags: %s", rawURL, metadata.Title, metadata.Description, existingJSON)},
		},
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return nil, fmt.Errorf("marshal classifier request: %w", err)
	}
	endpoint := strings.TrimRight(strings.TrimSpace(c.config.APIBase), "/") + "/chat/completions"
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("create classifier request: %w", err)
	}
	request.Header.Set("Content-Type", "application/json")
	if c.config.APIKey != "" {
		request.Header.Set("Authorization", "Bearer "+c.config.APIKey)
	}
	response, err := c.client.Do(request)
	if err != nil {
		return nil, fmt.Errorf("classifier request: %w", err)
	}
	defer response.Body.Close()
	if response.StatusCode < http.StatusOK || response.StatusCode >= http.StatusMultipleChoices {
		return nil, fmt.Errorf("classifier request returned %s", response.Status)
	}
	responseBody, err := io.ReadAll(io.LimitReader(response.Body, 1<<20))
	if err != nil {
		return nil, fmt.Errorf("read classifier response: %w", err)
	}
	var result struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
	}
	if err := json.Unmarshal(responseBody, &result); err != nil || len(result.Choices) == 0 {
		return nil, fmt.Errorf("invalid classifier response")
	}
	content := strings.TrimSpace(result.Choices[0].Message.Content)
	content = strings.TrimPrefix(content, "```json")
	content = strings.TrimSuffix(strings.TrimSpace(content), "```")
	var tags struct {
		Tags []string `json:"tags"`
	}
	if err := json.Unmarshal([]byte(strings.TrimSpace(content)), &tags); err != nil {
		return nil, fmt.Errorf("invalid classifier tags: %w", err)
	}
	return normalizeTags(tags.Tags), nil
}

func normalizeTags(tags []string) []string {
	seen := make(map[string]struct{}, len(tags))
	result := make([]string, 0, 3)
	for _, tag := range tags {
		tag = strings.ToLower(strings.TrimSpace(tag))
		if tag == "" {
			continue
		}
		if _, exists := seen[tag]; exists {
			continue
		}
		seen[tag] = struct{}{}
		result = append(result, tag)
		if len(result) == 3 {
			break
		}
	}
	return result
}
