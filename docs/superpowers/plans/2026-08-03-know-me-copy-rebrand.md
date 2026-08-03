# Know-Me Copy Rebrand Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Present user-visible product copy as Know-Me without altering technical compatibility identifiers.

**Architecture:** This is a copy-only update. Change title-case product references in public documentation, UI, CLI/help output, installers, and GitHub-facing templates. Preserve lowercase technical identifiers such as `knowns`, `.knowns`, URLs, package names, commands, headers, and file paths.

**Tech Stack:** Markdown, TypeScript/React, Go, shell and PowerShell.

## Global Constraints

- Product name: `Know-Me`.
- Preserve all lowercase `knowns` compatibility identifiers verbatim.
- Do not edit `.knowns/` managed documents.
- Do not change user-owned files already modified before this task.

---

### Task 1: Update visible product copy

**Files:**
- Modify: root public Markdown, `docs/en/**/*.md`, `docs/vi/**/*.md`, `ui/src/**/*.tsx`, `ui/src/**/*.ts`, `internal/**/*.go`, `install/*`, `.github/{config.yml,CONTRIBUTING.md,DEVELOPMENT_WORKFLOW.md,ISSUE_TEMPLATE/bug_report.yml,workflows/ci.yml,workflows/publish.yml}`.
- Exclude: `.knowns/**`, `docs/superpowers/**`, tests, code comments, package metadata, commands, URLs, paths, headers, and identifiers.

**Interfaces:**
- Consumes: the existing literal product name `Knowns`.
- Produces: visible literal product name `Know-Me`.

- [ ] **Step 1: Capture the baseline visible-copy matches**

Run: `rg -n 'Knowns' README.md README.vi.md docs ui/src internal install .github`

Expected: existing product-name references across public copy and rendered strings.

- [ ] **Step 2: Replace only visible product-name literals**

Update `Knowns` to `Know-Me` in headings, prose, UI labels, CLI/help strings, installer output, and GitHub templates. Leave every lowercase compatibility identifier unchanged.

- [ ] **Step 3: Verify the rebrand boundaries**

Run: `rg -n 'Knowns' README.md README.vi.md docs ui/src internal install .github`

Expected: remaining matches, if any, are comments, tests, code identifiers, or other non-visible technical surfaces.

- [ ] **Step 4: Build and test changed application surfaces**

Run: `cd ui && bun run build && bun test:e2e`

Expected: UI build and end-to-end suite pass.

- [ ] **Step 5: Verify the Go application compiles**

Run: `go test ./internal/...`

Expected: all internal Go packages pass.
