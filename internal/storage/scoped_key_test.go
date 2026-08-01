package storage

import "testing"

func TestScopedKeyRoundTrip(t *testing.T) {
	if got := ScopedKey("p1", "abc123"); got != "p1:abc123" {
		t.Fatalf("ScopedKey = %q", got)
	}
	projectID, localKey := SplitScopedKey("p1:abc123")
	if projectID != "p1" || localKey != "abc123" {
		t.Fatalf("split = (%q, %q)", projectID, localKey)
	}
}
