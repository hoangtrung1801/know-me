# Task Execution

## Step 1: Take Task

{{#if cli}}
### CLI
```bash
knownme task edit <id> -s in-progress -a @me
knownme time start <id>    # REQUIRED!
```
{{/if}}
{{#if mcp}}
### MCP
```json
// Update status and assignee
mcp__knowns__update_task({
  "taskId": "<id>",
  "status": "in-progress",
  "assignee": "@me"
})

// Start timer (REQUIRED!)
mcp__knowns__start_time({ "taskId": "<id>" })
```
{{/if}}

---

## Step 2: Research

{{#if cli}}
### CLI
```bash
# Read task and follow ALL refs
knownme task <id> --plain
# @doc/xxx → knownme doc "xxx" --plain
# @task-YY → knownme task YY --plain

# Search related docs
knownme search "keyword" --type doc --plain

# Check similar done tasks
knownme search "keyword" --type task --status done --plain
```
{{/if}}
{{#if mcp}}
### MCP
```json
// Read task and follow ALL refs
mcp__knowns__get_task({ "taskId": "<id>" })

// @doc/xxx -> read the doc
mcp__knowns__get_doc({ "path": "xxx", "smart": true })

// @task-YY -> read the task
mcp__knowns__get_task({ "taskId": "YY" })

// Search related docs
mcp__knowns__search({ "query": "keyword", "type": "doc" })
```
{{/if}}

---

## Step 3: Plan (BEFORE coding!)

{{#if cli}}
### CLI
```bash
knownme task edit <id> --plan $'1. Research (see @doc/xxx)
2. Implement
3. Test
4. Document'
```
{{/if}}
{{#if mcp}}
### MCP
```json
mcp__knowns__update_task({
  "taskId": "<id>",
  "plan": "1. Research (see @doc/xxx)\n2. Implement\n3. Test\n4. Document"
})
```
{{/if}}

**Share plan with user. WAIT for approval before coding.**

---

## Step 4: Implement

{{#if cli}}
### CLI
```bash
# Check AC only AFTER work is done
knownme task edit <id> --check-ac 1
knownme task edit <id> --append-notes "Done: feature X"
```
{{/if}}
{{#if mcp}}
### MCP
```json
// Check AC only AFTER work is done
mcp__knowns__update_task({
  "taskId": "<id>",
  "checkAc": [1],
  "appendNotes": "Done: feature X"
})
```
{{/if}}

---

## Scope Changes

If new requirements emerge during work:

{{#if cli}}
### CLI
```bash
# Small: Add to current task
knownme task edit <id> --ac "New requirement"
knownme task edit <id> --append-notes "Scope updated: reason"

# Large: Ask user first, then create follow-up
knownme task create "Follow-up: feature" -d "From task <id>"
```
{{/if}}
{{#if mcp}}
### MCP
```json
// Small: Add to current task
mcp__knowns__update_task({
  "taskId": "<id>",
  "addAc": ["New requirement"],
  "appendNotes": "Scope updated: reason"
})

// Large: Ask user first, then create follow-up
mcp__knowns__create_task({
  "title": "Follow-up: feature",
  "description": "From task <id>"
})
```
{{/if}}

**Don't silently expand scope. Ask user first.**

---

## Key Rules

1. **Plan before code** - Capture approach first
2. **Wait for approval** - Don't start without OK
3. **Check AC after work** - Not before
4. **Ask on scope changes** - Don't expand silently
