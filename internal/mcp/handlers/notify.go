package handlers

import (
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/howznguyen/knowns/internal/storage"
)

// notifyServer sends a POST request to the running Knowns server to trigger
// an SSE event. This is used by MCP handlers (which run in a separate process)
// to notify the Web UI of data changes.
//
// It reads the server port from .knowns/.server-port and POSTs to the
// /api/notify/* endpoints. Failures are silently ignored since the server
// may not be running.
func notifyServer(store *storage.Store, path string) {
	port := readServerPort(store)
	if port == "" {
		return
	}

	url := fmt.Sprintf("http://localhost:%s/api/%s", port, path)
	client := &http.Client{Timeout: 2 * time.Second}

	req, err := http.NewRequest(http.MethodPost, url, nil)
	if err != nil {
		return
	}

	resp, err := client.Do(req)
	if err != nil {
		return
	}
	resp.Body.Close()
}

// readServerPort reads the server port from .knowns/.server-port.
func readServerPort(store *storage.Store) string {
	portFile := filepath.Join(store.Root, ".server-port")
	data, err := os.ReadFile(portFile)
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(data))
}

// notifyTaskUpdated notifies the server that a task was updated.
func notifyTaskUpdated(store *storage.Store, taskID string) {
	notifyServer(store, "notify/task/"+taskID)
}

// notifyDocUpdated notifies the server that a doc was updated.
func notifyDocUpdated(store *storage.Store, docPath string) {
	notifyServer(store, "notify/doc/"+docPath)
}

// notifyTimeUpdated notifies the server that time tracking state changed.
func notifyTimeUpdated(store *storage.Store) {
	notifyServer(store, "notify/time")
}
