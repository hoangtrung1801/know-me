# Minimal Init Implementation Plan

> **For agentic workers:** Execute inline in this session.

**Goal:** Reduce `knowns init` to project-name input plus basic project setup.

**Architecture:** Keep the existing registry and config initialization path.
Remove optional setup prompts and post-init steps from `runInit`.

**Tech Stack:** Go, Cobra, existing init tests.

## Global Constraints

- Wizard asks only for project name.
- Default Git tracking is `git-tracked` with every section enabled.
- No instruction-file, semantic-search, embedding-model, semantic-index, or LSP setup.

### Task 1: Lock the reduced init behavior with tests

**Files:** `internal/cli/init_test.go`

- Add assertions that init does not create instruction files or semantic setup artifacts.
- Add assertions that saved settings use git-tracked mode and all sections.
- Run the focused tests and confirm the new assertions fail before production edits.

### Task 2: Simplify the init implementation

**Files:** `internal/cli/init.go`

- Remove semantic and instruction-file wizard groups.
- Set Git tracking defaults explicitly to `git-tracked` and all sections.
- Remove instruction-file generation and semantic/LSP/download steps from the init pipeline.
- Keep Git repository initialization, project/config creation, settings, hints, and optional browser launch.
- Run `gofmt` and focused tests.

### Task 3: Update user-facing init documentation

**Files:** `docs/en/reference/commands.md`, `.knowns/docs/features/init-process.md`

- Describe the name-only wizard and the reduced execution steps.
- Remove obsolete semantic, instruction-file, and language-server claims.
- Run the relevant Go test package and inspect the diff.
