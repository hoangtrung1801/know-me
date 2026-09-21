package routes

import (
	"bytes"
	"context"
	"encoding/json"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"net/textproto"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/hoangtrung1801/know-me/internal/links"
	"github.com/hoangtrung1801/know-me/internal/models"
)

func TestLinkRoutesCreateUpdateAndImage(t *testing.T) {
	service := links.NewServiceWithFetcher(t.TempDir(), func(context.Context, string) (links.Metadata, error) {
		return links.Metadata{Title: "Fetched", Description: "Description"}, nil
	})
	r := chi.NewRouter()
	(&LinkRoutes{service: service}).Register(r)

	body, _ := json.Marshal(map[string]string{"url": "https://example.com/article", "note": "Important article"})
	create := httptest.NewRequest(http.MethodPost, "/links", bytes.NewReader(body))
	create.Header.Set("Content-Type", "application/json")
	created := httptest.NewRecorder()
	r.ServeHTTP(created, create)
	if created.Code != http.StatusCreated {
		t.Fatalf("create status = %d", created.Code)
	}
	var link models.Link
	if err := json.NewDecoder(created.Body).Decode(&link); err != nil {
		t.Fatal(err)
	}
	if link.Note != "Important article" {
		t.Fatalf("created note = %q", link.Note)
	}

	var multipartBody bytes.Buffer
	w := multipart.NewWriter(&multipartBody)
	_ = w.WriteField("title", "Edited")
	_ = w.WriteField("note", "Edited note")
	h := make(textproto.MIMEHeader)
	h.Set("Content-Disposition", `form-data; name="image"; filename="pixel.png"`)
	h.Set("Content-Type", "image/png")
	part, _ := w.CreatePart(h)
	_, _ = part.Write(tinyRoutePNG)
	_ = w.Close()
	update := httptest.NewRequest(http.MethodPatch, "/links/"+link.ID, &multipartBody)
	update.Header.Set("Content-Type", w.FormDataContentType())
	updated := httptest.NewRecorder()
	r.ServeHTTP(updated, update)
	if updated.Code != http.StatusOK {
		t.Fatalf("update status = %d: %s", updated.Code, updated.Body.String())
	}
	var edited models.Link
	_ = json.NewDecoder(updated.Body).Decode(&edited)
	if edited.Title != "Edited" || edited.Note != "Edited note" || edited.Image == "" {
		t.Fatalf("updated link = %+v", edited)
	}

	image := httptest.NewRecorder()
	r.ServeHTTP(image, httptest.NewRequest(http.MethodGet, "/links/"+link.ID+"/image", nil))
	if image.Code != http.StatusOK || image.Header().Get("X-Content-Type-Options") != "nosniff" {
		t.Fatalf("image response = %d, headers=%v", image.Code, image.Header())
	}
}

func TestLinkRoutesSearch(t *testing.T) {
	service := links.NewServiceWithFetcher(t.TempDir(), func(context.Context, string) (links.Metadata, error) {
		return links.Metadata{Title: "Article Title", Description: "Article Description"}, nil
	})
	r := chi.NewRouter()
	(&LinkRoutes{service: service}).Register(r)

	// Seed a link
	_, err := service.AddWithNote(context.Background(), "https://example.com/article", "Interesting note", nil)
	if err != nil {
		t.Fatal(err)
	}

	// 1. GET /links without ?q returns a bare array
	reqBare := httptest.NewRequest(http.MethodGet, "/links", nil)
	recBare := httptest.NewRecorder()
	r.ServeHTTP(recBare, reqBare)
	if recBare.Code != http.StatusOK {
		t.Fatalf("bare list status = %d", recBare.Code)
	}
	var bareList []models.Link
	if err := json.NewDecoder(recBare.Body).Decode(&bareList); err != nil {
		t.Fatalf("expected bare array decode: %v", err)
	}
	if len(bareList) != 1 {
		t.Fatalf("expected 1 link in bare list, got %d", len(bareList))
	}

	// 2. GET /links?q=article&mode=semantic returns ranked envelope with fallback: true
	reqSem := httptest.NewRequest(http.MethodGet, "/links?q=article&mode=semantic", nil)
	recSem := httptest.NewRecorder()
	r.ServeHTTP(recSem, reqSem)
	if recSem.Code != http.StatusOK {
		t.Fatalf("semantic search status = %d", recSem.Code)
	}
	var semResp struct {
		Links    []links.RankedLink `json:"links"`
		Mode     string             `json:"mode"`
		Fallback bool               `json:"fallback"`
	}
	if err := json.NewDecoder(recSem.Body).Decode(&semResp); err != nil {
		t.Fatalf("decode semantic envelope: %v", err)
	}
	if semResp.Mode != "semantic" {
		t.Fatalf("expected mode=semantic, got mode=%q", semResp.Mode)
	}
	if len(semResp.Links) != 1 || semResp.Links[0].Score <= 0 {
		t.Fatalf("expected 1 scored link, got %+v", semResp.Links)
	}

	// 3. GET /links?q=article&mode=keyword returns ranked envelope with fallback: false
	reqKw := httptest.NewRequest(http.MethodGet, "/links?q=article&mode=keyword", nil)
	recKw := httptest.NewRecorder()
	r.ServeHTTP(recKw, reqKw)
	if recKw.Code != http.StatusOK {
		t.Fatalf("keyword search status = %d", recKw.Code)
	}
	var kwResp struct {
		Links    []links.RankedLink `json:"links"`
		Mode     string             `json:"mode"`
		Fallback bool               `json:"fallback"`
	}
	if err := json.NewDecoder(recKw.Body).Decode(&kwResp); err != nil {
		t.Fatalf("decode keyword envelope: %v", err)
	}
	if kwResp.Mode != "keyword" || kwResp.Fallback {
		t.Fatalf("expected mode=keyword, fallback=false, got mode=%q fallback=%v", kwResp.Mode, kwResp.Fallback)
	}

	// 4. Unknown mode defaults to keyword and fallback false, never 400
	reqUnknown := httptest.NewRequest(http.MethodGet, "/links?q=article&mode=invalid_mode", nil)
	recUnknown := httptest.NewRecorder()
	r.ServeHTTP(recUnknown, reqUnknown)
	if recUnknown.Code != http.StatusOK {
		t.Fatalf("unknown mode status = %d, expected 200", recUnknown.Code)
	}
	var unkResp struct {
		Links    []links.RankedLink `json:"links"`
		Mode     string             `json:"mode"`
		Fallback bool               `json:"fallback"`
	}
	if err := json.NewDecoder(recUnknown.Body).Decode(&unkResp); err != nil {
		t.Fatalf("decode unknown mode envelope: %v", err)
	}
	if unkResp.Mode != "keyword" || unkResp.Fallback {
		t.Fatalf("expected fallback to keyword mode and false fallback, got mode=%q fallback=%v", unkResp.Mode, unkResp.Fallback)
	}
}

var tinyRoutePNG = []byte{0x89, 'P', 'N', 'G', 0x0d, 0x0a, 0x1a, 0x0a}
