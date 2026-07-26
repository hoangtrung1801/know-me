package references

import "testing"

func TestRewriteDocPath_PreservesFragmentsAndRelations(t *testing.T) {
	content := "See @doc/guides/old:10-20{implements}, @doc/guides/old#overview, and @doc/guides/other."
	got := RewriteDocPath(content, "guides/old", "guides/new")
	want := "See @doc/guides/new:10-20{implements}, @doc/guides/new#overview, and @doc/guides/other."
	if got != want {
		t.Fatalf("RewriteDocPath() = %q, want %q", got, want)
	}
}

func TestRewriteDocPath_LeavesUnmatchedContentUntouched(t *testing.T) {
	content := "See @doc/guides/another{related}."
	if got := RewriteDocPath(content, "guides/old", "guides/new"); got != content {
		t.Fatalf("unexpected rewrite: %q", got)
	}
}
