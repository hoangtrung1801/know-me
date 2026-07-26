package server

import (
	"encoding/json"
	"fmt"
	"net/http"
	"sync"
	"time"

	"github.com/howznguyen/knowns/internal/server/routes"
)

// SSEBroker manages SSE client connections and broadcasts events to all of them.
// It implements routes.Broadcaster so route handlers can emit events without
// importing this package (which would create a cycle).
type SSEBroker struct {
	clients map[chan routes.SSEEvent]struct{}
	mu      sync.RWMutex
}

// NewSSEBroker creates a new SSEBroker with no connected clients.
func NewSSEBroker() *SSEBroker {
	return &SSEBroker{
		clients: make(map[chan routes.SSEEvent]struct{}),
	}
}

// Subscribe handles an incoming SSE request. It registers the client,
// streams events until the connection closes, and then deregisters.
func (b *SSEBroker) Subscribe(w http.ResponseWriter, r *http.Request) {
	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "streaming unsupported", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no")

	ch := make(chan routes.SSEEvent, 64)

	b.mu.Lock()
	b.clients[ch] = struct{}{}
	b.mu.Unlock()

	defer func() {
		b.mu.Lock()
		delete(b.clients, ch)
		b.mu.Unlock()
		close(ch)
	}()

	// Send an initial "connected" event so the client knows the stream is live.
	fmt.Fprintf(w, "event: connected\ndata: {\"timestamp\":%d}\n\n", time.Now().UnixMilli())
	flusher.Flush()

	ctx := r.Context()
	for {
		select {
		case <-ctx.Done():
			return
		case evt, open := <-ch:
			if !open {
				return
			}
			dataPayload, err := json.Marshal(evt.Data)
			if err != nil {
				continue
			}
			// Use named SSE events so EventSource.addEventListener(type) works.
			fmt.Fprintf(w, "event: %s\ndata: %s\n\n", evt.Type, dataPayload)
			flusher.Flush()
		}
	}
}

// Broadcast sends an event to every currently subscribed client.
// It satisfies the routes.Broadcaster interface.
func (b *SSEBroker) Broadcast(event routes.SSEEvent) {
	b.mu.RLock()
	defer b.mu.RUnlock()
	for ch := range b.clients {
		select {
		case ch <- event:
		default:
			// Drop event if the client channel is full to avoid blocking.
		}
	}
}
