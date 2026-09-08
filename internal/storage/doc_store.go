package storage

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/hoangtrung1801/known-me/internal/models"
	"github.com/hoangtrung1801/known-me/internal/references"
	"gopkg.in/yaml.v3"
)

// DocStore reads and writes doc files from .know-me/docs/ (and .know-me/imports/).
type DocStore struct {
	root      string
	projectID string
}

func (ds *DocStore) docsDir() string    { return filepath.Join(ds.root, "docs") }
func (ds *DocStore) importsDir() string { return filepath.Join(ds.root, "imports") }

func scopedDocPath(projectID, docPath string) string {
	if projectID == "" {
		return docPath
	}
	parts := strings.SplitN(strings.TrimPrefix(docPath, "/"), "/", 2)
	parts[0] = projectID + "--" + parts[0]
	return strings.Join(parts, "/")
}

func unscopedDocPath(projectID, docPath string) string {
	prefix := projectID + "--"
	parts := strings.SplitN(strings.TrimPrefix(docPath, "/"), "/", 2)
	if len(parts) > 0 && strings.HasPrefix(parts[0], prefix) {
		parts[0] = strings.TrimPrefix(parts[0], prefix)
	}
	return strings.Join(parts, "/")
}

// docFrontmatter mirrors the YAML frontmatter in every doc file.
type docFrontmatter struct {
	ProjectID   string   `yaml:"projectId,omitempty"`
	Title       string   `yaml:"title"`
	Description string   `yaml:"description"`
	CreatedAt   string   `yaml:"createdAt"`
	UpdatedAt   string   `yaml:"updatedAt"`
	Tags        []string `yaml:"tags"`
	Order       *int     `yaml:"order,omitempty"`
}

// List returns all docs from .know-me/docs/ and .know-me/imports/*/docs/.
func (ds *DocStore) List(projectID ...string) ([]*models.Doc, error) {
	var docs []*models.Doc
	filter := firstProjectID(projectID, ds.projectID)

	local, err := ds.walkDocs(ds.docsDir(), "", false, "", filter)
	if err != nil {
		return nil, err
	}
	docs = append(docs, local...)

	imported, err := ds.listImported(filter)
	if err != nil {
		// Non-fatal: return what we have so far.
		return docs, nil
	}
	docs = append(docs, imported...)

	return docs, nil
}

// listImported scans .know-me/imports/*/docs/ for additional docs.
func (ds *DocStore) listImported(filter string) ([]*models.Doc, error) {
	entries, err := os.ReadDir(ds.importsDir())
	if os.IsNotExist(err) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	var docs []*models.Doc
	for _, e := range entries {
		if !e.IsDir() {
			continue
		}
		importSource := e.Name()
		importDocsDir := filepath.Join(ds.importsDir(), importSource, "docs")
		imported, err := ds.walkDocs(importDocsDir, "", true, importSource, filter)
		if err != nil {
			continue
		}
		docs = append(docs, imported...)
	}
	return docs, nil
}

// walkDocs recursively collects docs from a directory.
func (ds *DocStore) walkDocs(dir, relBase string, imported bool, importSource, filter string) ([]*models.Doc, error) {
	entries, err := os.ReadDir(dir)
	if os.IsNotExist(err) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("walkDocs %s: %w", dir, err)
	}
	var docs []*models.Doc
	for _, e := range entries {
		fullPath := filepath.Join(dir, e.Name())
		if e.IsDir() {
			subBase := e.Name()
			if relBase != "" {
				subBase = relBase + "/" + e.Name()
			}
			sub, err := ds.walkDocs(fullPath, subBase, imported, importSource, filter)
			if err != nil {
				continue
			}
			docs = append(docs, sub...)
			continue
		}
		if !strings.HasSuffix(e.Name(), ".md") {
			continue
		}
		baseName := strings.TrimSuffix(e.Name(), ".md")
		var relPath string
		if relBase == "" {
			relPath = baseName
		} else {
			relPath = relBase + "/" + baseName
		}
		folder := relBase
		doc, err := ds.parseFile(fullPath, relPath, folder, imported, importSource)
		if err != nil {
			continue
		}
		if filter != "" && doc.ProjectID != filter {
			continue
		}
		docs = append(docs, doc)
	}
	return docs, nil
}

