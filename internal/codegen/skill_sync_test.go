package codegen

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestSyncSkillsForPlatformsWritesAgentPlatformsToAgentsDir(t *testing.T) {
	projectRoot := t.TempDir()

	if err := SyncSkillsForPlatforms(projectRoot, []string{"opencode", "codex", "antigravity"}); err != nil {
		t.Fatalf("SyncSkillsForPlatforms returned error: %v", err)
	}

	if _, err := os.Stat(filepath.Join(projectRoot, ".agents", "skills")); err != nil {
		t.Fatalf("expected .agents/skills to exist: %v", err)
	}
	if _, err := os.Stat(filepath.Join(projectRoot, ".claude", "skills")); !os.IsNotExist(err) {
		t.Fatalf("expected .claude/skills not to be created, got err=%v", err)
	}
	if _, err := os.Stat(filepath.Join(projectRoot, ".kiro", "skills")); !os.IsNotExist(err) {
		t.Fatalf("expected .kiro/skills not to be created, got err=%v", err)
	}
}

func TestSyncSkillsForPlatformsGenericAgentsUsesAgentsDir(t *testing.T) {
	projectRoot := t.TempDir()

	if err := SyncSkillsForPlatforms(projectRoot, []string{"agents"}); err != nil {
		t.Fatalf("SyncSkillsForPlatforms returned error: %v", err)
	}

	if _, err := os.Stat(filepath.Join(projectRoot, ".agents", "skills")); err != nil {
		t.Fatalf("expected .agents/skills to exist: %v", err)
	}
	assertKnownMeSkillSynced(t, filepath.Join(projectRoot, ".agents", "skills"))
}

func TestSyncSkillsForPlatformsClaudeWritesToClaudeDir(t *testing.T) {
	projectRoot := t.TempDir()

	if err := SyncSkillsForPlatforms(projectRoot, []string{"claude-code"}); err != nil {
		t.Fatalf("SyncSkillsForPlatforms returned error: %v", err)
	}

	if _, err := os.Stat(filepath.Join(projectRoot, ".claude", "skills")); err != nil {
		t.Fatalf("expected .claude/skills to exist: %v", err)
	}
	if _, err := os.Stat(filepath.Join(projectRoot, ".agents", "skills")); !os.IsNotExist(err) {
		t.Fatalf("expected .agents/skills not to be created for claude-code, got err=%v", err)
	}
	assertKnownMeSkillSynced(t, filepath.Join(projectRoot, ".claude", "skills"))
}

func TestSyncSkillsForPlatformsKiroWritesToKiroDir(t *testing.T) {
	projectRoot := t.TempDir()

	if err := SyncSkillsForPlatforms(projectRoot, []string{"kiro"}); err != nil {
		t.Fatalf("SyncSkillsForPlatforms returned error: %v", err)
	}

	if _, err := os.Stat(filepath.Join(projectRoot, ".kiro", "skills")); err != nil {
		t.Fatalf("expected .kiro/skills to exist: %v", err)
	}
	if _, err := os.Stat(filepath.Join(projectRoot, ".agents", "skills")); !os.IsNotExist(err) {
		t.Fatalf("expected .agents/skills not to be created for kiro, got err=%v", err)
	}
	assertKnownMeSkillSynced(t, filepath.Join(projectRoot, ".kiro", "skills"))
}

func TestSyncSkillsToTargetsIncludesKnWorkflowSkill(t *testing.T) {
	projectRoot := t.TempDir()
	target := filepath.Join(projectRoot, "global", ".agents", "skills")

	if err := SyncSkillsToTargets(map[string]string{"codex": target}); err != nil {
		t.Fatalf("SyncSkillsToTargets returned error: %v", err)
	}

	assertKnWorkflowSkillSynced(t, target)
}

func TestSyncSkillsToTargetsIncludesKnownMeSkill(t *testing.T) {
	projectRoot := t.TempDir()
	target := filepath.Join(projectRoot, "global", ".agents", "skills")

	if err := SyncSkillsToTargets(map[string]string{"codex": target}); err != nil {
		t.Fatalf("SyncSkillsToTargets returned error: %v", err)
	}

	data, err := os.ReadFile(filepath.Join(target, "known-me", "SKILL.md"))
	if err != nil {
		t.Fatalf("read synced known-me: %v", err)
	}
	if !strings.Contains(string(data), "name: known-me") {
		t.Fatal("synced known-me has invalid frontmatter")
	}
	for _, section := range []string{"## Tasks", "## Links", "## Memos", "## Projects"} {
		if !strings.Contains(string(data), section) {
			t.Fatalf("synced known-me is missing %q", section)
		}
	}
}

func TestOnlyAllowedSkillsAreSynced(t *testing.T) {
	projectRoot := t.TempDir()
	if err := SyncSkillsForPlatforms(projectRoot, []string{"codex"}); err != nil {
		t.Fatalf("SyncSkillsForPlatforms returned error: %v", err)
	}

	// Verify allowed skills exist
	for _, name := range []string{"kn-workflow", "known-me"} {
		path := filepath.Join(projectRoot, ".agents", "skills", name, "SKILL.md")
		if _, err := os.Stat(path); err != nil {
			t.Fatalf("expected allowed skill %s to be synced: %v", name, err)
		}
	}

	// Verify all disabled skills are NOT synced
	for _, name := range []string{"kn-spec", "kn-plan", "kn-flow", "kn-implement", "kn-review", "kn-verify", "kn-doc", "kn-template", "kn-extract", "kn-go", "kn-init"} {
		path := filepath.Join(projectRoot, ".agents", "skills", name)
		if _, err := os.Stat(path); !os.IsNotExist(err) {
			t.Fatalf("expected disabled skill %s NOT to be synced, but it was found", name)
		}
	}
}
func assertKnWorkflowSkillSynced(t *testing.T, skillsDir string) {
	t.Helper()

	data, err := os.ReadFile(filepath.Join(skillsDir, "kn-workflow", "SKILL.md"))
	if err != nil {
		t.Fatalf("expected kn-workflow skill to sync into %s: %v", skillsDir, err)
	}
	if !strings.Contains(string(data), "name: knowme-workflow") {
		t.Fatalf("expected knowme-workflow skill frontmatter in %s", skillsDir)
	}
}

func assertKnownMeSkillSynced(t *testing.T, skillsDir string) {
	t.Helper()

	data, err := os.ReadFile(filepath.Join(skillsDir, "known-me", "SKILL.md"))
	if err != nil {
		t.Fatalf("expected known-me skill to sync into %s: %v", skillsDir, err)
	}
	if !strings.Contains(string(data), "name: known-me") {
		t.Fatalf("expected known-me skill frontmatter in %s", skillsDir)
	}
}
