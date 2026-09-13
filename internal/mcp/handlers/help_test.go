package handlers

import (
	"testing"
)

func testRegistry() map[string]HelpEntry {
	return map[string]HelpEntry{
		"docs.get": {
			When:     "Read documentation without loading more content than needed",
			Params:   map[string]string{"path": "required — doc path", "smart": "bool", "section": "heading title"},
			Why:      "Smart get keeps context small and avoids full long doc",
			Examples: []string{`docs(get, path:"guides/cli-guide", smart:true)`},
			Flow:     "docs(list) for overview → docs(get) for specific doc",
		},
		"docs.list": {
			When:   "List documentation files in the repository",
			Params: map[string]string{"query": "optional — filter pattern"},
		},
		"docs.create": {
			When:   "Create a new document",
			Params: map[string]string{"path": "required", "title": "required", "content": "required"},
		},
		"tasks.update": {
			When:   "Progress task status, check ACs, append notes",
			Params: map[string]string{"taskId": "required", "status": "optional", "appendNotes": "optional"},
			Why:    "appendNotes preserves history; notes replaces all",
		},
		"tasks.create": {
			When:   "Create a new task with title and acceptance criteria",
			Params: map[string]string{"title": "required", "description": "optional", "priority": "optional"},
		},
	}
}

func TestHelpExactMatch(t *testing.T) {
	registry := testRegistry()
	keys := helpMatches(registry, "docs.get")
	if len(keys) != 1 || keys[0] != "docs.get" {
		t.Errorf("expected exact match for docs.get, got %v", keys)
	}
}

func TestHelpWildcard(t *testing.T) {
	registry := testRegistry()
	keys := helpMatches(registry, "docs.*")
	if len(keys) != 3 {
		t.Errorf("expected 3 matches for docs.*, got %d: %v", len(keys), keys)
	}
	for _, k := range keys {
		if !contains(k, "docs.") {
			t.Errorf("expected key to start with docs., got %s", k)
		}
	}
}

func TestHelpKeywordSearch(t *testing.T) {
	registry := testRegistry()
	keys := helpMatches(registry, "section")
	if len(keys) == 0 {
		t.Fatal("expected keyword search for 'section' to find docs.get")
	}
	found := false
	for _, k := range keys {
		if k == "docs.get" {
			found = true
		}
	}
	if !found {
		t.Errorf("expected docs.get in results, got %v", keys)
	}
}

func TestHelpKeywordSearchCaseInsensitive(t *testing.T) {
	registry := testRegistry()
	keys := helpMatches(registry, "SECTION")
	if len(keys) == 0 {
		t.Fatal("expected case-insensitive search for 'SECTION' to find matches")
	}
}

func TestHelpNoMatch(t *testing.T) {
	registry := testRegistry()
	keys := helpMatches(registry, "nonexistent.tool")
	if len(keys) != 0 {
		t.Errorf("expected no matches, got %v", keys)
	}
}

func TestHelpSuggestions(t *testing.T) {
	registry := testRegistry()
	suggestions := helpSuggestions(registry, "tasker")
	if len(suggestions) == 0 {
		t.Fatal("expected suggestions when no match")
	}
	if len(suggestions) > 5 {
		t.Errorf("expected at most 5 suggestions, got %d", len(suggestions))
	}
}

func TestResolveHelpQueriesJSON(t *testing.T) {
	registry := testRegistry()
	result := resolveHelpQueries(registry, []string{"docs.get", "tasks.*"})

	docsSection, ok := result["docs"]
	if !ok {
		t.Fatal("expected 'docs' key in result")
	}
	docsMap := docsSection.(map[string]HelpEntry)
	if _, ok := docsMap["get"]; !ok {
		t.Error("expected 'get' action in docs section")
	}

	tasksSection, ok := result["tasks"]
	if !ok {
		t.Fatal("expected 'tasks' key in result")
	}
	tasksMap := tasksSection.(map[string]HelpEntry)
	if len(tasksMap) != 2 {
		t.Errorf("expected 2 task actions, got %d", len(tasksMap))
	}
}

func TestResolveHelpQueriesNoMatchShowsSuggestions(t *testing.T) {
	registry := testRegistry()
	result := resolveHelpQueries(registry, []string{"nonexistent"})

	if _, ok := result["suggestions"]; !ok {
		t.Error("expected 'suggestions' key when no match found")
	}
}

func TestResolveHelpQueriesEmptyQuery(t *testing.T) {
	registry := testRegistry()
	result := resolveHelpQueries(registry, []string{""})
	if len(result) != 0 {
		t.Errorf("expected empty result for empty query, got %v", result)
	}
}

func contains(s, substr string) bool {
	return len(s) >= len(substr) && s[:len(substr)] == substr
}
