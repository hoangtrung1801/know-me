package routes

import (
	"bytes"
	"encoding/json"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"net/textproto"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/hoangtrung1801/know-me/internal/models"
	"github.com/hoangtrung1801/know-me/internal/storage"
)

func TestAssetRoutes_UploadAndGet(t *testing.T) {
	tempDir := t.TempDir()
	store := storage.NewStore(tempDir)

	r := chi.NewRouter()
	(&AssetRoutes{store: store}).Register(r)

	// 1. Upload via multipart form with "file"
	var body bytes.Buffer
	w := multipart.NewWriter(&body)
	h := make(textproto.MIMEHeader)
	h.Set("Content-Disposition", `form-data; name="file"; filename="test.png"`)
	h.Set("Content-Type", "image/png")
	part, err := w.CreatePart(h)
	if err != nil {
		t.Fatal(err)
	}
	_, _ = part.Write(tinyRoutePNG)
	_ = w.Close()

	req := httptest.NewRequest(http.MethodPost, "/assets", &body)
	req.Header.Set("Content-Type", w.FormDataContentType())
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)

	if rec.Code != http.StatusCreated {
		t.Fatalf("upload failed: status=%d body=%s", rec.Code, rec.Body.String())
	}

	var asset models.Asset
	if err := json.NewDecoder(rec.Body).Decode(&asset); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}

	if asset.Name != "test.png" {
		t.Errorf("expected name test.png, got %s", asset.Name)
	}
	if !strings.HasSuffix(asset.Filename, ".png") {
		t.Errorf("expected .png suffix, got %s", asset.Filename)
	}
	if asset.URL != "/api/assets/"+asset.Filename {
		t.Errorf("expected URL /api/assets/%s, got %s", asset.Filename, asset.URL)
	}

	// 2. Fetch via GET /assets/{filename}
	getReq := httptest.NewRequest(http.MethodGet, "/assets/"+asset.Filename, nil)
	getRec := httptest.NewRecorder()
	r.ServeHTTP(getRec, getReq)

	if getRec.Code != http.StatusOK {
		t.Fatalf("get failed: status=%d body=%s", getRec.Code, getRec.Body.String())
	}
	if getRec.Header().Get("X-Content-Type-Options") != "nosniff" {
		t.Errorf("expected nosniff header, got %s", getRec.Header().Get("X-Content-Type-Options"))
	}
	if !strings.Contains(getRec.Header().Get("Cache-Control"), "immutable") {
		t.Errorf("expected immutable cache header, got %s", getRec.Header().Get("Cache-Control"))
	}
	if len(getRec.Body.Bytes()) != len(tinyRoutePNG) {
		t.Errorf("expected %d bytes, got %d", len(tinyRoutePNG), len(getRec.Body.Bytes()))
	}
}

func TestAssetRoutes_UploadRawImage(t *testing.T) {
	tempDir := t.TempDir()
	store := storage.NewStore(tempDir)

	r := chi.NewRouter()
	(&AssetRoutes{store: store}).Register(r)

	req := httptest.NewRequest(http.MethodPost, "/assets?name=photo.png", bytes.NewReader(tinyRoutePNG))
	req.Header.Set("Content-Type", "image/png")
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)

	if rec.Code != http.StatusCreated {
		t.Fatalf("raw upload failed: status=%d body=%s", rec.Code, rec.Body.String())
	}

	var asset models.Asset
	if err := json.NewDecoder(rec.Body).Decode(&asset); err != nil {
		t.Fatal(err)
	}
	if asset.Name != "photo.png" {
		t.Errorf("expected name photo.png, got %s", asset.Name)
	}
}

func TestAssetRoutes_Errors(t *testing.T) {
	tempDir := t.TempDir()
	store := storage.NewStore(tempDir)

	r := chi.NewRouter()
	(&AssetRoutes{store: store}).Register(r)

	// Non-image upload
	var body bytes.Buffer
	w := multipart.NewWriter(&body)
	part, _ := w.CreateFormField("file")
	_, _ = part.Write([]byte("not an image"))
	_ = w.Close()

	req := httptest.NewRequest(http.MethodPost, "/assets", &body)
	req.Header.Set("Content-Type", w.FormDataContentType())
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for non-image, got %d: %s", rec.Code, rec.Body.String())
	}

	// Missing file field
	emptyBody := bytes.NewBufferString("--boundary--")
	req2 := httptest.NewRequest(http.MethodPost, "/assets", emptyBody)
	req2.Header.Set("Content-Type", "multipart/form-data; boundary=boundary")
	rec2 := httptest.NewRecorder()
	r.ServeHTTP(rec2, req2)

	if rec2.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for missing field, got %d", rec2.Code)
	}

	// Nonexistent asset
	getReq := httptest.NewRequest(http.MethodGet, "/assets/nonexistent.png", nil)
	getRec := httptest.NewRecorder()
	r.ServeHTTP(getRec, getReq)

	if getRec.Code != http.StatusNotFound {
		t.Fatalf("expected 404 for nonexistent, got %d", getRec.Code)
	}

	// Traversal attempt
	travReq := httptest.NewRequest(http.MethodGet, "/assets/..%2Fsecret.png", nil)
	travRec := httptest.NewRecorder()
	r.ServeHTTP(travRec, travReq)

	if travRec.Code != http.StatusNotFound && travRec.Code != http.StatusBadRequest {
		t.Fatalf("expected 404 or 400 for traversal, got %d", travRec.Code)
	}
}

