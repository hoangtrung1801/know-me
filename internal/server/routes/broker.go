package routes

// SSEEvent mirrors server.SSEEvent so that the routes package does not import
// the server package (which would create a circular dependency).
type SSEEvent struct {
	Type string      `json:"type"`
	Data interface{} `json:"data"`
}

// Broadcaster is implemented by server.SSEBroker.
type Broadcaster interface {
	Broadcast(event SSEEvent)
}
