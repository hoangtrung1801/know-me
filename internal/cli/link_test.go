package cli

import (
	"bytes"
	"context"
	"encoding/json"
	"testing"

	"github.com/hoangtrung1801/known-me/internal/links"
	"github.com/hoangtrung1801/known-me/internal/models"
)

func TestLinkCommandAddAndUpdate(t *testing.T) {
	service := links.NewServiceWithFetcher(t.TempDir(), func(context.Context, string) (links.Metadata, error) {
		return links.Metadata{Title: "SEO title"}, nil
	})
	cmd := newLinkCmd(service)
	cmd.PersistentFlags().Bool("json", false, "JSON output")
	var output bytes.Buffer
	cmd.SetOut(&output)
	cmd.SetArgs([]string{"add", "https://example.com", "--json"})
	if err := cmd.Execute(); err != nil {
		t.Fatal(err)
	}
	var link models.Link
	if err := json.Unmarshal(output.Bytes(), &link); err != nil {
		t.Fatal(err)
	}
	if link.Title != "SEO title" {
		t.Fatalf("title = %q", link.Title)
	}

	output.Reset()
	cmd.SetArgs([]string{"update", link.ID, "--title", "Edited", "--json"})
	if err := cmd.Execute(); err != nil {
		t.Fatal(err)
	}
	var updated models.Link
	if err := json.Unmarshal(output.Bytes(), &updated); err != nil {
		t.Fatal(err)
	}
	if updated.Title != "Edited" {
		t.Fatalf("updated title = %q", updated.Title)
	}
}
