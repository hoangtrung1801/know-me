//go:build ignore

// A disposable contract backend: production route handlers, temporary storage,
// no mutations of the user's project registry or records, no agent processes.
package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"syscall"

	"github.com/go-chi/chi/v5"
	"github.com/gorilla/websocket"
	"github.com/hoangtrung1801/know-me/internal/registry"
	"github.com/hoangtrung1801/know-me/internal/server"
	"github.com/hoangtrung1801/know-me/internal/server/routes"
	"github.com/hoangtrung1801/know-me/internal/storage"
)

func main() {
	// Keep fixture search jobs in this process and temporary store.
	if err := os.Setenv("KNOWNS_RUNTIME_INLINE", "1"); err != nil {
		panic(err)
	}
	root, err := os.MkdirTemp("", "knowme-native-smoke-")
	if err != nil {
		panic(err)
	}
	defer os.RemoveAll(root)
	store := storage.NewStore(root)
	if err := store.Init("Native Foundation Fixture"); err != nil {
		panic(err)
	}
	reg := registry.NewRegistryWithPath(filepath.Join(root, "fixture-registry.json"))
	project, err := reg.Create("Native Fixture")
	if err != nil {
		panic(err)
	}
	manager := storage.NewManager(store, reg)
	broker := server.NewSSEBroker()
	auth := server.NewAuthManager("fixture-password")
	router := chi.NewRouter()
	// Foundation checks plus task mutations constrained to this temporary project. Global-library
	// handlers use the user's normal global-root resolver, so never allow those
	// routes (or arbitrary mutations) through this disposable test server.
	router.Use(func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			allowedRead := r.Method == http.MethodGet && (r.URL.Path == "/api/auth/status" || r.URL.Path == "/api/status" || r.URL.Path == "/api/events" || r.URL.Path == "/api/workspaces" || r.URL.Path == "/api/tasks" || r.URL.Path == "/api/docs" || r.URL.Path == "/ws/chat")
			allowedWrite := r.Method == http.MethodPost && (r.URL.Path == "/api/auth/login" || r.URL.Path == "/api/workspaces/switch")
			scopedTasks := r.URL.Query().Get("projectId") == project.ID
			taskRead := scopedTasks && r.Method == http.MethodGet && strings.HasPrefix(r.URL.Path, "/api/tasks/")
			taskReorder := scopedTasks && r.Method == http.MethodPost && r.URL.Path == "/api/tasks/reorder"
			taskUpdate := scopedTasks && r.Method == http.MethodPut && strings.HasPrefix(r.URL.Path, "/api/tasks/")
			taskCreate := scopedTasks && r.Method == http.MethodPost && r.URL.Path == "/api/tasks"
			if (taskRead || taskUpdate) && !strings.HasPrefix(strings.TrimPrefix(r.URL.Path, "/api/tasks/"), project.ID+":") {
				http.Error(w, "fixture: unsafe task identity", http.StatusForbidden)
				return
			}
			if taskCreate || taskUpdate || taskReorder {
				data, readErr := io.ReadAll(io.LimitReader(r.Body, 1<<20))
				var fields map[string]any
				valid := readErr == nil && json.Unmarshal(data, &fields) == nil
				if taskCreate {
					valid = valid && fields["projectId"] == project.ID && fields["global"] != true
				} else if taskUpdate {
					valid = valid && (fields["projectId"] == nil || fields["projectId"] == project.ID) && fields["global"] != true
				} else if taskReorder {
					orders, ok := fields["orders"].([]any)
					valid = valid && ok
					for _, raw := range orders {
						item, ok := raw.(map[string]any)
						if !ok {
							valid = false
							break
						}
						id, ok := item["id"].(string)
						if !ok || !strings.HasPrefix(id, project.ID+":") {
							valid = false
							break
						}
					}
				}
				if !valid {
					http.Error(w, "fixture: unsafe task mutation", http.StatusForbidden)
					return
				}
				r.Body = io.NopCloser(bytes.NewReader(data))
			}
			if !allowedRead && !allowedWrite && !taskRead && !taskCreate && !taskUpdate && !taskReorder {
				http.Error(w, "foundation fixture: route disabled", http.StatusForbidden)
				return
			}
			next.ServeHTTP(w, r)
		})
	})
	router.Use(auth.Middleware)
	router.Route("/api/auth", func(r chi.Router) { routes.SetupAuthRoutes(r, auth, broker) })
	router.Get("/api/status", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]any{"active": true, "projectName": "Native Foundation Fixture", "projectPath": root, "version": "fixture-current-source"})
	})
	router.Get("/api/events", broker.Subscribe)
	router.Route("/api", func(r chi.Router) { routes.SetupRoutes(r, store, broker, root, manager) })
	router.Get("/ws/chat", func(w http.ResponseWriter, r *http.Request) {
		upgrader := websocket.Upgrader{}
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			return
		}
		defer conn.Close()
		conn.WriteJSON(map[string]string{"type": "fixture-ready"})
		for {
			kind, data, err := conn.ReadMessage()
			if err != nil {
				return
			}
			if conn.WriteMessage(kind, data) != nil {
				return
			}
		}
	})
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		panic(err)
	}
	srv := &http.Server{Handler: router}
	go srv.Serve(listener)
	fmt.Printf("http://%s\n", listener.Addr().String())
	signals := make(chan os.Signal, 1)
	signal.Notify(signals, os.Interrupt, syscall.SIGTERM)
	<-signals
	srv.Close()
}
