package lsp

import (
	"os"
	"path/filepath"
	"testing"
)

func TestFindSymbolPosition(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "sample.go")
	if err := os.WriteFile(path, []byte("package main\n\nfunc target() {}\nfunc targetExtra() {}\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	line, col, err := FindSymbolPosition(path, "target")
	if err != nil {
		t.Fatal(err)
	}
	if line != 2 || col != 5 {
		t.Fatalf("position = %d:%d, want 2:5", line, col)
	}
}

func TestLocationHelpers(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "sample.go")
	if err := os.WriteFile(path, []byte("package main\n\ntype Runner struct{}\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	if got := Snippet(path, 2); got != "type Runner struct{}" {
		t.Fatalf("snippet = %q", got)
	}
	if got := NameAt(path, 2, 5); got != "Runner" {
		t.Fatalf("name = %q", got)
	}
}
