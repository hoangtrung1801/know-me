package links

import (
	"math"
	"sort"
	"strings"
	"sync"

	"github.com/hoangtrung1801/know-me/internal/models"
	"github.com/hoangtrung1801/know-me/internal/search"
)

// Field weights for keyword ranking.
const (
	WeightTitle       = 5.0
	WeightTags        = 4.0
	WeightURL         = 3.0
	WeightDescription = 2.0
	WeightNote        = 1.5
	BonusExactPhrase  = 3.0
)

// RankedLink wraps models.Link with search relevance score and match metadata.
type RankedLink struct {
	models.Link
	Score         float64  `json:"score"`
	MatchedBy     []string `json:"matchedBy,omitempty"`
	MatchedFields []string `json:"matchedFields,omitempty"`
}

// LinkEmbedder describes the embedding methods required for semantic link search.
type LinkEmbedder interface {
	EmbedQuery(text string) ([]float32, error)
	EmbedDocument(text string) ([]float32, error)
}

var (
	defaultEmbedderOnce sync.Once
	defaultEmbedder     LinkEmbedder
)

func getDefaultEmbedder() LinkEmbedder {
	defaultEmbedderOnce.Do(func() {
		emb, err := search.NewEmbedder(search.EmbedderConfig{
			ModelName: "multilingual-e5-small",
		})
		if err == nil {
			defaultEmbedder = emb
		}
	})
	return defaultEmbedder
}

func cosineSimilarity(a, b []float32) float64 {
	if len(a) == 0 || len(b) == 0 || len(a) != len(b) {
		return 0
	}
	var dot, normA, normB float64
	for i := range a {
		ai := float64(a[i])
		bi := float64(b[i])
		dot += ai * bi
		normA += ai * ai
		normB += bi * bi
	}
	if normA == 0 || normB == 0 {
		return 0
	}
	return dot / (math.Sqrt(normA) * math.Sqrt(normB))
}

// RankLinks ranks the provided links by multi-field keyword matching against the query.
// Tokenization: lowercase, split on whitespace, drop empty tokens.
// Returns score-descending order, tie-breaking by UpdatedAt desc then ID desc.
func RankLinks(links []models.Link, query string) []RankedLink {
	normalizedQuery := strings.ToLower(strings.TrimSpace(query))
	if normalizedQuery == "" {
		results := make([]RankedLink, len(links))
		for i, link := range links {
			results[i] = RankedLink{
				Link:      link,
				Score:     0,
				MatchedBy: []string{"none"},
			}
		}
		return results
	}

	tokens := strings.Fields(normalizedQuery)
	var ranked []RankedLink

	for _, link := range links {
		titleLower := strings.ToLower(link.Title)
		urlLower := strings.ToLower(link.URL)
		descLower := strings.ToLower(link.Description)
		noteLower := strings.ToLower(link.Note)

		var tagLowers []string
		if len(link.Tags) > 0 {
			tagLowers = make([]string, len(link.Tags))
			for i, tag := range link.Tags {
				tagLowers[i] = strings.ToLower(tag)
			}
		}

		score := 0.0
		matchedFieldsMap := make(map[string]bool)
		exactMatched := false
		tokenMatched := false

		// Exact-phrase bonus: full normalized query as substring in any field.
		if titleLower != "" && strings.Contains(titleLower, normalizedQuery) {
			score += BonusExactPhrase
			exactMatched = true
			matchedFieldsMap["title"] = true
		}
		if urlLower != "" && strings.Contains(urlLower, normalizedQuery) {
			score += BonusExactPhrase
			exactMatched = true
			matchedFieldsMap["url"] = true
		}
		if descLower != "" && strings.Contains(descLower, normalizedQuery) {
			score += BonusExactPhrase
			exactMatched = true
			matchedFieldsMap["description"] = true
		}
		if noteLower != "" && strings.Contains(noteLower, normalizedQuery) {
			score += BonusExactPhrase
			exactMatched = true
			matchedFieldsMap["note"] = true
		}
		for _, tag := range tagLowers {
			if strings.Contains(tag, normalizedQuery) {
				score += BonusExactPhrase
				exactMatched = true
				matchedFieldsMap["tags"] = true
				break
			}
		}

		// Per-token hits across fields.
		for _, token := range tokens {
			hitInTitle := titleLower != "" && strings.Contains(titleLower, token)
			hitInTags := false
			for _, tag := range tagLowers {
				if strings.Contains(tag, token) {
					hitInTags = true
					break
				}
			}
			hitInURL := urlLower != "" && strings.Contains(urlLower, token)
			hitInDesc := descLower != "" && strings.Contains(descLower, token)
			hitInNote := noteLower != "" && strings.Contains(noteLower, token)

			if hitInTitle {
				score += WeightTitle
				matchedFieldsMap["title"] = true
				tokenMatched = true
			}
			if hitInTags {
				score += WeightTags
				matchedFieldsMap["tags"] = true
				tokenMatched = true
			}
			if hitInURL {
				score += WeightURL
				matchedFieldsMap["url"] = true
				tokenMatched = true
			}
			if hitInDesc {
				score += WeightDescription
				matchedFieldsMap["description"] = true
				tokenMatched = true
			}
			if hitInNote {
				score += WeightNote
				matchedFieldsMap["note"] = true
				tokenMatched = true
			}
		}

		if score > 0 {
			var matchedBy []string
			if exactMatched {
				matchedBy = append(matchedBy, "keyword:exact")
			}
			if tokenMatched {
				matchedBy = append(matchedBy, "keyword")
			}

			// Deterministic field order.
			var matchedFields []string
			for _, f := range []string{"title", "tags", "url", "description", "note"} {
				if matchedFieldsMap[f] {
					matchedFields = append(matchedFields, f)
				}
			}

			ranked = append(ranked, RankedLink{
				Link:          link,
				Score:         score,
				MatchedBy:     matchedBy,
				MatchedFields: matchedFields,
			})
		}
	}

	sort.SliceStable(ranked, func(i, j int) bool {
		if ranked[i].Score != ranked[j].Score {
			return ranked[i].Score > ranked[j].Score
		}
		if !ranked[i].UpdatedAt.Equal(ranked[j].UpdatedAt) {
			return ranked[i].UpdatedAt.After(ranked[j].UpdatedAt)
		}
		return ranked[i].ID > ranked[j].ID
	})

	return ranked
}

