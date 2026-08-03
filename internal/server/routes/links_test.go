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
	"github.com/hoangtrung1801/known-me/internal/links"
	"github.com/hoangtrung1801/known-me/internal/models"
)

func TestLinkRoutesCreateUpdateAndImage(t *testing.T) {
	service := links.NewServiceWithFetcher(t.TempDir(), func(context.Context, string) (links.Metadata, error) {
		return links.Metadata{Title: "Fetched", Description: "Description"}, nil
	})
	r := chi.NewRouter()
	(&LinkRoutes{service: service}).Register(r)

	body, _ := json.Marshal(map[string]string{"url": "https://example.com/article"})
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

	var multipartBody bytes.Buffer
	w := multipart.NewWriter(&multipartBody)
	_ = w.WriteField("title", "Edited")
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
	if edited.Title != "Edited" || edited.Image == "" {
		t.Fatalf("updated link = %+v", edited)
	}

	image := httptest.NewRecorder()
	r.ServeHTTP(image, httptest.NewRequest(http.MethodGet, "/links/"+link.ID+"/image", nil))
	if image.Code != http.StatusOK || image.Header().Get("X-Content-Type-Options") != "nosniff" {
		t.Fatalf("image response = %d, headers=%v", image.Code, image.Header())
	}
}

var tinyRoutePNG = []byte{0x89, 'P', 'N', 'G', 0x0d, 0x0a, 0x1a, 0x0a}
