package routes

import (
	"encoding/json"
	"net/http"
	"strings"
)

// respondJSON writes status and JSON-encodes data to the response.
func respondJSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if data != nil {
		_ = json.NewEncoder(w).Encode(data)
	}
}

// respondError writes a JSON error body with the given HTTP status code.
func respondError(w http.ResponseWriter, status int, message string) {
	respondJSON(w, status, map[string]string{"error": message})
}

// decodeJSON reads and JSON-decodes the request body into v.
// Returns an error suitable for returning to the client.
func decodeJSON(r *http.Request, v interface{}) error {
	defer r.Body.Close()
	return json.NewDecoder(r.Body).Decode(v)
}

// slugifyTitle converts a title to a URL/path-safe slug.
func slugifyTitle(title string) string {
	title = strings.ToLower(title)
	var b strings.Builder
	prevHyphen := false
	for _, r := range title {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') {
			b.WriteRune(r)
			prevHyphen = false
		} else if r == '-' || r == ' ' || r == '_' {
			if !prevHyphen {
				b.WriteRune('-')
				prevHyphen = true
			}
		}
	}
	return strings.Trim(b.String(), "-")
}
