package search

import (
	"database/sql"
	"fmt"
	"regexp"
	"strings"
)

// CodeSymbol represents a code symbol discovered by code intelligence.
type CodeSymbol struct {
	Name      string
	Kind      string // "function", "method", "class", "interface", "file"
	DocPath   string // relative file path
	Content   string // natural-language description
	Signature string
	Source    string
}

// ToChunk converts a CodeSymbol to a search Chunk.
func (s *CodeSymbol) ToChunk() Chunk {
	id := CodeChunkID(s.DocPath, s.Name)
	content := s.Content
	if content == "" {
		if s.Name == "" {
			content = fmt.Sprintf("%s %s", s.Kind, s.DocPath)
		} else {
			content = fmt.Sprintf("%s %s — file: %s", s.Kind, s.Name, s.DocPath)
		}
	}
	return Chunk{
		ID:         id,
		Type:       ChunkTypeCode,
		Content:    content,
		DocPath:    s.DocPath,
		Field:      s.Kind,
		Name:       s.Name,
		Signature:  s.Signature,
		Visibility: visibilityFromContent(s.Content),
		Detail:     detailFromContent(s.Content),
	}
}

// CodeEdge represents a relationship between code symbols.
type CodeEdge struct {
	From     string // "code::<filepath>::<symbol>"
	To       string
	Type     string // "calls", "imports", "contains", "has_method", "instantiates", "implements", "extends"
	FromPath string
	ToPath   string

	RawTarget            string
	TargetName           string
	TargetQualifier      string
	TargetModuleHint     string
	ReceiverTypeHint     string
	ResolutionStatus     string
	ResolutionConfidence string
	ResolvedTo           string
}

// CodeChunkID returns the chunk ID for a code symbol.
func CodeChunkID(docPath, symbolName string) string {
	if symbolName == "" {
		return fmt.Sprintf("code::%s::__file__", docPath)
	}
	return fmt.Sprintf("code::%s::%s", docPath, symbolName)
}

// CodeChunkIDPattern returns the regex used to parse code chunk IDs.
func CodeChunkIDPattern() *regexp.Regexp {
	return regexp.MustCompile(`^code::(.+)::(.+)$`)
}

// IndexAllFiles returns no AST symbols now that tree-sitter indexing has been removed.
func IndexAllFiles(projectRoot string, includeTests bool) ([]CodeSymbol, []CodeEdge, error) {
	return nil, nil, nil
}

// IndexAllFilesWithProgress returns no AST symbols now that tree-sitter indexing has been removed.
func IndexAllFilesWithProgress(projectRoot string, includeTests bool, onFile func(string)) ([]CodeSymbol, []CodeEdge, error) {
	return nil, nil, nil
}

// IndexFile returns no AST symbols now that tree-sitter indexing has been removed.
func IndexFile(docPath, absPath string) ([]CodeSymbol, []CodeEdge, error) {
	return nil, nil, nil
}

// ResolveCodeEdges preserves the supplied edges without AST-based resolution.
func ResolveCodeEdges(symbols []CodeSymbol, edges []CodeEdge) []CodeEdge {
	return edges
}

// HasCodeIndex is retained as a compatibility stub after code edge storage removal.
func HasCodeIndex(db *sql.DB) bool {
	return false
}

// GetCodeEdgeCount is retained as a compatibility stub after code edge storage removal.
func GetCodeEdgeCount(db *sql.DB) int {
	return 0
}

// SaveCodeEdges replaces persisted code edges.
func SaveCodeEdges(db *sql.DB, edges []CodeEdge) error {
	return nil
}

func visibilityFromContent(content string) string {
	for _, line := range strings.Split(content, "\n") {
		if strings.HasPrefix(line, "visibility: ") {
			return strings.TrimPrefix(line, "visibility: ")
		}
	}
	return ""
}

func detailFromContent(content string) string {
	for _, line := range strings.Split(content, "\n") {
		if strings.HasPrefix(line, "detail: ") {
			return strings.TrimPrefix(line, "detail: ")
		}
	}
	return ""
}
