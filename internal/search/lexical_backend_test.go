package search

import (
	"path/filepath"
	"reflect"
	"sort"
	"strings"
	"testing"
	"time"

	"github.com/hoangtrung1801/know-me/internal/models"
	"github.com/hoangtrung1801/know-me/internal/storage"
)

func TestBM25TokenizeDeterministicTokenBoundaries(t *testing.T) {
	got := BM25Tokenize("Knowns-go rewrite: init_plan v2")
	want := []string{"knowns", "go", "rewrite", "init", "plan", "v2"}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("BM25Tokenize = %#v, want %#v", got, want)
	}
}

func TestBM25LengthNormalizationPrefersFocusedDocument(t *testing.T) {
	shortDoc := lexicalDocFromDoc(&models.Doc{Path: "short", Title: "Short", Content: "needle"})
	longDoc := lexicalDocFromDoc(&models.Doc{Path: "long", Title: "Long", Content: "needle " + strings.Repeat("filler ", 200)})
	corpus := []lexicalDoc{shortDoc, longDoc}
	stats := newBM25CorpusStats(corpus)
	backend := &bm25LexicalBackend{}
	queryTokens := BM25Tokenize("needle")

	shortScore := backend.scoreDocument(shortDoc, "needle", queryTokens, stats)
	longScore := backend.scoreDocument(longDoc, "needle", queryTokens, stats)

	if shortScore.BM25Score <= longScore.BM25Score {
		t.Fatalf("short BM25 score = %.4f, long BM25 score = %.4f; want focused document higher", shortScore.BM25Score, longScore.BM25Score)
	}
}

func TestBM25FieldWeightingAndExactBoosts(t *testing.T) {
	titleDoc := lexicalDocFromDoc(&models.Doc{Path: "title", Title: "Authentication Flow", Content: "overview"})
	contentDoc := lexicalDocFromDoc(&models.Doc{Path: "content", Title: "Overview", Content: "Authentication flow"})
	corpus := []lexicalDoc{titleDoc, contentDoc}
	stats := newBM25CorpusStats(corpus)
	backend := &bm25LexicalBackend{}
	queryTokens := BM25Tokenize("authentication flow")

	titleScore := backend.scoreDocument(titleDoc, "authentication flow", queryTokens, stats)
	contentScore := backend.scoreDocument(contentDoc, "authentication flow", queryTokens, stats)

	if titleScore.FinalScore <= contentScore.FinalScore {
		t.Fatalf("title score = %.4f, content score = %.4f; want weighted title match higher", titleScore.FinalScore, contentScore.FinalScore)
	}
	if !containsKey(titleScore.Boosts, "title_phrase") && !containsKey(titleScore.Boosts, "exact_title") {
		t.Fatalf("expected inspectable title boost, got %+v", titleScore.Boosts)
	}
}

func TestKeywordModeUsesBM25WithoutSemanticAndPreservesResultShape(t *testing.T) {
	store := newSearchTestStore(t)
	now := time.Now().UTC()
	if err := store.Docs.Create(&models.Doc{
		Path:        "specs/semantic-search",
		Title:       "Semantic Search",
		Description: "Specification for semantic search",
		Content:     "Search models and retrieval.",
		Tags:        []string{"spec", "search"},
		CreatedAt:   now,
		UpdatedAt:   now,
	}); err != nil {
		t.Fatalf("create doc: %v", err)
	}
	if err := store.Tasks.Create(&models.Task{
		ID:          "task01",
		Title:       "Semantic search task",
		Description: "Wire keyword search",
		Status:      "todo",
		Priority:    "high",
		Labels:      []string{"search"},
		CreatedAt:   now,
		UpdatedAt:   now,
	}); err != nil {
		t.Fatalf("create task: %v", err)
	}

	engine := NewEngine(store, nil, nil)
	results, err := engine.Search(SearchOptions{Query: "semantic search", Mode: string(ModeKeyword), Limit: 5})
	if err != nil {
		t.Fatalf("Search: %v", err)
	}
	if len(results) == 0 {
		t.Fatal("expected keyword results without semantic search configured")
	}

	top := results[0]
	if top.Type == "" || top.ID == "" || top.Title == "" || top.Score <= 0 || len(top.MatchedBy) != 1 || top.MatchedBy[0] != "keyword" {
		t.Fatalf("result shape not preserved: %+v", top)
	}
	if top.Type == "doc" && top.Path == "" {
		t.Fatalf("doc path missing from result: %+v", top)
	}
}


