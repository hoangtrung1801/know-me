package handlers

import (
	"encoding/json"
	"fmt"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/hoangtrung1801/know-me/internal/models"
	"github.com/hoangtrung1801/know-me/internal/storage"
	"github.com/mark3labs/mcp-go/mcp"
	"github.com/mark3labs/mcp-go/server"
)

type searchToolCapture struct {
	tool mcp.Tool
}

func (capture *searchToolCapture) AddTool(tool mcp.Tool, _ server.ToolHandlerFunc) {
	capture.tool = tool
}

func (capture *searchToolCapture) RegisterHelp(string, HelpEntry) {}

func TestSearchMCPDoesNotExposeEvaluationAction(t *testing.T) {
	capture := &searchToolCapture{}
	RegisterSearchTool(capture, func() *storage.Store { return nil })
	data, err := json.Marshal(capture.tool)
	if err != nil {
		t.Fatal(err)
	}
	var schema map[string]any
	if err := json.Unmarshal(data, &schema); err != nil {
		t.Fatal(err)
	}
	if capture.tool.Name != "search" {
		t.Fatalf("tool = %q, want search", capture.tool.Name)
	}
	inputSchema, ok := schema["inputSchema"].(map[string]any)
	if !ok {
		t.Fatalf("search MCP input schema = %#v", schema["inputSchema"])
	}
	properties, ok := inputSchema["properties"].(map[string]any)
	if !ok {
		t.Fatalf("search MCP properties = %#v", inputSchema["properties"])
	}
	action, ok := properties["action"].(map[string]any)
	if !ok {
		t.Fatalf("search MCP action schema = %#v", properties["action"])
	}
	values, ok := action["enum"].([]any)
	if !ok {
		t.Fatalf("search MCP action enum = %#v", action["enum"])
	}
	actions := make(map[string]bool, len(values))
	for _, value := range values {
		actions[fmt.Sprint(value)] = true
	}
	if actions["eval"] || actions["evaluation"] {
		t.Fatalf("search MCP unexpectedly exposes evaluation action: %#v", actions)
	}
	for _, expected := range []string{"search", "retrieve", "resolve"} {
		if !actions[expected] {
			t.Fatalf("search MCP action enum missing %q: %#v", expected, actions)
		}
	}
}

func TestHandleSearchHybridFallsBackToKeywordCompatibleResults(t *testing.T) {
	store := storage.NewStore(filepath.Join(t.TempDir(), ".know-me"))
	if err := store.Init("search-mcp-test"); err != nil {
		t.Fatalf("init store: %v", err)
	}

	now := time.Now().UTC()
	if err := store.Docs.Create(&models.Doc{
		Path:        "guides/retrieval-foundation",
		Title:       "Retrieval Foundation",
		Description: "Doc-first retrieval foundation guide",
		Content:     "This doc explains the retrieval foundation.",
		Tags:        []string{"rag", "retrieval"},
		CreatedAt:   now,
		UpdatedAt:   now,
	}); err != nil {
		t.Fatalf("create doc: %v", err)
	}

	result, err := handleSearch(func() *storage.Store { return store }, mcp.CallToolRequest{
		Params: mcp.CallToolParams{Arguments: map[string]any{
			"query": "retrieval foundation",
			"mode":  "hybrid",
			"limit": 5,
		}},
	})
	if err != nil {
		t.Fatalf("handleSearch: %v", err)
	}

	text, ok := result.Content[0].(mcp.TextContent)
	if !ok {
		t.Fatalf("unexpected MCP result content: %#v", result.Content[0])
	}
	var results []models.SearchResult
	if err := json.Unmarshal([]byte(text.Text), &results); err != nil {
		t.Fatalf("decode search result: %v\n%s", err, text.Text)
	}
	if len(results) == 0 {
		t.Fatal("expected MCP search results")
	}
	for _, result := range results {
		if strings.Join(result.MatchedBy, ",") != "keyword" {
			t.Fatalf("MCP MatchedBy = %v, want keyword", result.MatchedBy)
		}
		if result.Runtime == nil || !result.Runtime.Degraded {
			t.Fatalf("MCP runtime metadata = %+v, want degraded metadata on fallback result", result.Runtime)
		}
	}
}

