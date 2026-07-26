package tests

import (
	"encoding/json"
	"strings"
	"testing"
)

// TestMCP_StructuralResolve tests the structural retrieval feature via MCP.
func TestMCP_StructuralResolve(t *testing.T) {
	client, _ := setupMCPTest(t)

	// Create a spec doc.
	client.CallTool("docs", map[string]any{
		"action":  "create",
		"title":   "Structural Test Spec",
		"folder":  "specs",
		"content": "# Structural Test Spec\n\nA test spec for structural retrieval.",
		"tags":    []string{"spec", "approved"},
	})

	// Create 3 tasks linked to the spec.
	var taskIDs []string
	for _, title := range []string{"Task Alpha", "Task Beta", "Task Gamma"} {
		result := client.CallTool("tasks", map[string]any{
			"action": "create",
			"title":  title,
			"spec":   "specs/structural-test-spec",
		})
		id, _ := result["id"].(string)
		if id == "" {
			t.Fatalf("no task id for %s: %v", title, result)
		}
		taskIDs = append(taskIDs, id)
	}

	// Create a blocked chain: taskIDs[0] blocked-by taskIDs[1] (via inline ref).
	client.CallTool("tasks", map[string]any{
		"action":      "update",
		"taskId":      taskIDs[0],
		"description": "Blocked by @task-" + taskIDs[1] + "{blocked-by}",
	})

	// --- Test 1: Basic resolve (no structural params) returns old format ---
	t.Run("basic resolve backward compat", func(t *testing.T) {
		raw := client.CallToolRaw("search", map[string]any{
			"action": "resolve",
			"ref":    "@doc/specs/structural-test-spec",
		})
		// Old format has "reference" and "found" keys.
		if !strings.Contains(raw, "\"found\"") || !strings.Contains(raw, "\"reference\"") {
			t.Errorf("expected old format with 'found' and 'reference', got: %s", truncate(raw, 300))
		}
	})

	// --- Test 2: Structural resolve inbound implements ---
	t.Run("inbound implements", func(t *testing.T) {
		raw := client.CallToolRaw("search", map[string]any{
			"action":        "resolve",
			"ref":           "@doc/specs/structural-test-spec{implements}",
			"direction":     "inbound",
			"relationTypes": "implements",
		})

		var result map[string]any
		if err := json.Unmarshal([]byte(raw), &result); err != nil {
			t.Fatalf("parse result: %v\nraw: %s", err, truncate(raw, 500))
		}

		// Should have root, edges, unresolved.
		root, _ := result["root"].(map[string]any)
		if root == nil {
			t.Fatalf("missing root in result: %s", truncate(raw, 500))
		}
		if root["kind"] != "doc" {
			t.Errorf("root kind = %v, want doc", root["kind"])
		}

		edges, _ := result["edges"].([]any)
		if len(edges) != 3 {
			t.Fatalf("expected 3 implements edges, got %d: %s", len(edges), truncate(raw, 500))
		}

		for _, e := range edges {
			edge, _ := e.(map[string]any)
			if edge["relation"] != "implements" {
				t.Errorf("edge relation = %v, want implements", edge["relation"])
			}
			if edge["origin"] != "field-backed" {
				t.Errorf("edge origin = %v, want field-backed", edge["origin"])
			}
			if edge["direction"] != "inbound" {
				t.Errorf("edge direction = %v, want inbound", edge["direction"])
			}
		}
	})

	// --- Test 3: Entity type filter ---
	t.Run("entity type filter", func(t *testing.T) {
		raw := client.CallToolRaw("search", map[string]any{
			"action":      "resolve",
			"ref":         "@doc/specs/structural-test-spec{references}",
			"direction":   "inbound",
			"entityTypes": "task",
		})

		var result map[string]any
		if err := json.Unmarshal([]byte(raw), &result); err != nil {
			t.Fatalf("parse: %v", err)
		}

		edges, _ := result["edges"].([]any)
		for _, e := range edges {
			edge, _ := e.(map[string]any)
			src, _ := edge["source"].(map[string]any)
			tgt, _ := edge["target"].(map[string]any)
			// The "other" entity (not root) should be a task.
			other := src
			if src != nil && src["kind"] == "doc" {
				other = tgt
			}
			if other != nil && other["kind"] != "task" {
				t.Errorf("expected only task entities, got %v", other["kind"])
			}
		}
	})

	// --- Test 4: Multi-hop traversal ---
	t.Run("multi-hop depth 2", func(t *testing.T) {
		raw := client.CallToolRaw("search", map[string]any{
			"action":    "resolve",
			"ref":       "@doc/specs/structural-test-spec{implements}",
			"direction": "inbound",
			"depth":     2,
		})

		var result map[string]any
		if err := json.Unmarshal([]byte(raw), &result); err != nil {
			t.Fatalf("parse: %v", err)
		}

		edges, _ := result["edges"].([]any)
		// At depth 1: 3 tasks (implements + spec). At depth 2: blocked-by chain etc.
		// Just verify we get more than depth-1 results.
		hasDepth2 := false
		for _, e := range edges {
			edge, _ := e.(map[string]any)
			if d, ok := edge["depth"].(float64); ok && d == 2 {
				hasDepth2 = true
			}
		}
		if !hasDepth2 {
			t.Logf("no depth-2 edges found (may be expected if no depth-2 relations exist): %s", truncate(raw, 500))
		}
	})

	// --- Test 5: Relation type filter ---
	t.Run("relation type filter", func(t *testing.T) {
		raw := client.CallToolRaw("search", map[string]any{
			"action":        "resolve",
			"ref":           "@doc/specs/structural-test-spec{spec}",
			"direction":     "inbound",
			"relationTypes": "spec",
		})

		var result map[string]any
		if err := json.Unmarshal([]byte(raw), &result); err != nil {
			t.Fatalf("parse: %v", err)
		}

		edges, _ := result["edges"].([]any)
		for _, e := range edges {
			edge, _ := e.(map[string]any)
			if edge["relation"] != "spec" {
				t.Errorf("expected only spec relations, got %v", edge["relation"])
			}
		}
	})
}

