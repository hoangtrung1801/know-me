package links

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"reflect"
	"testing"
)

func TestOpenAIClassifierPostsMetadataAndParsesTags(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/chat/completions" || r.Header.Get("Authorization") != "Bearer secret" {
			t.Fatalf("request = %s %q", r.URL, r.Header.Get("Authorization"))
		}
		var payload map[string]any
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			t.Fatal(err)
		}
		if payload["model"] != "tagger" {
			t.Fatalf("payload = %#v", payload)
		}
		_, _ = w.Write([]byte(`{"choices":[{"message":{"content":"{\"tags\":[\"golang\",\"release\"]}"}}]}`))
	}))
	defer server.Close()

	tags, err := NewOpenAIClassifier(LinkClassifierConfig{APIBase: server.URL + "/v1", APIKey: "secret", Model: "tagger"}).Classify(context.Background(), "https://example.com/go", Metadata{Title: "Go"}, []string{"golang"})
	if err != nil || !reflect.DeepEqual(tags, []string{"golang", "release"}) {
		t.Fatalf("tags=%#v err=%v", tags, err)
	}
}