// Get retrieves a doc by its relative path (without .md extension).
// Examples: "readme", "patterns/module", "specs/user-auth"
func (ds *DocStore) Get(path string) (*models.Doc, error) {
	path = strings.TrimSuffix(strings.TrimPrefix(path, "/"), ".md")
	projectID, localPath := SplitScopedKey(path)
	var docs []*models.Doc
	var err error
	if projectID == "" {
		docs, err = ds.List()
	} else {
		docs, err = ds.List(projectID)
	}
	if err != nil {
		return nil, err
	}
	var matches []*models.Doc
	for _, doc := range docs {
		if doc.Path != localPath || (projectID != "" && doc.ProjectID != projectID) {
			continue
		}
		matches = append(matches, doc)
	}
	if len(matches) == 1 {
		return matches[0], nil
	}
	if len(matches) > 1 {
		return nil, fmt.Errorf("doc %q is ambiguous; use a project-prefixed path", path)
	}
	return nil, fmt.Errorf("doc %q not found", path)
}

// Create writes a new doc to .know-me/docs/{path}.md.
// doc.Path must be set (relative, without .md).
func (ds *DocStore) Create(doc *models.Doc) error {
	if doc != nil && doc.ProjectID == "" {
		doc.ProjectID = ds.projectID
	}
	return ds.create(doc)
}

// CreateGlobal writes a doc without applying the store's active project.
func (ds *DocStore) CreateGlobal(doc *models.Doc) error {
	return ds.create(doc)
}

func (ds *DocStore) create(doc *models.Doc) error {
	if doc.Path == "" {
		return fmt.Errorf("doc path is required")
	}
	absPath := filepath.Join(ds.docsDir(), filepath.FromSlash(scopedDocPath(doc.ProjectID, doc.Path))+".md")
	if err := os.MkdirAll(filepath.Dir(absPath), 0755); err != nil {
		return fmt.Errorf("create doc dir: %w", err)
	}
	return ds.writeFile(absPath, doc)
}

// Update writes updated doc content.
func (ds *DocStore) Update(doc *models.Doc) error {
	if doc.Path == "" {
		return fmt.Errorf("doc path is required")
	}
	existing, err := ds.Get(doc.Path)
	if err == nil {
		if doc.ProjectID == "" {
			doc.ProjectID = existing.ProjectID
		}
		doc.Path = existing.Path
		applyLockedDecisionReviewGate(existing, doc)
	}
	absPath := filepath.Join(ds.docsDir(), filepath.FromSlash(scopedDocPath(doc.ProjectID, doc.Path))+".md")
	if err := os.MkdirAll(filepath.Dir(absPath), 0755); err != nil {
		return err
	}
	return ds.writeFile(absPath, doc)
}

// MoveProject changes a document's optional project scope and moves its file.
func (ds *DocStore) MoveProject(oldPath string, doc *models.Doc) error {
	if doc == nil || doc.Path == "" {
		return fmt.Errorf("doc path is required")
	}
	existing, err := ds.Get(oldPath)
	if err != nil {
		return err
	}
	doc.Path = existing.Path
	applyLockedDecisionReviewGate(existing, doc)

	oldAbsPath := filepath.Join(ds.docsDir(), filepath.FromSlash(scopedDocPath(existing.ProjectID, existing.Path))+".md")
	newAbsPath := filepath.Join(ds.docsDir(), filepath.FromSlash(scopedDocPath(doc.ProjectID, doc.Path))+".md")
	if err := os.MkdirAll(filepath.Dir(newAbsPath), 0755); err != nil {
		return err
	}
	if err := ds.writeFile(newAbsPath, doc); err != nil {
		return err
	}
	if oldAbsPath != newAbsPath {
		if err := os.Remove(oldAbsPath); err != nil && !os.IsNotExist(err) {
			return err
		}
	}
	return nil
}

