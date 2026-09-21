package cli

import (
	"bytes"
	"context"
	"encoding/json"
	"testing"

	"github.com/hoangtrung1801/know-me/internal/links"
	"github.com/hoangtrung1801/know-me/internal/models"
)

func TestLinkCommandAddAndUpdate(t *testing.T) {
	t.Setenv("HOME", t.TempDir())
	t.Chdir(t.TempDir())
	service := links.NewServiceWithFetcher(t.TempDir(), func(context.Context, string) (links.Metadata, error) {
		return links.Metadata{Title: "SEO title"}, nil
	})
	cmd := newLinkCmd(service)
	cmd.PersistentFlags().Bool("json", false, "JSON output")
	var output bytes.Buffer
	cmd.SetOut(&output)
	cmd.SetArgs([]string{"add", "https://example.com", "--note", "Important article", "--json"})
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
	if link.Note != "Important article" {
		t.Fatalf("note = %q", link.Note)
	}

	output.Reset()
	cmd.SetArgs([]string{"update", link.ID, "--title", "Edited", "--note", "Updated note", "--json"})
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
	if updated.Note != "Updated note" {
		t.Fatalf("updated note = %q", updated.Note)
	}
}

func TestLinkCommandAddAndUpdateTags(t *testing.T) {
	t.Setenv("HOME", t.TempDir())
	t.Chdir(t.TempDir())
	service := links.NewServiceWithFetcher(t.TempDir(), func(context.Context, string) (links.Metadata, error) {
		return links.Metadata{Title: "SEO title"}, nil
	})

	// 1. Add with repeated --tag
	cmd := newLinkCmd(service)
	cmd.PersistentFlags().Bool("json", false, "JSON output")
	var output bytes.Buffer
	cmd.SetOut(&output)
	cmd.SetArgs([]string{"add", "https://example.com/1", "--tag", "golang", "--tag", "docs", "--json"})
	if err := cmd.Execute(); err != nil {
		t.Fatal(err)
	}
	var link1 models.Link
	if err := json.Unmarshal(output.Bytes(), &link1); err != nil {
		t.Fatal(err)
	}
	if len(link1.Tags) != 2 || link1.Tags[0] != "golang" || link1.Tags[1] != "docs" {
		t.Fatalf("link1.Tags = %#v", link1.Tags)
	}

	// 2. Add with -t and comma separation
	cmd2 := newLinkCmd(service)
	cmd2.PersistentFlags().Bool("json", false, "JSON output")
	output.Reset()
	cmd2.SetOut(&output)
	cmd2.SetArgs([]string{"add", "https://example.com/2", "-t", "cli,tools", "--json"})
	if err := cmd2.Execute(); err != nil {
		t.Fatal(err)
	}
	var link2 models.Link
	if err := json.Unmarshal(output.Bytes(), &link2); err != nil {
		t.Fatal(err)
	}
	if len(link2.Tags) != 2 || link2.Tags[0] != "cli" || link2.Tags[1] != "tools" {
		t.Fatalf("link2.Tags = %#v", link2.Tags)
	}

	// 3. Update tags on link1
	cmd3 := newLinkCmd(service)
	cmd3.PersistentFlags().Bool("json", false, "JSON output")
	output.Reset()
	cmd3.SetOut(&output)
	cmd3.SetArgs([]string{"update", link1.ID, "--tag", "refreshed,clean", "--json"})
	if err := cmd3.Execute(); err != nil {
		t.Fatal(err)
	}
	var updated models.Link
	if err := json.Unmarshal(output.Bytes(), &updated); err != nil {
		t.Fatal(err)
	}
	if len(updated.Tags) != 2 || updated.Tags[0] != "refreshed" || updated.Tags[1] != "clean" {
		t.Fatalf("updated.Tags = %#v", updated.Tags)
	}
}
