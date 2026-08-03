# Link Auto-Tagging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Save up to three LLM-generated tags with each newly added global link.

**Architecture:** `links.Service.Add` will classify successfully fetched SEO metadata before saving the link. Tags live directly on `models.Link`; the service derives reusable tags from existing saved links, while a small global settings store supplies the OpenAI-compatible chat-completions configuration.

**Tech Stack:** Go, chi, standard-library `net/http` and `encoding/json`, React, TypeScript, Tailwind, existing Playwright/Vite tooling.

## Global Constraints

- Preserve existing URL/SSRF protections and metadata fetch limits.
- Send only the URL, fetched title, and fetched description to the classifier.
- Return at most three non-empty, normalized tags; reuse existing tags whenever suitable.
- A metadata or classifier failure must still create the link with no automatic tags.
- Keep the API key server-side: configuration reads report only that a key is configured.
- Do not add a tag database, tag management UI, background job, or dependency.

---

## File Structure

- `internal/models/link.go`: persist `Tags` in link JSON and REST responses.
- `internal/storage/link_store.go`: derive the distinct global tag vocabulary from saved links.
- `internal/storage/link_classifier_settings.go`: persist global API base URL, key, and model.
- `internal/links/classifier.go`: make and validate one chat-completions request.
- `internal/links/service.go`: call classification non-fatally during add.
- `internal/server/routes/link_classifier.go`: expose safe settings read/write/test endpoints.
- `ui/src/api/client.ts`, `ui/src/pages/ConfigPage.tsx`, `ui/src/pages/LinksPage.tsx`: configure the classifier and render returned tags.

### Task 1: Persist tags and classify a new link

**Files:**
- Modify: `internal/models/link.go`
- Modify: `internal/storage/link_store.go`
- Modify: `internal/links/service.go`
- Create: `internal/links/classifier.go`
- Modify: `internal/links/service_test.go`
- Create: `internal/links/classifier_test.go`

**Interfaces:**
- Consumes: `FetchFunc(context.Context, string) (Metadata, error)` and `storage.LinkStore.List()`.
- Produces: `type ClassifyFunc func(context.Context, string, Metadata, []string) ([]string, error)`.
- Produces: `NewServiceWithFetcherAndClassifier(root string, fetch FetchFunc, classify ClassifyFunc) *Service`.
- Produces: `func (s *LinkStore) Tags() ([]string, error)`, returning sorted unique non-empty tags.

- [ ] **Step 1: Write failing service tests**

```go
func TestServiceAddPersistsNormalizedClassifierTags(t *testing.T) {
    service := NewServiceWithFetcherAndClassifier(t.TempDir(),
        func(context.Context, string) (Metadata, error) {
            return Metadata{Title: "Go release", Description: "Language news"}, nil
        },
        func(_ context.Context, _ string, got Metadata, existing []string) ([]string, error) {
            if got.Title != "Go release" || !reflect.DeepEqual(existing, []string{"golang"}) {
                t.Fatalf("classifier input = %#v %#v", got, existing)
            }
            return []string{"Golang", " releases ", "golang", "extra"}, nil
        })
    if err := service.store.Save(&models.Link{ID: "seed", Tags: []string{"golang"}}); err != nil { t.Fatal(err) }
    link, err := service.Add(context.Background(), "https://example.com", nil)
    if err != nil { t.Fatal(err) }
    if !reflect.DeepEqual(link.Tags, []string{"golang", "releases", "extra"}) { t.Fatalf("tags = %#v", link.Tags) }
}

func TestServiceAddSavesWithoutTagsWhenClassifierFails(t *testing.T) {
    service := NewServiceWithFetcherAndClassifier(t.TempDir(),
        func(context.Context, string) (Metadata, error) { return Metadata{Title: "Fetched"}, nil },
        func(context.Context, string, Metadata, []string) ([]string, error) { return nil, errors.New("offline") })
    link, err := service.Add(context.Background(), "https://example.com", nil)
    if err != nil || len(link.Tags) != 0 { t.Fatalf("link=%#v err=%v", link, err) }
}
```

- [ ] **Step 2: Run the focused tests to verify they fail**