func TestHandleRetrieveHybridRuntimeMetadataIsAdditive(t *testing.T) {
	store := storage.NewStore(filepath.Join(t.TempDir(), ".know-me"))
	if err := store.Init("retrieve-mcp-test"); err != nil {
		t.Fatalf("init store: %v", err)
	}
	now := time.Now().UTC()
	if err := store.Docs.Create(&models.Doc{
		Path:      "guides/additive-runtime",
		Title:     "Additive Runtime",
		Content:   "runtime metadata remains additive for retrieve clients",
		CreatedAt: now,
		UpdatedAt: now,
	}); err != nil {
		t.Fatalf("create doc: %v", err)
	}

	result, err := handleRetrieve(func() *storage.Store { return store }, mcp.CallToolRequest{
		Params: mcp.CallToolParams{Arguments: map[string]any{
			"query": "runtime metadata",
			"mode":  "hybrid",
			"limit": 5,
		}},
	})
	if err != nil {
		t.Fatalf("handleRetrieve: %v", err)
	}
	text, ok := result.Content[0].(mcp.TextContent)
	if !ok {
		t.Fatalf("unexpected retrieve content: %#v", result.Content[0])
	}
	var raw map[string]json.RawMessage
	if err := json.Unmarshal([]byte(text.Text), &raw); err != nil {
		t.Fatalf("decode retrieve raw response: %v\n%s", err, text.Text)
	}
	if _, ok := raw["_runtime"]; !ok {
		t.Fatalf("retrieve response missing additive _runtime metadata: %s", text.Text)
	}
	var response models.RetrievalResponse
	if err := json.Unmarshal([]byte(text.Text), &response); err != nil {
		t.Fatalf("decode retrieve compatibility response: %v\n%s", err, text.Text)
	}
	if len(response.Candidates) == 0 {
		t.Fatalf("expected retrieve candidates")
	}
}


func TestResolveReferenceJSON(t *testing.T) {
	t.Setenv("HOME", t.TempDir())

	root := filepath.Join(t.TempDir(), ".know-me")
	store := storage.NewStore(root)
	if err := store.Init("resolve-mcp-test"); err != nil {
		t.Fatalf("init store: %v", err)
	}

	now := time.Now().UTC()
	if err := store.Docs.Create(&models.Doc{
		Path:      "guides/setup",
		Title:     "Setup Guide",
		Tags:      []string{"guide"},
		Content:   "Body",
		CreatedAt: now,
		UpdatedAt: now,
	}); err != nil {
		t.Fatalf("create doc: %v", err)
	}

	out, err := resolveReferenceJSON(store, "@doc/guides/setup:10-12{implements}")
	if err != nil {
		t.Fatalf("resolveReferenceJSON returned error: %v", err)
	}

	var resolution models.SemanticResolution
	if err := json.Unmarshal([]byte(out), &resolution); err != nil {
		t.Fatalf("unmarshal output: %v\n%s", err, out)
	}
	if !resolution.Found || resolution.Entity == nil {
		t.Fatal("expected resolved entity")
	}
	if resolution.Entity.Type != "doc" || resolution.Entity.Path != "guides/setup" {
		t.Fatalf("unexpected entity: %+v", resolution.Entity)
	}
	if resolution.Reference.Relation != "implements" {
		t.Fatalf("relation = %q", resolution.Reference.Relation)
	}
	if resolution.Reference.Fragment == nil || resolution.Reference.Fragment.RangeStart != 10 || resolution.Reference.Fragment.RangeEnd != 12 {
		t.Fatalf("unexpected fragment: %+v", resolution.Reference.Fragment)
	}
}

func TestResolveReferenceJSONInvalid(t *testing.T) {
	store := storage.NewStore(filepath.Join(t.TempDir(), ".know-me"))
	if _, err := resolveReferenceJSON(store, "bad-ref"); err == nil {
		t.Fatal("expected invalid ref error")
	}
}

var (
	errUnexpectedMCPContent  = simpleSearchTestError("unexpected MCP content")
	errExpectedSearchResults = simpleSearchTestError("expected search results")
)

type simpleSearchTestError string

func (e simpleSearchTestError) Error() string {
	return string(e)
}