func TestSearchWithLexicalBackendComparesHeuristicAndBM25Internally(t *testing.T) {
	store := newSearchTestStore(t)
	now := time.Now().UTC()
	if err := store.Docs.Create(&models.Doc{
		Path:      "specs/rag-retrieval-foundation",
		Title:     "RAG Retrieval Foundation",
		Content:   "Retrieval foundation for docs tasks and memories.",
		CreatedAt: now,
		UpdatedAt: now,
	}); err != nil {
		t.Fatalf("create doc: %v", err)
	}

	for _, backend := range []string{lexicalBackendHeuristic, lexicalBackendBM25} {
		results, err := SearchWithLexicalBackend(store, backend, "rag retrieval foundation", SearchOptions{Limit: 5})
		if err != nil {
			t.Fatalf("SearchWithLexicalBackend(%s): %v", backend, err)
		}
		if len(results) == 0 || results[0].ID != "specs/rag-retrieval-foundation" {
			t.Fatalf("backend %s results = %+v", backend, results)
		}
	}
}

func newSearchTestStore(t *testing.T) *storage.Store {
	t.Helper()
	t.Setenv("HOME", t.TempDir())
	root := filepath.Join(t.TempDir(), ".know-me")
	store := storage.NewStore(root)
	if err := store.Init("search-test"); err != nil {
		t.Fatalf("init store: %v", err)
	}
	return store
}

func resultIDsEqual(results []models.SearchResult, want []string) bool {
	got := make([]string, 0, len(results))
	for _, result := range results {
		got = append(got, result.ID)
	}
	return reflect.DeepEqual(sortedStrings(got), sortedStrings(want))
}

func candidateIDsEqual(candidates []models.RetrievalCandidate, want []string) bool {
	got := make([]string, 0, len(candidates))
	for _, candidate := range candidates {
		got = append(got, candidate.ID)
	}
	return reflect.DeepEqual(sortedStrings(got), sortedStrings(want))
}

func sortedStrings(values []string) []string {
	cp := append([]string(nil), values...)
	sort.Strings(cp)
	return cp
}

type recordingVectorStore struct {
	chunks []Chunk
	hashes map[string]string
}

func (s *recordingVectorStore) Load() error { return nil }
func (s *recordingVectorStore) Save() error { return nil }
func (s *recordingVectorStore) Clear() error {
	s.chunks = nil
	s.hashes = map[string]string{}
	return nil
}
func (s *recordingVectorStore) AddChunks(chunks []Chunk) {
	s.chunks = append(s.chunks, chunks...)
}
func (s *recordingVectorStore) RemoveByPrefix(prefix string) {
	filtered := s.chunks[:0]
	for _, chunk := range s.chunks {
		if !strings.HasPrefix(chunk.ID, prefix) {
			filtered = append(filtered, chunk)
		}
	}
	s.chunks = filtered
}
func (s *recordingVectorStore) RemoveByIDs(ids []string) {}
func (s *recordingVectorStore) Search([]float32, VectorSearchOpts) []ScoredChunk {
	return nil
}
func (s *recordingVectorStore) Count() int { return len(s.chunks) }
func (s *recordingVectorStore) NeedsRebuild(string) bool {
	return false
}
func (s *recordingVectorStore) Stats() (int, string, time.Time) {
	return len(s.chunks), "stub", time.Time{}
}
func (s *recordingVectorStore) Close() error  { return nil }
func (s *recordingVectorStore) Model() string { return "stub" }
func (s *recordingVectorStore) GetContentHash(sourceID string) string {
	return s.hashes[sourceID]
}
func (s *recordingVectorStore) SetContentHash(sourceID, hash string) {
	if s.hashes == nil {
		s.hashes = map[string]string{}
	}
	s.hashes[sourceID] = hash
}
func (s *recordingVectorStore) DeleteContentHash(sourceID string) {
	delete(s.hashes, sourceID)
}
func (s *recordingVectorStore) ListContentHashes() map[string]string {
	out := make(map[string]string, len(s.hashes))
	for k, v := range s.hashes {
		out[k] = v
	}
	return out
}
