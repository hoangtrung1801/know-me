package search

import (
	"testing"

	"github.com/howznguyen/knowns/internal/models"
	"github.com/howznguyen/knowns/internal/storage"
)

func TestKeywordSearchFiltersProjectScopeAndUsesCompositeIDs(t *testing.T) {
	store := storage.NewStore(t.TempDir())
	for _, task := range []*models.Task{
		{ID: "same", ProjectID: "alpha", Title: "shared needle", Status: "todo"},
		{ID: "same", ProjectID: "beta", Title: "shared needle", Status: "todo"},
		{ID: "global", Title: "shared needle", Status: "todo"},
	} {
		if err := store.Tasks.CreateGlobal(task); err != nil {
			t.Fatal(err)
		}
	}

	results, err := NewEngine(store, nil, nil).Search(SearchOptions{Query: "shared needle", Type: "task", Mode: string(ModeKeyword), ProjectID: "alpha"})
	if err != nil {
		t.Fatal(err)
	}
	if len(results) != 1 || results[0].ID != "alpha:same" || results[0].ProjectID != "alpha" {
		t.Fatalf("project search = %#v, want alpha:same only", results)
	}
}
