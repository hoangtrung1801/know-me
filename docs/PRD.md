# Product Requirements Document (PRD): Know-Me ("The Memory Layer for AI-Native Software Development")

**Document Version:** 1.0  
**Status:** Active Product Specification  
**Distribution:** Single Go Binary + Embedded React Web UI + MCP Server  
**Primary Interfaces:** CLI (`knowme`), Web UI (`localhost:3000`), Model Context Protocol (`mcp-go` stdio)  

---

## 1. Executive Summary & Product Vision

**Know-Me** is an open-source, local-first memory and context layer designed for AI-native software engineering. Its foundational mission is simple: **"Stop re-explaining your project to AI coding agents."**

As developers increasingly pair with autonomous AI agents (Claude, Cursor, Codex, OMP, Hermes), critical architectural decisions, task constraints, and domain knowledge are repeatedly lost in volatile chat windows. Know-Me bridges this gap by persisting project context into human-readable, Git-versioned Markdown files and lightweight local JSON stores. 

Through explicit cross-referencing (`@doc/<path>`, `@task/<id>`), local semantic search (hybrid BM25 + ONNX vector embeddings), background agent orchestration (OMP with isolated Git worktrees), and standard Model Context Protocol (MCP) tool exposure, Know-Me ensures that human engineers and AI agents share a persistent, authoritative source of project truth.

---

## 2. Problem Statement & Value Proposition

### 2.1 The Problem
1. **Context Amnesia Across Agent Sessions:** Every new AI agent session starts from a blank slate. Developers waste significant time re-prompting background requirements, conventions, and previous decisions.
2. **Fragmented Developer Knowledge:** Tasks live in Jira/Linear, technical specs live in Notion/Confluence, quick notes live in Apple Notes, and code lives in Git. AI agents cannot easily unify these disparate silos.
3. **Proprietary SaaS Lock-in:** Cloud-based knowledge bases expose proprietary codebases and architectural specs to third-party servers and introduce vendor lock-in.
4. **Agent Hallucination & Scope Creep:** Without deterministic references, AI agents invent non-existent APIs, violate architecture boundaries, and make ungrounded assumptions.

### 2.2 The Solution & Value Proposition
* **100% Local-First & Git-Native:** All tasks and documents reside in `.know-me/` inside the repository. Team members and agents share memory simply by pulling and pushing Git commits.
* **Deterministic Context Resolution:** Explicit `@doc` and `@task` identifiers provide zero-hallucination context extraction.
* **Unified Tri-Interface Access:** A developer can interact via terminal CLI (`knowme`), browse and edit via a rich desktop Web UI, or let an AI agent call tools via stdio MCP.
* **Isolated Agent Execution:** Built-in background coding agent runner (OMP) executes changes in disposable Git worktrees with strict plan and review gates.

---

## 3. Target Personas & Use Cases

### 3.1 Primary Persona: The AI-Augmented Software Engineer
* **Profile:** Uses tools like Cursor, Claude Code, OMP, or Hermes daily for implementation. Maintains complex codebases across multiple repositories.
* **Pain Points:** Constant context resets; agents drifting off-spec; difficulty tracking granular task state during multi-step refactors.
* **Core Workflow:**
  1. Captures spec in `knowme doc create`.
  2. Breaks down implementation steps into `knowme task create`.
  3. Dispatches background coding agent via MCP or CLI to execute against the task spec in an isolated worktree.
  4. Reviews diff, verifies acceptance criteria, and marks task complete.

### 3.2 Secondary Persona: Solo Builder / Technical Founder
* **Profile:** Juggles product research, architecture docs, rapid feature development, and saved reading materials.
* **Core Workflow:** Uses global memos (`knowme memo`) for fleeting ideas, saves reference links (`knowme link`) with auto-tagging, and manages backlog on the Kanban board.

---

## 4. Core Product Principles

1. **Files Over Clouds:** Plain Markdown and JSON on disk remain the ultimate source of truth. No mandatory cloud accounts, no telemetry lock-in, no remote database dependencies.
2. **AI as Collaborator, Not Black Box:** AI aids in collecting, summarizing, indexing, and executing tasks, but data schemas remain readable, editable, and auditable by humans.
3. **Low Latency & Single Binary:** Instant CLI startup (< 50ms) with zero runtime dependencies. Embedded assets ensure the Web UI and MCP server run directly from one compiled executable.
4. **Safety & Non-Destructive Execution:** Agent code changes run in isolated Git worktrees. Base branches are protected from dirty state corruption.

---

## 5. Functional Specifications & Core Modules

### 5.1 Project Management (`knowme project`)
* **Multi-Project & Local Scopes:** Supports repository-local stores (`.know-me/`) and global workspace registries (`~/.know-me/`).
* **Project Context Tracking:** Automatically binds active repository context, git remote, and project metadata.

### 5.2 Task & Kanban Management (`knowme task`)
* **Lifecycle States:** `todo` → `in-progress` → `done` (plus `blocked` and `archived`).
* **Attributes:** Unique task ID, title, priority (`low`, `medium`, `high`, `urgent`), assignees, acceptance criteria, subtasks, related `@doc` links, and notes.
* **Kanban Board:** Interactive visual board in Web UI and terminal board view (`knowme task board`).

