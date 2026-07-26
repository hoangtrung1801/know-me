package codegen

import (
	"strings"
	"unicode"
)

// wordSplit splits a string into words by handling camelCase, PascalCase,
// snake_case, kebab-case, and space-delimited strings.
func wordSplit(s string) []string {
	// Replace underscores and hyphens with spaces.
	s = strings.ReplaceAll(s, "_", " ")
	s = strings.ReplaceAll(s, "-", " ")

	// Insert spaces before uppercase letters that follow lowercase letters
	// (camelCase / PascalCase boundary detection).
	var expanded strings.Builder
	runes := []rune(s)
	for i, r := range runes {
		if i > 0 && unicode.IsUpper(r) {
			prev := runes[i-1]
			if unicode.IsLower(prev) || unicode.IsDigit(prev) {
				expanded.WriteRune(' ')
			} else if i+1 < len(runes) && unicode.IsLower(runes[i+1]) && unicode.IsUpper(prev) {
				// Handle consecutive capitals: "XMLParser" → "XML Parser"
				expanded.WriteRune(' ')
			}
		}
		expanded.WriteRune(r)
	}

	// Split on whitespace and filter empty tokens.
	parts := strings.Fields(expanded.String())
	var words []string
	for _, p := range parts {
		if p != "" {
			words = append(words, p)
		}
	}
	return words
}

// CamelCase converts s to camelCase.
// Examples: "my name" → "myName", "MyName" → "myName", "my-name" → "myName"
func CamelCase(s string) string {
	words := wordSplit(s)
	if len(words) == 0 {
		return ""
	}
	var b strings.Builder
	for i, w := range words {
		if i == 0 {
			b.WriteString(strings.ToLower(w))
		} else {
			r := []rune(w)
			b.WriteRune(unicode.ToUpper(r[0]))
			b.WriteString(strings.ToLower(string(r[1:])))
		}
	}
	return b.String()
}

// PascalCase converts s to PascalCase.
// Examples: "my name" → "MyName", "my-name" → "MyName"
func PascalCase(s string) string {
	words := wordSplit(s)
	if len(words) == 0 {
		return ""
	}
	var b strings.Builder
	for _, w := range words {
		r := []rune(w)
		b.WriteRune(unicode.ToUpper(r[0]))
		b.WriteString(strings.ToLower(string(r[1:])))
	}
	return b.String()
}

// KebabCase converts s to kebab-case.
// Examples: "my name" → "my-name", "myName" → "my-name"
func KebabCase(s string) string {
	words := wordSplit(s)
	lower := make([]string, len(words))
	for i, w := range words {
		lower[i] = strings.ToLower(w)
	}
	return strings.Join(lower, "-")
}

// SnakeCase converts s to snake_case.
// Examples: "my name" → "my_name", "myName" → "my_name"
func SnakeCase(s string) string {
	words := wordSplit(s)
	lower := make([]string, len(words))
	for i, w := range words {
		lower[i] = strings.ToLower(w)
	}
	return strings.Join(lower, "_")
}

// StartCase converts s to Start Case (each word capitalised).
// Examples: "myName" → "My Name", "my-name" → "My Name"
func StartCase(s string) string {
	words := wordSplit(s)
	titled := make([]string, len(words))
	for i, w := range words {
		r := []rune(w)
		titled[i] = string(unicode.ToUpper(r[0])) + strings.ToLower(string(r[1:]))
	}
	return strings.Join(titled, " ")
}

// UpperCase converts s to UPPER CASE.
func UpperCase(s string) string {
	return strings.ToUpper(s)
}

// LowerCase converts s to lower case.
func LowerCase(s string) string {
	return strings.ToLower(s)
}
