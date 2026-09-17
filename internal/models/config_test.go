package models

import (
	"encoding/json"
	"testing"
	"time"
)

func TestGitTrackingDefaultsTrackDecisions(t *testing.T) {
	defaults := GitTrackingDefaults()
	if defaults.Decisions == nil || !*defaults.Decisions {
		t.Fatalf("GitTrackingDefaults decisions = %v, want true", defaults.Decisions)
	}
	if defaults.Memories == nil || *defaults.Memories {
		t.Fatalf("GitTrackingDefaults memories = %v, want false", defaults.Memories)
	}
}

func TestGitTrackingModeDefaultsGitIgnoredTrackDecisions(t *testing.T) {
	defaults := GitTrackingModeDefaults("git-ignored")
	if defaults.Decisions == nil || !*defaults.Decisions {
		t.Fatalf("GitTrackingModeDefaults(git-ignored) decisions = %v, want true", defaults.Decisions)
	}
	if defaults.Memories == nil || *defaults.Memories {
		t.Fatalf("GitTrackingModeDefaults(git-ignored) memories = %v, want false", defaults.Memories)
	}
}

func TestDefaultTaskLifecycleSettings(t *testing.T) {
	settings := DefaultTaskLifecycleSettings()
	if !settings.ExcludeDoneFromDefaultRetrieval || !settings.AutoArchive {
		t.Fatalf("default lifecycle booleans = %#v, want both enabled", settings)
	}
	if settings.ArchiveAfter != "30d" {
		t.Fatalf("ArchiveAfter = %q, want 30d", settings.ArchiveAfter)
	}
	if settings.PurgeAfter != nil {
		t.Fatalf("PurgeAfter = %v, want disabled (nil)", settings.PurgeAfter)
	}
}

func TestTaskLifecycleSettingsPartialJSONUsesFieldDefaults(t *testing.T) {
	var project Project
	err := json.Unmarshal([]byte(`{
		"name":"legacy",
		"settings":{"taskLifecycle":{"autoArchive":false}}
	}`), &project)
	if err != nil {
		t.Fatalf("Unmarshal partial lifecycle config: %v", err)
	}

	settings := project.Settings.EffectiveTaskLifecycle()
	if settings.AutoArchive {
		t.Fatal("AutoArchive = true, want explicit false")
	}
	if !settings.ExcludeDoneFromDefaultRetrieval {
		t.Fatal("ExcludeDoneFromDefaultRetrieval = false, want omitted-field default true")
	}
	if settings.ArchiveAfter != "30d" {
		t.Fatalf("ArchiveAfter = %q, want omitted-field default 30d", settings.ArchiveAfter)
	}
	if err := project.Settings.Validate(); err != nil {
		t.Fatalf("Validate partial lifecycle config: %v", err)
	}
}

func TestParseTaskLifecycleDuration(t *testing.T) {
	tests := []struct {
		value string
		want  time.Duration
	}{
		{value: "30d", want: 30 * 24 * time.Hour},
		{value: "0s", want: 0},
		{value: "12h", want: 12 * time.Hour},
	}
	for _, tt := range tests {
		t.Run(tt.value, func(t *testing.T) {
			got, err := ParseTaskLifecycleDuration(tt.value)
			if err != nil {
				t.Fatalf("ParseTaskLifecycleDuration(%q): %v", tt.value, err)
			}
			if got != tt.want {
				t.Fatalf("duration = %s, want %s", got, tt.want)
			}
		})
	}

	for _, value := range []string{"", "-1h", "-1d", "later"} {
		t.Run("invalid_"+value, func(t *testing.T) {
			if _, err := ParseTaskLifecycleDuration(value); err == nil {
				t.Fatalf("ParseTaskLifecycleDuration(%q) succeeded, want error", value)
			}
		})
	}
}

func TestProjectSettingsServerURLUnmarshalBothKeys(t *testing.T) {
	cases := []struct {
		name    string
		jsonStr string
		wantURL string
	}{
		{
			name:    "snake_case",
			jsonStr: `{"settings": {"server_url": "https://api.example.com"}}`,
			wantURL: "https://api.example.com",
		},
		{
			name:    "camelCase",
			jsonStr: `{"settings": {"serverUrl": "http://localhost:8080"}}`,
			wantURL: "http://localhost:8080",
		},
		{
			name:    "empty_default",
			jsonStr: `{"settings": {}}`,
			wantURL: "",
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			var p Project
			if err := json.Unmarshal([]byte(tc.jsonStr), &p); err != nil {
				t.Fatalf("unmarshal error: %v", err)
			}
			if p.Settings.ServerURL != tc.wantURL {
				t.Fatalf("got ServerURL %q, want %q", p.Settings.ServerURL, tc.wantURL)
			}
			if err := p.Settings.Validate(); err != nil {
				t.Fatalf("unexpected validation error: %v", err)
			}
		})
	}
}

func TestProjectSettingsServerURLValidationRejectsInvalid(t *testing.T) {
	invalids := []string{
		"ftp://example.com",
		"file:///tmp/server",
		"notaurl",
		"://localhost",
	}

	for _, inv := range invalids {
		t.Run(inv, func(t *testing.T) {
			s := DefaultProjectSettings()
			s.ServerURL = inv
			if err := s.Validate(); err == nil {
				t.Fatalf("expected error for %q, got nil", inv)
			}
		})
	}
}

func TestProjectSettingsWorkspacePathJSON(t *testing.T) {
	settings := ProjectSettings{
		WorkspacePath: "/Users/alice/projects/demo",
	}
	data, err := json.Marshal(settings)
	if err != nil {
		t.Fatalf("marshal error: %v", err)
	}
	var decoded ProjectSettings
	if err := json.Unmarshal(data, &decoded); err != nil {
		t.Fatalf("unmarshal error: %v", err)
	}
	if decoded.WorkspacePath != "/Users/alice/projects/demo" {
		t.Fatalf("got WorkspacePath %q, want %q", decoded.WorkspacePath, "/Users/alice/projects/demo")
	}
}