func TestAssetRoutes_DocImageIntegration(t *testing.T) {
	tempDir := t.TempDir()
	store := storage.NewStore(tempDir)

	r := chi.NewRouter()
	(&AssetRoutes{store: store}).Register(r)
	(&DocRoutes{store: store, sse: &fakeBroadcaster{}}).Register(r)

	// 1. Upload image asset
	var body bytes.Buffer
	w := multipart.NewWriter(&body)
	part, _ := w.CreateFormFile("file", "flowchart.png")
	_, _ = part.Write(tinyRoutePNG)
	_ = w.Close()

	uploadReq := httptest.NewRequest(http.MethodPost, "/assets", &body)
	uploadReq.Header.Set("Content-Type", w.FormDataContentType())
	uploadRec := httptest.NewRecorder()
	r.ServeHTTP(uploadRec, uploadReq)

	if uploadRec.Code != http.StatusCreated {
		t.Fatalf("upload failed: %d", uploadRec.Code)
	}
	var asset models.Asset
	_ = json.NewDecoder(uploadRec.Body).Decode(&asset)

	// 2. Create doc containing markdown image
	docPayload, _ := json.Marshal(map[string]any{
		"path":        "architecture",
		"title":       "System Architecture",
		"description": "Overview of components",
		"content":     "# Overview\n\nHere is the architecture diagram:\n\n![" + asset.Name + "](" + asset.URL + ")\n",
	})
	createDocReq := httptest.NewRequest(http.MethodPost, "/docs", bytes.NewReader(docPayload))
	createDocReq.Header.Set("Content-Type", "application/json")
	createDocRec := httptest.NewRecorder()
	r.ServeHTTP(createDocRec, createDocReq)

	if createDocRec.Code != http.StatusCreated {
		t.Fatalf("create doc failed: %d %s", createDocRec.Code, createDocRec.Body.String())
	}

	// 3. Get doc and verify markdown content contains asset URL
	getDocReq := httptest.NewRequest(http.MethodGet, "/docs/architecture", nil)
	getDocRec := httptest.NewRecorder()
	r.ServeHTTP(getDocRec, getDocReq)

	if getDocRec.Code != http.StatusOK {
		t.Fatalf("get doc failed: %d %s", getDocRec.Code, getDocRec.Body.String())
	}
	var docResp struct {
		Content string `json:"content"`
	}
	_ = json.NewDecoder(getDocRec.Body).Decode(&docResp)
	if !strings.Contains(docResp.Content, asset.URL) {
		t.Fatalf("doc content missing asset URL: %q, expected %q", docResp.Content, asset.URL)
	}

	// 4. Fetch the image asset from the URL and verify data
	getAssetReq := httptest.NewRequest(http.MethodGet, "/assets/"+asset.Filename, nil)
	getAssetRec := httptest.NewRecorder()
	r.ServeHTTP(getAssetRec, getAssetReq)

	if getAssetRec.Code != http.StatusOK {
		t.Fatalf("get asset failed: %d", getAssetRec.Code)
	}
	if len(getAssetRec.Body.Bytes()) != len(tinyRoutePNG) {
		t.Fatalf("asset body mismatch: %d bytes vs %d", len(getAssetRec.Body.Bytes()), len(tinyRoutePNG))
	}
}

func TestAssetRoutes_TaskImageIntegration(t *testing.T) {
	tempDir := t.TempDir()
	store := storage.NewStore(tempDir)

	r := chi.NewRouter()
	(&AssetRoutes{store: store}).Register(r)
	(&TaskRoutes{store: store, sse: &fakeBroadcaster{}}).Register(r)

	// 1. Upload image asset
	var body bytes.Buffer
	w := multipart.NewWriter(&body)
	part, _ := w.CreateFormFile("image", "bug.png")
	_, _ = part.Write(tinyRoutePNG)
	_ = w.Close()

	uploadReq := httptest.NewRequest(http.MethodPost, "/assets", &body)
	uploadReq.Header.Set("Content-Type", w.FormDataContentType())
	uploadRec := httptest.NewRecorder()
	r.ServeHTTP(uploadRec, uploadReq)

	if uploadRec.Code != http.StatusCreated {
		t.Fatalf("upload failed: %d", uploadRec.Code)
	}
	var asset models.Asset
	_ = json.NewDecoder(uploadRec.Body).Decode(&asset)

	// 2. Create task with markdown image in description
	taskPayload, _ := json.Marshal(map[string]any{
		"title":       "Fix UI alignment",
		"description": "Notice alignment issue here:\n\n![" + asset.Name + "](" + asset.URL + ")\n",
		"priority":    "high",
	})
	createTaskReq := httptest.NewRequest(http.MethodPost, "/tasks", bytes.NewReader(taskPayload))
	createTaskReq.Header.Set("Content-Type", "application/json")
	createTaskRec := httptest.NewRecorder()
	r.ServeHTTP(createTaskRec, createTaskReq)

	if createTaskRec.Code != http.StatusCreated {
		t.Fatalf("create task failed: %d %s", createTaskRec.Code, createTaskRec.Body.String())
	}
	var createdTask models.Task
	_ = json.NewDecoder(createTaskRec.Body).Decode(&createdTask)

	if !strings.Contains(createdTask.Description, asset.URL) {
		t.Fatalf("task description missing asset URL: %q", createdTask.Description)
	}

	// 3. Get task and verify
	getTaskReq := httptest.NewRequest(http.MethodGet, "/tasks/"+createdTask.ID, nil)
	getTaskRec := httptest.NewRecorder()
	r.ServeHTTP(getTaskRec, getTaskReq)

	if getTaskRec.Code != http.StatusOK {
		t.Fatalf("get task failed: %d", getTaskRec.Code)
	}
	var fetchedTask models.Task
	_ = json.NewDecoder(getTaskRec.Body).Decode(&fetchedTask)
	if !strings.Contains(fetchedTask.Description, asset.URL) {
		t.Fatalf("fetched task description missing asset URL: %q", fetchedTask.Description)
	}
}
