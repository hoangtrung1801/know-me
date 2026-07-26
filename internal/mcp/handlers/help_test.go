package handlers

import (
	"testing"
)

func testRegistry() map[string]HelpEntry {
	return map[string]HelpEntry{
		"code.find": {
			When:     "Locate symbols by name without knowing exact file",
			Params:   map[string]string{"query": "required — name pattern", "path": "optional — restrict scope", "include_body": "bool"},
			Why:      "Semantic lookup finds by structure not string",
			Examples: []string{`code(find, query:"HandleAuth", include_body:true)`},
			Flow:     "code(symbols) for overview → code(find) for specific symbol",
		},
		"code.symbols": {
			When:   "Get structured symbol tree for a file",
			Params: map[string]string{"path": "required — file path"},
		},
		"code.insert": {
			When:   "Add new code before or after a symbol",
			Params: map[string]string{"path": "required", "anchor": "required — symbol name", "position": "before|after", "body": "required"},
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
	keys := helpMatches(registry, "code.find")
	if len(keys) != 1 || keys[0] != "code.find" {
		t.Errorf("expected exact match for code.find, got %v", keys)
	}
}

func TestHelpWildcard(t *testing.T) {
	registry := testRegistry()
	keys := helpMatches(registry, "code.*")
	if len(keys) != 3 {
		t.Errorf("expected 3 matches for code.*, got %d: %v", len(keys), keys)
	}
	for _, k := range keys {
		if !contains(k, "code.") {
			t.Errorf("expected key to start with code., got %s", k)
		}
	}
}

func TestHelpKeywordSearch(t *testing.T) {
	registry := testRegistry()
	keys := helpMatches(registry, "insert")
	if len(keys) == 0 {
		t.Fatal("expected keyword search for 'insert' to find code.insert")
	}
	found := false
	for _, k := range keys {
		if k == "code.insert" {
			found = true
		}
	}
	if !found {
		t.Errorf("expected code.insert in results, got %v", keys)
	}
}

func TestHelpKeywordSearchCaseInsensitive(t *testing.T) {
	registry := testRegistry()
	keys := helpMatches(registry, "SYMBOL")
	if len(keys) == 0 {
		t.Fatal("expected case-insensitive search for 'SYMBOL' to find matches")
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
	suggestions := helpSuggestions(registry, "codex")
	if len(suggestions) == 0 {
		t.Fatal("expected suggestions when no match")
	}
	if len(suggestions) > 5 {
		t.Errorf("expected at most 5 suggestions, got %d", len(suggestions))
	}
}

func TestResolveHelpQueriesJSON(t *testing.T) {
	registry := testRegistry()
	result := resolveHelpQueries(registry, []string{"code.find", "tasks.*"})

	codeSection, ok := result["code"]
	if !ok {
		t.Fatal("expected 'code' key in result")
	}
	codeMap := codeSection.(map[string]HelpEntry)
	if _, ok := codeMap["find"]; !ok {
		t.Error("expected 'find' action in code section")
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
