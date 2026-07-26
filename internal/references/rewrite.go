package references

import (
	"strings"
)

// RewriteDocPath rewrites inline @doc refs from oldPath to newPath while preserving
// doc fragments and semantic relation suffixes.
func RewriteDocPath(content, oldPath, newPath string) string {
	if strings.TrimSpace(content) == "" || strings.TrimSpace(oldPath) == "" || oldPath == newPath {
		return content
	}

	refs := Extract(content)
	updated := content
	for _, ref := range refs {
		if ref.Type != "doc" || ref.Target != oldPath {
			continue
		}
		rewritten := "@doc/" + newPath
		if ref.Fragment != nil {
			rewritten += ref.Fragment.Raw
		}
		if ref.ExplicitRelation {
			rewritten += "{" + ref.Relation + "}"
		}
		updated = strings.ReplaceAll(updated, ref.Raw, rewritten)
	}
	return updated
}
