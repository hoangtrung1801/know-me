# Browser Host Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let `knowns browser` listen on a requested host.

**Architecture:** Add one `--host` flag defaulting to `127.0.0.1`; thread it through the existing browser lifecycle helpers so binding, readiness, restart, and the displayed URL use the same address.

**Tech Stack:** Go, Cobra, standard library networking.

## Global Constraints

- No new dependencies or persistent configuration.
- Preserve the existing default port behavior.

---

### Task 1: Host-aware browser lifecycle

**Files:**
- Modify: `internal/cli/browser.go`
- Modify: `internal/cli/browser_test.go`

**Interfaces:**
- Produces: `knowns browser --host <host>` with default `127.0.0.1`.

- [ ] **Step 1: Write the failing test**

```go
ln, got, err := bindBrowserPort("127.0.0.1", port, 3)
if ln.Addr().String() != fmt.Sprintf("127.0.0.1:%d", got) {
    t.Fatalf("listener address = %s", ln.Addr())
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `go test ./internal/cli -run TestBindBrowserPortReturnsRequestedPortWhenFree`
Expected: FAIL because `bindBrowserPort` does not accept a host.

- [ ] **Step 3: Write the minimal implementation**

```go
browserCmd.Flags().String("host", "127.0.0.1", "HTTP server host")
listener, selectedPort, err := bindBrowserPort(host, port, maxBrowserPortAttempts)
```

Use `net.JoinHostPort(host, strconv.Itoa(port))` in all existing TCP and HTTP address construction.

- [ ] **Step 4: Run the focused package tests**

Run: `go test ./internal/cli`
Expected: PASS.