// Rename rewrites a doc to a new path and removes the old file.
func (ds *DocStore) Rename(oldPath string, doc *models.Doc) error {
	if strings.TrimSpace(oldPath) == "" || doc == nil || strings.TrimSpace(doc.Path) == "" {
		return fmt.Errorf("old path and new doc path are required")
	}
	existing, err := ds.Get(oldPath)
	if err != nil {
		return err
	}
	if doc.ProjectID == "" {
		doc.ProjectID = existing.ProjectID
	}
	applyLockedDecisionReviewGate(existing, doc)
	oldAbsPath := filepath.Join(ds.docsDir(), filepath.FromSlash(scopedDocPath(existing.ProjectID, existing.Path))+".md")
	newAbsPath := filepath.Join(ds.docsDir(), filepath.FromSlash(scopedDocPath(doc.ProjectID, strings.TrimSuffix(doc.Path, ".md")))+".md")
	if err := os.MkdirAll(filepath.Dir(newAbsPath), 0755); err != nil {
		return err
	}
	if err := ds.writeFile(newAbsPath, doc); err != nil {
		return err
	}
	if oldAbsPath != newAbsPath {
		if err := os.Remove(oldAbsPath); err != nil && !os.IsNotExist(err) {
			return err
		}
	}
	return nil
}

func applyLockedDecisionReviewGate(existing, updated *models.Doc) {
	if existing == nil || updated == nil || !docHasTag(existing.Tags, "approved") {
		return
	}
	before, beforeOK := findMarkdownSection(existing.Content, "Locked Decisions")
	after, afterOK := findMarkdownSection(updated.Content, "Locked Decisions")
	if beforeOK == afterOK && (!beforeOK || strings.TrimSpace(before.Text) == strings.TrimSpace(after.Text)) {
		return
	}
	updated.Tags = removeDocTag(updated.Tags, "approved")
	updated.Tags = appendDocTag(updated.Tags, "draft")
	updated.Tags = appendDocTag(updated.Tags, "review-required")
}

func docHasTag(tags []string, target string) bool {
	for _, tag := range tags {
		if strings.EqualFold(strings.TrimSpace(tag), target) {
			return true
		}
	}
	return false
}

func removeDocTag(tags []string, target string) []string {
	filtered := make([]string, 0, len(tags))
	for _, tag := range tags {
		if strings.EqualFold(strings.TrimSpace(tag), target) {
			continue
		}
		filtered = append(filtered, tag)
	}
	return filtered
}

func appendDocTag(tags []string, tag string) []string {
	if docHasTag(tags, tag) {
		return tags
	}
	return append(tags, tag)
}

// RewriteDocReferences rewrites @doc refs across local docs, tasks, and memories.
func (ds *DocStore) RewriteDocReferences(oldPath, newPath string, taskStore *TaskStore, memoryStore *MemoryStore) error {
	docs, err := ds.List()
	if err != nil {
		return err
	}
	for _, doc := range docs {
		if doc.IsImported || doc.Path == newPath {
			continue
		}
		fullDoc, err := ds.Get(doc.Path)
		if err != nil {
			continue
		}
		rewritten := references.RewriteDocPath(fullDoc.Content, oldPath, newPath)
		if rewritten == fullDoc.Content {
			continue
		}
		fullDoc.Content = rewritten
		fullDoc.UpdatedAt = time.Now().UTC()
		if err := ds.Update(fullDoc); err != nil {
			return err
		}
	}
	if taskStore != nil {
		tasks, err := taskStore.List()
		if err != nil {
			return err
		}
		for _, task := range tasks {
			updated := false
			// Rewrite the spec field if it matches the old doc path.
			if task.Spec == oldPath {
				task.Spec = newPath
				updated = true
			}
			description := references.RewriteDocPath(task.Description, oldPath, newPath)
			if description != task.Description {
				task.Description = description
				updated = true
			}
			plan := references.RewriteDocPath(task.ImplementationPlan, oldPath, newPath)
			if plan != task.ImplementationPlan {
				task.ImplementationPlan = plan
				updated = true
			}
			notes := references.RewriteDocPath(task.ImplementationNotes, oldPath, newPath)
			if notes != task.ImplementationNotes {
				task.ImplementationNotes = notes
				updated = true
			}
			if updated {
				task.UpdatedAt = time.Now().UTC()
				if err := taskStore.Update(task); err != nil {
					return err
				}
			}
		}
	}
	if memoryStore != nil {
		memories, err := memoryStore.List("")
		if err != nil {
			return err
		}
		for _, memory := range memories {
			rewritten := references.RewriteDocPath(memory.Content, oldPath, newPath)
			if rewritten == memory.Content {
				continue
			}
			memory.Content = rewritten
			memory.UpdatedAt = time.Now().UTC()
			if err := memoryStore.Update(memory); err != nil {
				return err
			}
		}
	}
	return nil
}