Run: `go test ./internal/links -run 'TestServiceAdd(PersistsNormalizedClassifierTags|SavesWithoutTagsWhenClassifierFails)' -count=1`

Expected: FAIL because the classifier constructor and `Link.Tags` do not exist.

- [ ] **Step 3: Implement the minimal link tag flow**

```go
type Link struct {
    // existing fields
    Tags []string `json:"tags,omitempty"`
}

type ClassifyFunc func(context.Context, string, Metadata, []string) ([]string, error)

// In Add, only after a successful metadata fetch:
if fetchErr == nil && s.classify != nil {
    if existing, err := s.store.Tags(); err == nil {
        if tags, err := s.classify(ctx, metadata, existing); err == nil {
            link.Tags = normalizeTags(tags)
        }
    }
}
```

Implement `LinkStore.Tags` by reusing `List`, collecting trimmed non-empty values in a map, and sorting them. Implement `normalizeTags` in `classifier.go`: trim, lowercase, deduplicate while retaining order, and stop at three values.

- [ ] **Step 4: Write a failing OpenAI-compatible classifier contract test**

```go
func TestOpenAIClassifierPostsMetadataAndParsesTags(t *testing.T) {
    server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        if r.URL.Path != "/v1/chat/completions" || r.Header.Get("Authorization") != "Bearer secret" {
            t.Fatalf("request = %s %q", r.URL, r.Header.Get("Authorization"))
        }
        var payload map[string]any
        _ = json.NewDecoder(r.Body).Decode(&payload)
        if payload["model"] != "tagger" { t.Fatalf("payload = %#v", payload) }
        _, _ = w.Write([]byte(`{"choices":[{"message":{"content":"{\"tags\":[\"golang\",\"release\"]}"}}]}`))
    }))
    defer server.Close()
    tags, err := NewOpenAIClassifier(LinkClassifierConfig{APIBase: server.URL + "/v1", APIKey: "secret", Model: "tagger"}).Classify(context.Background(), Metadata{Title: "Go"}, []string{"golang"})
    if err != nil || !reflect.DeepEqual(tags, []string{"golang", "release"}) { t.Fatalf("tags=%#v err=%v", tags, err) }
}
```

- [ ] **Step 5: Run the classifier test to verify it fails**

Run: `go test ./internal/links -run TestOpenAIClassifierPostsMetadataAndParsesTags -count=1`

Expected: FAIL because `LinkClassifierConfig` and `NewOpenAIClassifier` do not exist.

- [ ] **Step 6: Implement the smallest classifier**

```go
type LinkClassifierConfig struct { APIBase, APIKey, Model string }

func (c *OpenAIClassifier) Classify(ctx context.Context, metadata Metadata, existing []string) ([]string, error) {
    // POST JSON to strings.TrimRight(c.apiBase, "/") + "/chat/completions".
    // Ask for only {"tags":["..."]}; decode choices[0].message.content; return normalizeTags(tags).
}
```

Use `http.NewRequestWithContext`, a 10-second client timeout, a Bearer header only when a key exists, reject non-2xx responses, and reject malformed/empty assistant JSON. Do not retry or accept a second response format.

- [ ] **Step 7: Run the links package tests to verify they pass**

Run: `go test ./internal/links -count=1`

Expected: PASS.

- [ ] **Step 8: Commit the completed backend tag flow**

```bash
git add internal/models/link.go internal/storage/link_store.go internal/links/service.go internal/links/classifier.go internal/links/service_test.go internal/links/classifier_test.go
git commit -m "feat: classify saved link tags"
```

### Task 2: Store and expose classifier settings safely

**Files:**
- Create: `internal/storage/link_classifier_settings.go`
- Create: `internal/storage/link_classifier_settings_test.go`
- Create: `internal/server/routes/link_classifier.go`
- Create: `internal/server/routes/link_classifier_test.go`
- Modify: `internal/server/routes/router.go`
- Modify: `internal/links/service.go`

**Interfaces:**
- Consumes: `links.LinkClassifierConfig` from Task 1.
- Produces: `storage.LinkClassifierSettingsStore.Load() (*links.LinkClassifierConfig, error)` and `Save(links.LinkClassifierConfig) error`.
- Produces: `GET`, `PUT`, and `POST /link-classifier/test` under `/api`; GET returns `{apiBase, model, configured}` and never `apiKey`.