### 5.3 Documentation & Architecture Memory (`knowme doc`)
* **Structured Markdown:** Durable knowledge files categorized by category (e.g., `specs/`, `architecture/`, `guides/`, `decisions/`).
* **WYSIWYG Markdown Editor:** Embedded Milkdown Crepe editor in Web UI with live preview and table/code formatting.
* **Cross-Reference Linking:** Automatically resolves `@task/<id>` and `@doc/<path>` tokens with bi-directional backlink tracking.

### 5.4 Personal Workspace: Memos & Links
* **Global Quick Memos (`knowme memo`):** Fast scratchpad captures with hashtag categorization, full text search, and project linking.
* **Saved Reading Links (`knowme link`):**
  - Complete CRUD lifecycle (`add`, `list`, `update`, `delete`).
  - Auto-tagging, domain extraction, thumbnail caching, and reader view.
  - Keyword and semantic vector search across saved articles.

### 5.5 Context Retrieval & Search (`knowme search`, `knowme retrieve`)
* **Hybrid Search Engine:** Combines BM25 keyword matching with local vector embeddings (`multilingual-e5-small` via ONNX Runtime).
* **Context Retrieval (`retrieve`):** Accepts a query or task ID and returns ranked, token-budgeted markdown context snippets ready for LLM prompt injection.

### 5.6 Background Agent Orchestrator (OMP Integration)
* **Agent Client Protocol (ACP):** Manages local child processes over stdin/stdout JSON-RPC.
* **Git Worktree Isolation:** Spawns agents into dedicated worktrees under `~/.know-me/worktrees/<project>/<task>`.
* **Review & Phase Gates:** Supports structured Plan → Implement → Review milestones with live diff streaming and terminal status reporting.

### 5.7 Model Context Protocol (MCP) Server
* Stdio-based JSON-RPC server implementing Model Context Protocol (`mcp-go`).
* Exposes tools for autonomous agents:
  - `knowme_task`: Create, update, view, list, and transition tasks.
  - `knowme_doc`: Read, search, and update documentation.
  - `knowme_retrieve`: Retrieve ranked project memory for active work.
  - `knowme_memo`: Query and create memos.
  - `knowme_link`: Manage links with full CRUD support.

### 5.8 Web UI
* Single Page Application built with React 19, TanStack Router, TanStack Table, and Tailwind CSS.
* Embedded directly into the Go binary using `embed.FS`.
* Real-time updates powered by Server-Sent Events (SSE) and WebSocket channels.

---

## 6. Technical Architecture

```
┌────────────────────────────────────────────────────────────────────────┐
│                             Interfaces                                 │
│  CLI (Cobra)       Web UI (React 19)       MCP Server (Stdio JSON-RPC) │
└────────┬───────────────────┬───────────────────────────┬───────────────┘
         │                   │                           │
         ▼                   ▼                           ▼
┌────────────────────────────────────────────────────────────────────────┐
│                         Domain Services Layer                          │
│  - TaskService      - DocService       - SearchService (Hybrid)        │
│  - MemoService      - LinkService      - OMP Agent Orchestrator        │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                         Storage & Index Layer                          │
│  - Local Markdown (.know-me/tasks, .know-me/docs)                      │
│  - JSON Stores (~/.know-me/memos.json, links/, chats.json)             │
│  - SQLite Vector Store (sqlite_vecstore + ONNX Runtime)                │
│  - Git Worktree Pool (~/.know-me/worktrees/)                           │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 7. Non-Functional Requirements (NFR)

* **Portability & Zero External Deps:** Compiled standalone binary for macOS (Apple Silicon & Intel), Linux (x86_64 & arm64), and Windows.
* **CLI Performance:** Command execution time $\le 50\text{ms}$ for non-embedding queries; search response $\le 300\text{ms}$ on 10,000 document units.
* **Security & Data Privacy:** Complete offline operation. Zero data transmitted to external servers unless the user explicitly configures an external LLM endpoint.
* **Reliability:** Atomic file writes with automatic lock management to prevent write corruption across simultaneous CLI and agent operations.

---

## 8. Success Metrics & KPIs

* **Agent Prompt Efficiency:** $> 40\%$ reduction in token consumption required to prime coding agents per task.
* **Zero-Hallucination Rate:** High fidelity retrieval where agents reference exact `@doc` and `@task` identifiers.
* **Daily Active Workflow:** Frequency of task transitions and memo/link captures per active user.
* **Binary Footprint:** Lean binary distribution maintaining rapid install times via `curl | sh` or `npm install -g @hoangtrung1801/knowme`.

---

## 9. Product Roadmap

1. **Phase 1 (Stabilization & Parity - Current):** Complete symmetric CRUD across all entities (link deletion), purge legacy descoped residues, align skill prompts.
2. **Phase 2 (Cloudflare Hybrid Sync - Optional):** Optional opt-in sync to Cloudflare D1/R2 for multi-device sync without abandoning local-first file primacy.
3. **Phase 3 (Multi-Agent Swarm Memory):** Coordinate concurrent agents sharing read-locks on task boards and auto-resolving cross-agent worktree rebases.
