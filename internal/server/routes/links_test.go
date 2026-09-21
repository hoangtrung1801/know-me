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

func TestLinkRoutesTagsCreateAndUpdate(t *testing.T) {
	service := links.NewServiceWithFetcher(t.TempDir(), func(context.Context, string) (links.Metadata, error) {
		return links.Metadata{Title: "Tags Test", Description: "Description"}, nil
	})
	r := chi.NewRouter()
	(&LinkRoutes{service: service}).Register(r)

	// 1. Create with JSON array tags
	body, _ := json.Marshal(map[string]any{
		"url":  "https://example.com/tags-array",
		"tags": []string{"golang", "tools"},
	})
	createReq := httptest.NewRequest(http.MethodPost, "/links", bytes.NewReader(body))
	createReq.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, createReq)
	if rec.Code != http.StatusCreated {
		t.Fatalf("create array status = %d", rec.Code)
	}
	var link1 models.Link
	_ = json.NewDecoder(rec.Body).Decode(&link1)
	if len(link1.Tags) != 2 || link1.Tags[0] != "golang" || link1.Tags[1] != "tools" {
		t.Fatalf("link1.Tags = %#v", link1.Tags)
	}

	// 2. Create with JSON comma-separated string tag
	body2, _ := json.Marshal(map[string]any{
		"url":  "https://example.com/tags-string",
		"tags": "devops,infra",
	})
	createReq2 := httptest.NewRequest(http.MethodPost, "/links", bytes.NewReader(body2))
	createReq2.Header.Set("Content-Type", "application/json")
	rec2 := httptest.NewRecorder()
	r.ServeHTTP(rec2, createReq2)
	if rec2.Code != http.StatusCreated {
		t.Fatalf("create string status = %d", rec2.Code)
	}
	var link2 models.Link
	_ = json.NewDecoder(rec2.Body).Decode(&link2)
	if len(link2.Tags) != 2 || link2.Tags[0] != "devops" || link2.Tags[1] != "infra" {
		t.Fatalf("link2.Tags = %#v", link2.Tags)
	}

	// 3. Update link1 tags via JSON
	patchBody, _ := json.Marshal(map[string]any{
		"tags": []string{"updated-tag"},
	})
	patchReq := httptest.NewRequest(http.MethodPatch, "/links/"+link1.ID, bytes.NewReader(patchBody))
	patchReq.Header.Set("Content-Type", "application/json")
	patchRec := httptest.NewRecorder()
	r.ServeHTTP(patchRec, patchReq)
	if patchRec.Code != http.StatusOK {
		t.Fatalf("patch status = %d", patchRec.Code)
	}
	var updated1 models.Link
	_ = json.NewDecoder(patchRec.Body).Decode(&updated1)
	if len(updated1.Tags) != 1 || updated1.Tags[0] != "updated-tag" {
		t.Fatalf("updated1.Tags = %#v", updated1.Tags)
	}

	// 4. Create with multipart form tags
	var mpBody bytes.Buffer
	w := multipart.NewWriter(&mpBody)
	_ = w.WriteField("url", "https://example.com/tags-mp")
	_ = w.WriteField("tag", "frontend")
	_ = w.WriteField("tag", "react,ui")
	_ = w.Close()
	createMpReq := httptest.NewRequest(http.MethodPost, "/links", &mpBody)
	createMpReq.Header.Set("Content-Type", w.FormDataContentType())
	recMp := httptest.NewRecorder()
	r.ServeHTTP(recMp, createMpReq)
	if recMp.Code != http.StatusCreated {
		t.Fatalf("create mp status = %d", recMp.Code)
	}
	var link3 models.Link
	_ = json.NewDecoder(recMp.Body).Decode(&link3)
	if len(link3.Tags) != 3 || link3.Tags[0] != "frontend" || link3.Tags[1] != "react" || link3.Tags[2] != "ui" {
		t.Fatalf("link3.Tags = %#v", link3.Tags)
	}
}
