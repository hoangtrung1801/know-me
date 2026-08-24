# Task Archive Missing Project Config Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow task lifecycle archival to use the documented default policy when a legacy or partially initialized project has no central `config.json`.

**Architecture:** Keep project-specific settings authoritative when the config exists. When only the project config file is missing, the lifecycle service will use `models.DefaultTaskLifecycleSettings()` so task storage and archival remain usable; malformed or invalid existing configs will continue to fail loudly.

**Tech Stack:** Go, `testing`, project-scoped storage, task lifecycle service.

**Spec:** `docs/superpowers/specs/2026-08-01-global-multi-project-store-design.md`

## Global Constraints

- Do not modify task or document Markdown directly.
- Preserve explicit project lifecycle settings when `config.json` exists.
- Treat only a missing config file as recoverable; propagate parse and validation errors.
- Verify the focused regression test, relevant package tests, `go vet`, and `git diff --check`.

### Task 1: Recover task archival when a project config is missing

**Files:**
- Modify: `internal/tasklifecycle/service_test.go`
- Modify: `internal/tasklifecycle/service.go`

**Interfaces:**
- Consumes: `storage.NewProjectStore`, `models.DefaultTaskLifecycleSettings`, and the existing `Service.settings` method.
- Produces: archival using default lifecycle settings when `Config.Load` returns an `os.ErrNotExist`-wrapped error.

- [x] **Step 1: Write the failing regression test**

Create a project-scoped store without calling `Init`, create an old completed task in its shared task store, and assert `Archive` succeeds and archives the task.

- [x] **Step 2: Run the focused test to verify it fails**

Run: `go test ./internal/tasklifecycle -run TestArchiveUsesDefaultSettingsWhenProjectConfigIsMissing -count=1`

Expected: FAIL with an error containing `load config` and the missing `config.json` path.

- [x] **Step 3: Implement the minimal fallback**

In `Service.settings`, return `models.DefaultTaskLifecycleSettings()` only when `errors.Is(err, os.ErrNotExist)`; return all other config errors unchanged.

- [x] **Step 4: Run the focused test to verify it passes**

Run: `go test ./internal/tasklifecycle -run TestArchiveUsesDefaultSettingsWhenProjectConfigIsMissing -count=1`

Expected: PASS, with the task moved to the archive and no config file created as a side effect.

- [x] **Step 5: Run the relevant validation**

Run: `go test ./internal/tasklifecycle ./internal/server/routes -count=1`

Expected: PASS with zero failures.

- [x] **Step 6: Run repository checks**

Run: `go test ./... && go vet ./... && git diff --check`

Expected: all commands exit successfully.
