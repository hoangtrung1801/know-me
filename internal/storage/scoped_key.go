package storage

import "strings"

// ScopedKey returns the stable external identity for a project-owned record.
func ScopedKey(projectID, localKey string) string {
	if projectID == "" {
		return localKey
	}
	return projectID + ":" + localKey
}

// SplitScopedKey separates an optional project prefix from a local identity.
func SplitScopedKey(key string) (projectID, localKey string) {
	projectID, localKey, ok := strings.Cut(key, ":")
	if !ok {
		return "", key
	}
	return projectID, localKey
}
