package mcp

import (
	"github.com/hoangtrung1801/known-me/internal/storage"
	"github.com/mark3labs/mcp-go/server"
)

func newLifecycleHooks(auditStore *storage.AuditStore, getRoot func() string) *server.Hooks {
	return newAuditHooks(auditStore, getRoot)
}
