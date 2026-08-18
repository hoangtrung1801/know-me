# Friendly READMEs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Polish the bilingual README pages into friendly, scannable guides for understanding, installing, and using Know-Me.

**Architecture:** This is a Markdown-only visual-content update. The English and Vietnamese READMEs retain their existing product claims and commands, but present them through a stronger hero, a concise callout, capability cards, and a first-session walkthrough.

**Tech Stack:** Markdown and existing repository images.

## Global Constraints

- Modify only `README.md` and `README.vi.md` for the product update.
- Preserve existing supported commands and valid links.
- Add no dependencies, generated assets, or product claims.
- Keep the language versions structurally equivalent.
- Do not commit without the user explicitly requesting it.

---

### Task 1: Polish the English README

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: Existing commands for projects, tasks, saved links, and memos.
- Produces: The English, friendly field-guide product page.

- [ ] **Step 1: Strengthen the product introduction**

Use the existing logo and product promise, then add a friendly blockquote that frames Know-Me as one calm place for active work and things worth remembering.

- [ ] **Step 2: Turn core capabilities into visual cards**

Replace the four plain capability subsections with a four-column Markdown table that uses distinct emoji markers and one concise benefit for Projects, Tasks, Saved Links, and Memos. Keep the existing commands in a compact “Try it” block below the table.

- [ ] **Step 3: Add a first-session walkthrough**

Turn Quick Start into a numbered first-session checklist that matches the command sequence: install, initialize, create a task, save a link and memo, open the browser.

### Task 2: Polish the Vietnamese README

**Files:**
- Modify: `README.vi.md`

**Interfaces:**
- Consumes: The English README’s structure and the existing command names.
- Produces: The Vietnamese, friendly field-guide product page.

- [ ] **Step 1: Mirror the visual introduction**

Translate the English callout naturally and preserve all product claims.

- [ ] **Step 2: Mirror the capability cards and Try it block**

Use the same four capability categories, emoji markers, and CLI commands with Vietnamese explanatory copy.

- [ ] **Step 3: Mirror the first-session walkthrough**

Use the same five steps in Vietnamese while keeping commands unchanged.

### Task 3: Validate the README pair

**Files:**
- Modify: `README.md`, `README.vi.md`

**Interfaces:**
- Consumes: Both updated READMEs.
- Produces: A consistent bilingual documentation landing page.

- [ ] **Step 1: Check heading parity**

Run: `rg '^## ' README.md README.vi.md`

Expected: both files contain the same high-level product, quick-start, install, documentation, development, and links sections.

- [ ] **Step 2: Check removed positioning and Markdown whitespace**

Run: `rg -n -i 'AI coding assistant|AI-native development|project context layer' README.md README.vi.md; git diff --check -- README.md README.vi.md`

Expected: no obsolete positioning and no whitespace errors.

- [ ] **Step 3: Inspect the final diff**

Run: `git diff -- README.md README.vi.md`

Expected: only the bilingual README presentation changes are present.
