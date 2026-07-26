package routes

import (
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/go-chi/chi/v5"
)

// Skill represents a Claude Code skill
type Skill struct {
	Name        string `json:"name"`
	Description string `json:"description"`
	Usage       string `json:"usage,omitempty"`
	Example     string `json:"example,omitempty"`
}

// SkillRoutes handles /api/skills endpoints
type SkillRoutes struct {
	projectRoot string
}

func NewSkillRoutes(projectRoot string) *SkillRoutes {
	return &SkillRoutes{projectRoot: projectRoot}
}

func (sr *SkillRoutes) Register(r chi.Router) {
	r.Get("/skills", sr.list)
	r.Get("/skills/{name}", sr.get)
}

func (sr *SkillRoutes) list(w http.ResponseWriter, r *http.Request) {
	skills, err := sr.loadSkills()
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}
	respondJSON(w, http.StatusOK, skills)
}

func (sr *SkillRoutes) get(w http.ResponseWriter, r *http.Request) {
	name := chi.URLParam(r, "name")
	skills, err := sr.loadSkills()
	if err != nil {
		respondError(w, http.StatusInternalServerError, err.Error())
		return
	}

	for _, s := range skills {
		if s.Name == name || s.Name == "/"+name {
			respondJSON(w, http.StatusOK, s)
			return
		}
	}
	respondError(w, http.StatusNotFound, "skill not found")
}

func (sr *SkillRoutes) loadSkills() ([]Skill, error) {
	skillsDir := filepath.Join(sr.projectRoot, ".claude", "skills")

	entries, err := os.ReadDir(skillsDir)
	if err != nil {
		return nil, fmt.Errorf("read skills dir: %w", err)
	}

	var skills []Skill
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}

		skillPath := filepath.Join(skillsDir, entry.Name(), "SKILL.md")
		data, err := os.ReadFile(skillPath)
		if err != nil {
			log.Printf("[skills] skip %s: %v", entry.Name(), err)
			continue
		}

		skill := sr.parseSkill(entry.Name(), string(data))
		skills = append(skills, skill)
	}

	return skills, nil
}

func (sr *SkillRoutes) parseSkill(dirName, content string) Skill {
	skill := Skill{
		Name: "/" + strings.TrimPrefix(dirName, "kn-"),
	}

	// Parse frontmatter
	lines := strings.Split(content, "\n")
	inFrontmatter := false
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "---" {
			if inFrontmatter {
				inFrontmatter = false
				continue
			}
			inFrontmatter = true
			continue
		}
		if !inFrontmatter {
			break
		}

		// Parse key: value
		if idx := strings.Index(line, ":"); idx > 0 {
			key := strings.TrimSpace(line[:idx])
			value := strings.TrimSpace(line[idx+1:])
			switch key {
			case "name":
				skill.Name = "/" + strings.TrimPrefix(value, "kn-")
			case "description":
				skill.Description = value
			}
		}
	}

	// Parse usage from first code block - find first code block
	contentLines := strings.Split(content, "\n")
	inCodeBlock := false
	var codeContent string
	for _, line := range contentLines {
		if strings.HasPrefix(strings.TrimSpace(line), "```") {
			if inCodeBlock {
				break
			}
			inCodeBlock = true
			continue
		}
		if inCodeBlock {
			codeContent += line + "\n"
		}
	}
	if codeContent != "" {
		usage := strings.TrimSpace(codeContent)
		// Get first line
		if idx := strings.Index(usage, "\n"); idx > 0 {
			usage = strings.TrimSpace(usage[:idx])
		}
		// Remove mcp__knowns__ prefix if present
		usage = strings.ReplaceAll(usage, "mcp__knowns__", "")
		skill.Usage = usage
	}

	return skill
}
