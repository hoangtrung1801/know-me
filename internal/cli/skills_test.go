package cli

import (
	"os"
	"path/filepath"
	"testing"
)

func TestSkillsInstallAllToCustomDir(t *testing.T) {
	temp := t.TempDir()
	targetDir := filepath.Join(temp, "target-skills")

	cmd := rootCmd
	cmd.SetArgs([]string{"skills", "install", "--target", targetDir})
	if err := cmd.Execute(); err != nil {
		t.Fatalf("skills install failed: %v", err)
	}

	// Verify targetDir exists and contains kn-workflow and others
	for _, expected := range []string{"kn-workflow", "kn-plan", "kn-implement", "kn-verify"} {
		skillFile := filepath.Join(targetDir, expected, "SKILL.md")
		if _, err := os.Stat(skillFile); err != nil {
			t.Errorf("expected %s to exist: %v", skillFile, err)
		}
	}
}

func TestSkillsInstallSpecificSkill(t *testing.T) {
	temp := t.TempDir()
	targetDir := filepath.Join(temp, "custom-skills")

	cmd := rootCmd
	cmd.SetArgs([]string{"skills", "install", "knowme-workflow", "--target", targetDir})
	if err := cmd.Execute(); err != nil {
		t.Fatalf("skills install specific skill failed: %v", err)
	}

	// Verify knowme-workflow/SKILL.md exists
	skillFile := filepath.Join(targetDir, "knowme-workflow", "SKILL.md")
	data, err := os.ReadFile(skillFile)
	if err != nil {
		t.Fatalf("expected %s to exist: %v", skillFile, err)
	}
	if len(data) == 0 {
		t.Fatal("expected non-empty SKILL.md")
	}

	// Verify other skills were NOT installed
	otherSkill := filepath.Join(targetDir, "kn-plan")
	if _, err := os.Stat(otherSkill); !os.IsNotExist(err) {
		t.Errorf("expected %s NOT to be installed when specific skill requested", otherSkill)
	}
}

func TestSkillsInstallUnknownSkillFails(t *testing.T) {
	temp := t.TempDir()
	targetDir := filepath.Join(temp, "custom-skills")

	cmd := rootCmd
	cmd.SetArgs([]string{"skills", "install", "nonexistent-skill-xyz", "--target", targetDir})
	err := cmd.Execute()
	if err == nil {
		t.Fatal("expected error installing nonexistent skill, got nil")
	}
}
