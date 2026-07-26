package models

// ChatSession represents a single chat conversation with an AI agent.
// Persisted in .knowns/chats.json.
type ChatSession struct {
	ID           string        `json:"id"`        // base36 (NewTaskID)
	SessionID    string        `json:"sessionId"` // UUID for --session-id
	Title        string        `json:"title"`
	AgentType    string        `json:"agentType"` // "claude" | "opencode" — immutable
	Model        string        `json:"model"`     // switchable within same agent system
	Status       string        `json:"status"`    // "idle" | "streaming" | "error"
	TaskID       string        `json:"taskId,omitempty"`
	CreatedAt    string        `json:"createdAt"`
	UpdatedAt    string        `json:"updatedAt"`
	Messages     []ChatMessage `json:"messages"`
	MessageQueue []string      `json:"messageQueue"` // queued messages when streaming
}

// ChatMessage is a summary of a single message in the chat.
// Full conversation context is managed by the agent's --session-id.
type ChatMessage struct {
	ID           string  `json:"id"`
	Role         string  `json:"role"` // "user" | "assistant"
	Content      string  `json:"content"`
	Model        string  `json:"model"`
	CreatedAt    string  `json:"createdAt"`
	Cost         float64 `json:"cost,omitempty"`
	Duration     int     `json:"duration,omitempty"` // milliseconds
	Tokens       int     `json:"tokens,omitempty"`   // total tokens used
	InputTokens  int     `json:"inputTokens,omitempty"`
	OutputTokens int     `json:"outputTokens,omitempty"`
}
