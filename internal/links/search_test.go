package links

import (
	"testing"
	"time"

	"github.com/hoangtrung1801/know-me/internal/models"
)

func TestRankLinksOrderingAndFields(t *testing.T) {
	now := time.Now().UTC()
	links := []models.Link{
		{
			ID:          "link-1",
			Title:       "Distributed Systems Design",
			URL:         "https://example.com/books/systems",
			Description: "Guide to distributed architectures and patterns",
			Note:        "Must read for backend infra",
			Tags:        []string{"architecture", "backend"},
			UpdatedAt:   now.Add(-1 * time.Hour),
		},
		{
			ID:          "link-2",
			Title:       "Go Tooling",
			URL:         "https://example.com/golang/distributed-systems",
			Description: "Compiler and runtime flags",
			Note:        "Useful tips",
			Tags:        []string{"golang"},
			UpdatedAt:   now.Add(-2 * time.Hour),
		},
		{
			ID:          "link-3",
			Title:       "Frontend CSS Grid",
			URL:         "https://example.com/css/grid",
			Description: "Styling guide",
			Note:        "Search query only in this secretnote field",
			Tags:        []string{"css", "frontend"},
			UpdatedAt:   now.Add(-3 * time.Hour),
		},
	}

	// 1. Exact-title match outranks partial-URL match.
	// Query: "distributed systems"
	// link-1: exact match in title (+3.0) + tokens in title (5.0+5.0) + tokens in desc (2.0+2.0) -> high score
	// link-2: tokens in URL (3.0+3.0) + exact match in URL (+3.0) -> lower score than title hit
	ranked := RankLinks(links, "distributed systems")
	if len(ranked) < 2 {
		t.Fatalf("expected at least 2 ranked links, got %d", len(ranked))
	}
	if ranked[0].ID != "link-1" {
		t.Fatalf("expected link-1 (title hit) to outrank link-2 (URL hit), got %s", ranked[0].ID)
	}
	if ranked[1].ID != "link-2" {
		t.Fatalf("expected second link to be link-2, got %s", ranked[1].ID)
	}

	// 2. Note-only match: query matching only note returns that link.
	noteRanked := RankLinks(links, "secretnote")
	if len(noteRanked) != 1 || noteRanked[0].ID != "link-3" {
		t.Fatalf("expected only link-3 for note search, got %+v", noteRanked)
	}
	foundNoteField := false
	for _, f := range noteRanked[0].MatchedFields {
		if f == "note" {
			foundNoteField = true
			break
		}
	}
	if !foundNoteField {
		t.Fatalf("expected 'note' in MatchedFields, got %v", noteRanked[0].MatchedFields)
	}

	// 3. Tag-only match: query matching only tag returns that link.
	tagRanked := RankLinks(links, "backend")
	if len(tagRanked) != 1 || tagRanked[0].ID != "link-1" {
		t.Fatalf("expected link-1 for tag 'backend', got %+v", tagRanked)
	}

	// 4. Description-only match.
	descRanked := RankLinks(links, "compiler")
	if len(descRanked) != 1 || descRanked[0].ID != "link-2" {
		t.Fatalf("expected link-2 for description 'compiler', got %+v", descRanked)
	}

	// 5. Empty query returns input order with MatchedBy: ["none"].
	emptyRanked := RankLinks(links, "   ")
	if len(emptyRanked) != len(links) {
		t.Fatalf("expected %d links for empty query, got %d", len(links), len(emptyRanked))
	}
	for i, r := range emptyRanked {
		if r.ID != links[i].ID {
			t.Fatalf("expected link order preserved for empty query, index %d got %s want %s", i, r.ID, links[i].ID)
		}
		if len(r.MatchedBy) != 1 || r.MatchedBy[0] != "none" {
			t.Fatalf("expected MatchedBy: ['none'] for empty query, got %v", r.MatchedBy)
		}
	}

	// 6. No-match returns empty slice.
	noMatch := RankLinks(links, "nonexistentquey12345")
	if len(noMatch) != 0 {
		t.Fatalf("expected 0 results for nonexistent query, got %d", len(noMatch))
	}
}

func TestSearchLinksSemanticFallback(t *testing.T) {
	links := []models.Link{
		{
			ID:    "link-1",
			Title: "Go Release Notes",
			URL:   "https://golang.org",
		},
	}

	// Mode keyword: usedFallback = false
	kwResults, kwFallback := SearchLinks(links, "release", "keyword")
	if kwFallback {
		t.Fatal("expected usedFallback=false for keyword mode")
	}
	if len(kwResults) != 1 {
		t.Fatalf("expected 1 result, got %d", len(kwResults))
	}

	// Mode semantic without provider: usedFallback = true, MatchedBy has "keyword:fallback"
	semResults, semFallback := SearchLinksWithEmbedder(links, "release", "semantic", nil)
	if !semFallback {
		t.Fatal("expected usedFallback=true for semantic mode without provider")
	}
	if len(semResults) != 1 {
		t.Fatalf("expected 1 result, got %d", len(semResults))
	}
	if len(semResults[0].MatchedBy) == 0 || semResults[0].MatchedBy[0] != "keyword:fallback" {
		t.Fatalf("expected MatchedBy[0] to be 'keyword:fallback', got %v", semResults[0].MatchedBy)
	}
	// Same ordering and score
	if semResults[0].ID != kwResults[0].ID || semResults[0].Score != kwResults[0].Score {
		t.Fatalf("expected semantic fallback results to match keyword results, got %+v vs %+v", semResults[0], kwResults[0])
	}
}

func TestSearchLinksSemanticLive(t *testing.T) {
	links := []models.Link{
		{
			ID:          "link-1",
			Title:       "Example Domain",
			URL:         "https://example.com",
			Description: "Official example website for documentation",
		},
		{
			ID:          "link-2",
			Title:       "Cooking Recipes",
			URL:         "https://cooking.org/pasta",
			Description: "How to make Italian pasta",
		},
	}

	// Searching "trang web mẫu" (sample website in Vietnamese) or "sample website"
	// should semantically match link-1 (Example Domain) without keyword hits
	results, fallback := SearchLinks(links, "trang web mẫu", "semantic")
	if fallback {
		t.Fatal("expected fallback=false when multilingual-e5-small is installed")
	}
	if len(results) == 0 {
		t.Fatal("expected at least 1 semantic match for 'trang web mẫu'")
	}
	if results[0].ID != "link-1" {
		t.Fatalf("expected link-1 to be top semantic match, got %s", results[0].ID)
	}
	if len(results[0].MatchedBy) == 0 || results[0].MatchedBy[0] != "semantic:e5-small" {
		t.Fatalf("expected MatchedBy to contain 'semantic:e5-small', got %v", results[0].MatchedBy)
	}
}