- [ ] **Step 1: Write failing storage and route tests**

```go
func TestLinkClassifierSettingsStoreRoundTrip(t *testing.T) {
    store := NewLinkClassifierSettingsStoreWithPath(filepath.Join(t.TempDir(), "classifier.json"))
    want := links.LinkClassifierConfig{APIBase: "https://api.example/v1", APIKey: "secret", Model: "tagger"}
    if err := store.Save(want); err != nil { t.Fatal(err) }
    if got, _ := store.Load(); *got != want { t.Fatalf("settings = %#v", got) }
}

func TestLinkClassifierSettingsGetNeverReturnsAPIKey(t *testing.T) {
    settings := storage.NewLinkClassifierSettingsStoreWithPath(filepath.Join(t.TempDir(), "classifier.json"))
    if err := settings.Save(links.LinkClassifierConfig{APIBase: "https://api.example/v1", APIKey: "secret", Model: "tagger"}); err != nil { t.Fatal(err) }
    router := chi.NewRouter()
    (&LinkClassifierRoutes{store: settings}).Register(router)
    recorder := httptest.NewRecorder()
    router.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, "/link-classifier", nil))
    if strings.Contains(recorder.Body.String(), "secret") || strings.Contains(recorder.Body.String(), "apiKey") { t.Fatalf("unsafe response: %s", recorder.Body.String()) }
    if !strings.Contains(recorder.Body.String(), `"configured":true`) { t.Fatalf("response = %s", recorder.Body.String()) }
}
```

- [ ] **Step 2: Run the focused tests to verify they fail**

Run: `go test ./internal/storage ./internal/server/routes -run 'TestLinkClassifierSettings(StoreRoundTrip|GetNeverReturnsAPIKey)' -count=1`

Expected: FAIL because the settings store and routes do not exist.

- [ ] **Step 3: Implement the store and routes**

```go
type LinkClassifierSettingsStore struct { filePath string }

func (s *LinkClassifierSettingsStore) Load() (*links.LinkClassifierConfig, error) {
    data, err := os.ReadFile(s.filePath)
    if os.IsNotExist(err) { return &links.LinkClassifierConfig{}, nil }
    if err != nil { return nil, fmt.Errorf("read link classifier settings: %w", err) }
    var cfg links.LinkClassifierConfig
    if err := json.Unmarshal(data, &cfg); err != nil { return nil, fmt.Errorf("parse link classifier settings: %w", err) }
    return &cfg, nil
}
func (s *LinkClassifierSettingsStore) Save(cfg links.LinkClassifierConfig) error {
    if err := os.MkdirAll(filepath.Dir(s.filePath), 0700); err != nil { return err }
    data, err := json.MarshalIndent(cfg, "", "  ")
    if err != nil { return err }
    return os.WriteFile(s.filePath, data, 0600)
}
```

`PUT /link-classifier` requires non-empty `apiBase` and `model`; an empty `apiKey` retains the saved key, so the UI can update endpoint or model without receiving the secret. `POST /link-classifier/test` classifies fixed harmless metadata and returns `{success, error?}`. Register the routes outside `requireStore`, alongside saved links.

- [ ] **Step 4: Run storage and route tests to verify they pass**

Run: `go test ./internal/storage ./internal/server/routes -run 'TestLinkClassifierSettings' -count=1`

Expected: PASS.

- [ ] **Step 5: Make the default link service load stored configuration**

```go
func NewService(root string) *Service {
    return NewServiceWithFetcherAndClassifier(root, FetchMetadata, classifierFromGlobalSettings())
}
```

Return a nil classifier when the stored base URL or model is absent. Tests using `NewServiceWithFetcher` retain a nil classifier.

- [ ] **Step 6: Run backend verification**

Run: `go test ./internal/links ./internal/storage ./internal/server/routes -count=1`

Expected: PASS.

- [ ] **Step 7: Commit configuration and route support**

