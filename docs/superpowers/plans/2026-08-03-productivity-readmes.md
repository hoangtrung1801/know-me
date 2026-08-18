# Productivity READMEs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reposition the English and Vietnamese READMEs as the product entry points for a local-first productivity workspace.

**Architecture:** This is a documentation-only change. Both README files will use the same product structure and describe only existing capabilities: projects, tasks, saved links, and memos. Technical contributor material remains available after the user-facing product content.

**Tech Stack:** Markdown; existing Know-Me CLI commands.

## Global Constraints

- Modify only `README.md` and `README.vi.md` for the product copy.
- Keep English and Vietnamese product sections aligned.
- Do not claim unimplemented functionality.
- Preserve valid installation, language, documentation, community, and repository links.
- Do not create a git commit unless the user explicitly requests one.

---

### Task 1: Rewrite the English README

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: Existing CLI capabilities: `knowns init`, `knowns task`, `knowns link`, and `knowns memo`.
- Produces: The canonical English product narrative for Know-Me.

- [ ] **Step 1: Replace the hero and opening narrative**

Use a concise local-first productivity promise. Describe the problem as scattered projects, unfinished tasks, forgotten links, and fleeting notes. Remove AI coding assistant and software-project-context claims.

- [ ] **Step 2: Replace product sections**

Use matching sections for a before-and-after comparison, how the workspace works, and four core capabilities: Projects, Tasks, Saved Links, and Memos. State that links and memos are global, as implemented.

- [ ] **Step 3: Replace Quick Start**

Show existing commands for initialization, one task, one saved link, one memo, and opening the browser. Keep installation methods and valid reference links.

- [ ] **Step 4: Check the English README**

Run: `rg -n -i 'AI coding assistant|AI-native development|project context layer' README.md`

Expected: no obsolete hero or positioning copy remains.

### Task 2: Rewrite the Vietnamese README

**Files:**
- Modify: `README.vi.md`

**Interfaces:**
- Consumes: The English README’s section order and existing CLI capabilities.
- Produces: The canonical Vietnamese product narrative for Know-Me.

- [ ] **Step 1: Translate the new English product narrative naturally**

Use Vietnamese copy centered on quản lý dự án, công việc, liên kết đã lưu, and ghi chú nhanh. Keep product names and CLI commands unchanged.

- [ ] **Step 2: Mirror the English product sections**

Keep the same high-level sections and capability claims: projects, tasks, global saved links, and global quick memos. Remove AI coding assistant and software-project-context claims.

- [ ] **Step 3: Mirror Quick Start**

Use the same working `knowns` commands as the English README and retain Vietnamese navigation labels and valid links.

- [ ] **Step 4: Check the Vietnamese README**

Run: `rg -n -i 'AI coding assistant|AI-native development|project context layer' README.vi.md`

Expected: no obsolete English technical positioning remains.

### Task 3: Validate documentation consistency

**Files:**
- Modify: `README.md`, `README.vi.md`

**Interfaces:**
- Consumes: Both rewritten READMEs.
- Produces: A consistent bilingual product message with valid internal links.

- [ ] **Step 1: Compare headings and anchors**

Run: `rg '^## ' README.md README.vi.md`

Expected: both files cover the same product topics in their respective languages.

- [ ] **Step 2: Validate Markdown whitespace**

Run: `git diff --check -- README.md README.vi.md`

Expected: no output.

- [ ] **Step 3: Review the final diff**

Run: `git diff -- README.md README.vi.md`

Expected: only productivity-focused copy changes are present.