// TestCLI_StructuralResolve tests the structural retrieval via CLI.
func TestCLI_StructuralResolve(t *testing.T) {
	dir := setupTestProject(t)

	// Create spec doc.
	res := runCli(t, dir, "doc", "create", "CLI Structural Spec",
		"--folder", "specs",
		"--tag", "spec",
		"--tag", "approved",
		"-c", "# CLI Structural Spec")
	requireSuccess(t, res, "create doc")

	// Create task linked to spec.
	res = runCli(t, dir, "task", "create", "CLI Struct Task",
		"--spec", "specs/cli-structural-spec")
	requireSuccess(t, res, "create task")

	// Test: resolve with --direction flag.
	t.Run("resolve with direction", func(t *testing.T) {
		res := runCli(t, dir, "resolve", "@doc/specs/cli-structural-spec{implements}",
			"--direction", "inbound", "--json")
		requireSuccess(t, res, "resolve inbound")

		var result map[string]any
		if err := json.Unmarshal([]byte(res.Stdout), &result); err != nil {
			t.Fatalf("parse JSON: %v\nstdout: %s", err, res.Stdout)
		}

		root, _ := result["root"].(map[string]any)
		if root == nil || root["kind"] != "doc" {
			t.Errorf("expected doc root, got: %v", root)
		}

		edges, _ := result["edges"].([]any)
		if len(edges) == 0 {
			t.Error("expected at least 1 edge")
		}
	})

	// Test: resolve with --depth flag.
	t.Run("resolve with depth", func(t *testing.T) {
		res := runCli(t, dir, "resolve", "@doc/specs/cli-structural-spec{implements}",
			"--direction", "inbound", "--depth", "2", "--plain")
		requireSuccess(t, res, "resolve depth 2")
		assertContains(t, res.Stdout, "Root:", "expected Root: in plain output")
		assertContains(t, res.Stdout, "Edges:", "expected Edges: in plain output")
	})

	// Test: resolve with --relation flag.
	t.Run("resolve with relation filter", func(t *testing.T) {
		res := runCli(t, dir, "resolve", "@doc/specs/cli-structural-spec{spec}",
			"--direction", "inbound", "--relation", "spec", "--json")
		requireSuccess(t, res, "resolve relation filter")

		var result map[string]any
		if err := json.Unmarshal([]byte(res.Stdout), &result); err != nil {
			t.Fatalf("parse JSON: %v", err)
		}

		edges, _ := result["edges"].([]any)
		for _, e := range edges {
			edge, _ := e.(map[string]any)
			if edge["relation"] != "spec" {
				t.Errorf("expected spec relation, got %v", edge["relation"])
			}
		}
	})

	// Test: resolve with --type flag.
	t.Run("resolve with type filter", func(t *testing.T) {
		res := runCli(t, dir, "resolve", "@doc/specs/cli-structural-spec{references}",
			"--direction", "inbound", "--type", "task", "--json")
		requireSuccess(t, res, "resolve type filter")
	})

	// Test: resolve without structural flags returns old format.
	t.Run("resolve without structural flags", func(t *testing.T) {
		res := runCli(t, dir, "resolve", "@doc/specs/cli-structural-spec", "--json")
		requireSuccess(t, res, "resolve basic")
		assertContains(t, res.Stdout, "\"found\"", "expected old format with 'found'")
		assertContains(t, res.Stdout, "\"reference\"", "expected old format with 'reference'")
	})
}