```bash
git add internal/storage/link_classifier_settings.go internal/storage/link_classifier_settings_test.go internal/server/routes/link_classifier.go internal/server/routes/link_classifier_test.go internal/server/routes/router.go internal/links/service.go
git commit -m "feat: configure link classifier"
```

### Task 3: Configure and display automatic tags in the UI

**Files:**
- Modify: `ui/src/api/client.ts`
- Modify: `ui/src/pages/ConfigPage.tsx`
- Modify: `ui/src/pages/LinksPage.tsx`
- Modify: `ui/e2e/links.spec.ts`

**Interfaces:**
- Consumes: `GET|PUT /api/link-classifier`, `POST /api/link-classifier/test`, and `SavedLink.tags?: string[]`.
- Produces: `linkClassifierApi.get`, `save`, and `test`, a Settings section, and tag chips.

- [ ] **Step 1: Write failing browser tests for tag rendering and settings**

```ts
test("saved link cards show automatic tags", async ({ page }) => {
  await page.route("**/api/links", (route) => route.fulfill({ json: [{
    id: "link1", url: "https://example.com", title: "Example", description: "",
    tags: ["golang", "release"], createdAt: "2026-08-03T00:00:00Z", updatedAt: "2026-08-03T00:00:00Z",
  }] }));
  await page.goto(`${server.baseURL}/links`);
  await expect(page.getByText("golang", { exact: true })).toBeVisible();
  await expect(page.getByText("release", { exact: true })).toBeVisible();
});

```

- [ ] **Step 2: Run browser tests to verify they fail**

Run: `cd ui && bunx playwright test e2e/links.spec.ts e2e/config.spec.ts --grep 'automatic tags|link classification'`

Expected: FAIL because tag chips and the Link classification settings section do not exist.

- [ ] **Step 3: Add the TypeScript API surface and Settings controls**

```ts
export interface LinkClassifierSettings { apiBase: string; model: string; configured: boolean; }
export const linkClassifierApi = {
  async get(): Promise<LinkClassifierSettings> {
    const res = await apiFetch(`${API_BASE}/api/link-classifier`);
    if (!res.ok) throw new Error("Failed to load link classifier settings");
    return res.json();
  },
  async save(input: { apiBase: string; apiKey: string; model: string }): Promise<LinkClassifierSettings> {
    const res = await apiFetch(`${API_BASE}/api/link-classifier`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
    if (!res.ok) throw new Error("Failed to save link classifier settings");
    return res.json();
  },
  async test(input: { apiBase: string; apiKey: string; model: string }): Promise<{ success: boolean; error?: string }> {
    const res = await apiFetch(`${API_BASE}/api/link-classifier/test`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
    return res.json();
  },
};
```

Add a `Link classification` section with base URL, password API key input, model name, Test, and Save buttons. Load only safe fields; keep the key input blank after loading. Show test success/error inline. Do not share state with embedding controls or add a provider picker.

- [ ] **Step 4: Render tags on saved-link cards**

```tsx
{link.tags?.length ? <div className="mt-3 flex flex-wrap gap-1">
  {link.tags.map((tag) => <span key={tag} className="rounded-full bg-muted px-2 py-0.5 text-xs">{tag}</span>)}
</div> : null}
```

Keep the add dialog unchanged; the existing create response supplies tags.

- [ ] **Step 5: Run UI checks**

Run: `cd ui && bunx tsc --noEmit && bun run build`

Expected: PASS.

- [ ] **Step 6: Run project verification**

Run: `go test ./... && cd ui && bunx tsc --noEmit && bun run build`

Expected: PASS.

- [ ] **Step 7: Commit the UI**

```bash
git add ui/src/api/client.ts ui/src/pages/ConfigPage.tsx ui/src/pages/LinksPage.tsx
git commit -m "feat: display automatic link tags"
```

## Plan Review

- Spec coverage: Task 1 implements automatic multi-tag classification and non-fatal failure; Task 2 provides safe global configuration and testing; Task 3 exposes configuration and tags in the UI.
- Scope: no tag model, provider reuse, retry system, reclassification action, or background worker is included.
- Type consistency: every consumer uses `links.LinkClassifierConfig`, `ClassifyFunc`, and `SavedLink.tags` defined above.
