package routes

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/hoangtrung1801/know-me/internal/memos"
	"github.com/hoangtrung1801/know-me/internal/models"
)

func TestMemoRoutesLifecycleAndSearch(t *testing.T) {
	router := chi.NewRouter()
	(&MemoRoutes{service: memos.NewService(t.TempDir())}).Register(router)

	create := httptest.NewRecorder()
	router.ServeHTTP(create, httptest.NewRequest(http.MethodPost, "/memos", bytes.NewBufferString(`{"content":"# Daily note"}`)))
	if create.Code != http.StatusCreated {
		t.Fatalf("create = %d: %s", create.Code, create.Body.String())
	}
	var memo models.Memo
	if err := json.NewDecoder(create.Body).Decode(&memo); err != nil {
		t.Fatal(err)
	}

	search := httptest.NewRecorder()
	router.ServeHTTP(search, httptest.NewRequest(http.MethodGet, "/memos?q=DAILY", nil))
	var found []*models.Memo
	if err := json.NewDecoder(search.Body).Decode(&found); err != nil {
		t.Fatal(err)
	}
	if search.Code != http.StatusOK || len(found) != 1 {
		t.Fatalf("search = %d %+v", search.Code, found)
	}

	update := httptest.NewRecorder()
	router.ServeHTTP(update, httptest.NewRequest(http.MethodPatch, "/memos/"+memo.ID, bytes.NewBufferString(`{"content":"Edited"}`)))
	if update.Code != http.StatusOK {
		t.Fatalf("update = %d: %s", update.Code, update.Body.String())
	}

	remove := httptest.NewRecorder()
	router.ServeHTTP(remove, httptest.NewRequest(http.MethodDelete, "/memos/"+memo.ID, nil))
	if remove.Code != http.StatusNoContent {
		t.Fatalf("delete = %d", remove.Code)
	}

	blank := httptest.NewRecorder()
	router.ServeHTTP(blank, httptest.NewRequest(http.MethodPost, "/memos", bytes.NewBufferString(`{"content":" "}`)))
	if blank.Code != http.StatusBadRequest {
		t.Fatalf("blank = %d", blank.Code)
	}
}
