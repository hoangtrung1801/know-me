package cli

import (
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/hoangtrung1801/known-me/internal/models"
	"github.com/hoangtrung1801/known-me/internal/registry"
	"github.com/hoangtrung1801/known-me/internal/storage"
	"github.com/hoangtrung1801/known-me/internal/tasklifecycle"
)

func TestTaskLifecycleCLIPreviewExplicitExecuteAndHardDeleteIntent(t *testing.T) {
	projectRoot, store := setupTaskLifecycleCLIProject(t, "cli")
	t.Chdir(projectRoot)
	now := time.Now().UTC()
	completed := now.Add(-time.Hour)
	if err := store.Tasks.Create(&models.Task{ID: "cli-life", Title: "cli-life", Status: "done", Priority: "medium", CreatedAt: now.Add(-2 * time.Hour), UpdatedAt: completed, CompletedAt: &completed}); err != nil {
		t.Fatal(err)
	}

	_ = taskArchiveCmd.Flags().Set("yes", "false")
	t.Cleanup(func() {
		_ = taskArchiveCmd.Flags().Set("yes", "false")
		_ = taskDeleteCmd.Flags().Set("yes", "false")
		_ = taskDeleteCmd.Flags().Set("allow-hard-delete", "false")
		_ = taskDeleteCmd.Flags().Set("reason", "")
	})
	if err := taskArchiveCmd.RunE(taskArchiveCmd, []string{"cli-life"}); err != nil {
		t.Fatalf("preview: %v", err)
	}
	if task, err := store.Tasks.Get("cli-life"); err != nil || task.Archived {
		t.Fatalf("preview mutated Task: %+v, %v", task, err)
	}

	_ = taskArchiveCmd.Flags().Set("yes", "true")
	if err := taskArchiveCmd.RunE(taskArchiveCmd, []string{"cli-life"}); err != nil {
		t.Fatalf("execute: %v", err)
	}
	if task, err := store.Tasks.Get("cli-life"); err != nil || !task.Archived {
		t.Fatalf("archive did not execute: %+v, %v", task, err)
	}

	_ = taskDeleteCmd.Flags().Set("yes", "true")
	_ = taskDeleteCmd.Flags().Set("reason", "approved CLI cleanup")
	_ = taskDeleteCmd.Flags().Set("allow-hard-delete", "false")
	if err := taskDeleteCmd.RunE(taskDeleteCmd, []string{"cli-life"}); err == nil {
		t.Fatal("denied delete returned success exit")
	}
	if _, err := store.Tasks.Get("cli-life"); err != nil {
		t.Fatalf("unprivileged delete removed Task: %v", err)
	}

	_ = taskDeleteCmd.Flags().Set("allow-hard-delete", "true")
	if err := taskDeleteCmd.RunE(taskDeleteCmd, []string{"cli-life"}); err != nil {
		t.Fatalf("hard-delete: %v", err)
	}
	if _, err := store.Tasks.Get("cli-life"); err == nil {
		t.Fatal("hard-delete left Task content")
	}
	if tombstone, err := store.Tasks.GetTombstone("cli-life"); err != nil || tombstone.Reason != "approved CLI cleanup" {
		t.Fatalf("tombstone = %+v, %v", tombstone, err)
	}
}

func TestTaskLifecycleCLIEmptyBatchUsesStableErrorAndHumanOutputIsComplete(t *testing.T) {
	projectRoot, _ := setupTaskLifecycleCLIProject(t, "cli-contract")
	t.Chdir(projectRoot)
	output := captureStdout(t, func() {
		if err := taskBatchUnarchiveCmd.RunE(taskBatchUnarchiveCmd, nil); err == nil {
			t.Error("empty batch-unarchive returned success exit")
		}
	})
	if !strings.Contains(output, "invalid_request") {
		t.Fatalf("empty batch output = %q", output)
	}

	now := time.Date(2026, 7, 22, 6, 0, 0, 0, time.UTC)
	deadline := now.Add(time.Hour)
	response := &tasklifecycle.Response{
		Operation: tasklifecycle.OperationBatchArchive, Execute: true, Completed: true,
		Processed: 2, Changed: 1, FailedTaskID: "second",
		Items: []tasklifecycle.Result{{
			TaskID: "first", Operation: tasklifecycle.OperationArchive, Eligible: true, Changed: true,
			Before: models.TaskLifecycleDone, After: models.TaskLifecycleArchived,
			CompletedAt: &now, ArchivedAt: &now, Deadline: &deadline,
			Warnings: []tasklifecycle.Warning{{Code: tasklifecycle.WarningDurableKnowledge, Message: "review", References: []string{"@doc/guide"}}},
			Event:    &tasklifecycle.Event{ID: "event-123", TaskID: "first", Type: tasklifecycle.OperationArchive, At: now},
		}},
	}
	output = captureStdout(t, func() { printLifecycleResponse(response) })
	for _, observable := range []string{"processed=2", "changed=1", "failedTaskId=second", "[1/2]", "completedAt=", "archivedAt=", "deadline=", "eventId=event-123", "warning=durable_knowledge_review", "references=@doc/guide"} {
		if !strings.Contains(output, observable) {
			t.Fatalf("human output missing %q: %s", observable, output)
		}
	}
}

func setupTaskLifecycleCLIProject(t *testing.T, name string) (string, *storage.Store) {
	t.Helper()
	home := t.TempDir()
	t.Setenv("HOME", home)
	t.Setenv("USERPROFILE", home)
	projectRoot := t.TempDir()
	reg := registry.NewRegistryWithPath(filepath.Join(home, ".known-me", "registry.json"))
	if err := reg.Load(); err != nil {
		t.Fatal(err)
	}
	project, err := reg.Create(name)
	if err != nil {
		t.Fatal(err)
	}
	if err := storage.NewStore(storage.GlobalRootPath()).Init(name); err != nil {
		t.Fatal(err)
	}
	store := storage.NewProjectStore(storage.GlobalRootPath(), project.ID, projectRoot)
	if err := store.Init(name); err != nil {
		t.Fatal(err)
	}
	if err := writeWorkspaceProjectLink(projectRoot, project.ID); err != nil {
		t.Fatal(err)
	}
	return projectRoot, store
}