// Delete removes a doc file.
func (ds *DocStore) Delete(path string) error {
	doc, err := ds.Get(path)
	if err != nil {
		return err
	}
	absPath := filepath.Join(ds.docsDir(), filepath.FromSlash(scopedDocPath(doc.ProjectID, doc.Path))+".md")
	return os.Remove(absPath)
}

// parseFile reads and parses a single doc markdown file.
func (ds *DocStore) parseFile(absPath, relPath, folder string, imported bool, importSource string) (*models.Doc, error) {
	data, err := os.ReadFile(absPath)
	if err != nil {
		return nil, fmt.Errorf("parseFile %s: %w", absPath, err)
	}
	return parseDocContent(string(data), relPath, folder, imported, importSource)
}

// parseDocContent parses the content of a doc markdown file.
func parseDocContent(content, relPath, folder string, imported bool, importSource string) (*models.Doc, error) {
	yamlBlock, body := splitFrontmatter(content)

	doc := &models.Doc{
		Path:         relPath,
		Folder:       folder,
		IsImported:   imported,
		ImportSource: importSource,
		Content:      strings.TrimSpace(body),
	}

	if yamlBlock == "" {
		// No frontmatter: derive title from the path basename.
		doc.Title = filepath.Base(relPath)
		doc.Tags = []string{}
		return doc, nil
	}

	var fm docFrontmatter
	if err := yaml.Unmarshal([]byte(yamlBlock), &fm); err != nil {
		return nil, fmt.Errorf("parse doc frontmatter: %w", err)
	}

	doc.Title = fm.Title
	doc.ProjectID = fm.ProjectID
	if doc.ProjectID != "" {
		doc.Path = unscopedDocPath(doc.ProjectID, doc.Path)
		doc.Folder = filepath.ToSlash(filepath.Dir(filepath.FromSlash(doc.Path)))
		if doc.Folder == "." {
			doc.Folder = ""
		}
	}
	doc.Description = fm.Description
	doc.Tags = fm.Tags
	if doc.Tags == nil {
		doc.Tags = []string{}
	}
	doc.Order = fm.Order
	doc.CreatedAt, _ = parseISO(fm.CreatedAt)
	doc.UpdatedAt, _ = parseISO(fm.UpdatedAt)

	return doc, nil
}

// writeFile serialises a doc to the canonical markdown format.
func (ds *DocStore) writeFile(path string, doc *models.Doc) error {
	return atomicWrite(path, []byte(renderDoc(doc)))
}

// renderDoc produces the canonical markdown content for a doc file.
func renderDoc(doc *models.Doc) string {
	var b strings.Builder

	now := time.Now().UTC()
	createdAt := doc.CreatedAt
	if createdAt.IsZero() {
		createdAt = now
	}
	updatedAt := doc.UpdatedAt
	if updatedAt.IsZero() {
		updatedAt = now
	}

	b.WriteString("---\n")
	if doc.ProjectID != "" {
		fmt.Fprintf(&b, "projectId: %s\n", doc.ProjectID)
	}
	fmt.Fprintf(&b, "title: %s\n", yamlScalar(doc.Title))
	fmt.Fprintf(&b, "description: %s\n", yamlScalar(doc.Description))
	fmt.Fprintf(&b, "createdAt: '%s'\n", formatISO(createdAt))
	fmt.Fprintf(&b, "updatedAt: '%s'\n", formatISO(updatedAt))

	if len(doc.Tags) == 0 {
		b.WriteString("tags: []\n")
	} else {
		b.WriteString("tags:\n")
		for _, t := range doc.Tags {
			fmt.Fprintf(&b, "  - %s\n", t)
		}
	}

	if doc.Order != nil {
		fmt.Fprintf(&b, "order: %d\n", *doc.Order)
	}

	b.WriteString("---\n")

	if doc.Content != "" {
		b.WriteString("\n")
		b.WriteString(doc.Content)
		if !strings.HasSuffix(doc.Content, "\n") {
			b.WriteString("\n")
		}
	}

	return b.String()
}