// SearchLinks executes link search under the given mode ("keyword", "semantic", "hybrid").
// When semantic or hybrid mode is selected, it uses the local multilingual-e5-small model if available;
// if unavailable or if inference fails, it falls back to RankLinks with usedFallback=true.
func SearchLinks(links []models.Link, query, mode string) ([]RankedLink, bool) {
	return SearchLinksWithEmbedder(links, query, mode, getDefaultEmbedder())
}

// SearchLinksWithEmbedder executes link search with an explicit embedder (or nil for fallback).
func SearchLinksWithEmbedder(links []models.Link, query, mode string, embedder LinkEmbedder) ([]RankedLink, bool) {
	effectiveMode := strings.ToLower(strings.TrimSpace(mode))
	normalizedQuery := strings.TrimSpace(query)

	if effectiveMode == "keyword" || effectiveMode == "" {
		return RankLinks(links, normalizedQuery), false
	}

	// Semantic or hybrid mode:
	if embedder == nil {
		results := RankLinks(links, normalizedQuery)
		for i := range results {
			fallbackMatched := make([]string, 0, len(results[i].MatchedBy)+1)
			fallbackMatched = append(fallbackMatched, "keyword:fallback")
			fallbackMatched = append(fallbackMatched, results[i].MatchedBy...)
			results[i].MatchedBy = fallbackMatched
		}
		return results, true
	}

	if normalizedQuery == "" {
		return RankLinks(links, ""), false
	}

	qVec, err := embedder.EmbedQuery(normalizedQuery)
	if err != nil {
		results := RankLinks(links, normalizedQuery)
		for i := range results {
			fallbackMatched := make([]string, 0, len(results[i].MatchedBy)+1)
			fallbackMatched = append(fallbackMatched, "keyword:fallback")
			fallbackMatched = append(fallbackMatched, results[i].MatchedBy...)
			results[i].MatchedBy = fallbackMatched
		}
		return results, true
	}

	var ranked []RankedLink
	for _, link := range links {
		passage := link.Title
		if len(link.Tags) > 0 {
			passage += "\n" + strings.Join(link.Tags, " ")
		}
		if link.Description != "" {
			passage += "\n" + link.Description
		}
		if link.Note != "" {
			passage += "\n" + link.Note
		}
		if link.URL != "" {
			passage += "\n" + link.URL
		}

		dVec, err := embedder.EmbedDocument(passage)
		if err != nil {
			continue
		}

		sim := cosineSimilarity(qVec, dVec)
		// Semantic similarity threshold: 0.80 (cosine similarity >= 80% for e5 models)
		if sim >= 0.80 {
			score := math.Round(sim*1000) / 10.0
			ranked = append(ranked, RankedLink{
				Link:          link,
				Score:         score,
				MatchedBy:     []string{"semantic:e5-small"},
				MatchedFields: []string{"semantic"},
			})
		}
	}

	sort.SliceStable(ranked, func(i, j int) bool {
		if ranked[i].Score != ranked[j].Score {
			return ranked[i].Score > ranked[j].Score
		}
		if !ranked[i].UpdatedAt.Equal(ranked[j].UpdatedAt) {
			return ranked[i].UpdatedAt.After(ranked[j].UpdatedAt)
		}
		return ranked[i].ID > ranked[j].ID
	})

	return ranked, false
}
