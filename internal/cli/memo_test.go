package cli

import (
	"bytes"
	"encoding/json"
	"testing"

	"github.com/howznguyen/knowns/internal/memos"
	"github.com/howznguyen/knowns/internal/models"
)

func runMemoCommand(t *testing.T, service *memos.Service, args ...string) string {
	t.Helper()
	cmd := newMemoCmd(service)
	cmd.PersistentFlags().Bool("json", false, "JSON output")
	var output bytes.Buffer
	cmd.SetOut(&output)
	cmd.SetArgs(args)
	if err := cmd.Execute(); err != nil {
		t.Fatal(err)
	}
	return output.String()
}

func TestMemoCommandLifecycle(t *testing.T) {
	service := memos.NewService(t.TempDir())
	var created models.Memo
	if err := json.Unmarshal([]byte(runMemoCommand(t, service, "add", "# CLI memo", "--json")), &created); err != nil {
		t.Fatal(err)
	}
	var found []*models.Memo
	if err := json.Unmarshal([]byte(runMemoCommand(t, service, "list", "--search", "cli", "--json")), &found); err != nil {
		t.Fatal(err)
	}
	if len(found) != 1 || found[0].ID != created.ID {
		t.Fatalf("found = %+v", found)
	}
	var updated models.Memo
	if err := json.Unmarshal([]byte(runMemoCommand(t, service, "update", created.ID, "Edited", "--json")), &updated); err != nil {
		t.Fatal(err)
	}
	if updated.Content != "Edited" {
		t.Fatalf("updated = %+v", updated)
	}
	runMemoCommand(t, service, "delete", created.ID)
	if items, _ := service.List(""); len(items) != 0 {
		t.Fatalf("remaining = %+v", items)
	}
}
