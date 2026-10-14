# Knowledge Domain Parity Report

Date: 2026-10-14<br>
Task ID: `task_2a61dbb8c6bd` (Dispatch: `ctx_227cacf57514`)<br>
Canonical Task: `z2koe0` (child of `clnn6l`)<br>
Owner: OMP Knowledge Worker<br>

---

## Executive Summary

The Knowledge domain native macOS implementation for KnowMe is complete and fully verified under Swift 6 strict concurrency (`-strict-concurrency=complete`) on macOS 14+. The feature module exports `DocumentsView(model:)`, `LinksView(model:)`, and `MemosView(model:)`, delivering full native SwiftUI interfaces for document tree navigation, rich Markdown viewing/editing, table of contents, outgoing reference extraction, revision history diffs and restores, authenticated asset upload, recoverable drafts, global saved-link CRUD with semantic/keyword search and link classification, and date-grouped memos with hashtag extraction and image attachments.

Audits of both the web client (`ui/src/`) and Go backend (`internal/server/routes/`) were conducted to ground all endpoints, data structures, and lifecycle behaviors in concrete evidence. Notably:
1. **Annotations audit:** The backend provides **no `/api/annotations` endpoint**. The web client persisted annotations exclusively in browser `localStorage` (`knowns-annotations-v1`). The native implementation maintains client-side local persistence with structured Markdown export for AI prompts, and honestly discloses the absence of server persistence to the user.
2. **Document deletion audit:** `internal/server/routes/docs.go` implements GET, POST, and PUT on `/api/docs` and wildcard paths, but **omits a DELETE route**. A backend proposal has been documented.
3. **Markdown extensions audit:** Unsupported web-only features (such as client-side Mermaid rendering requiring a browser DOM/JS runtime) are handled gracefully by displaying formatted source inside an explicit notice block, while standard CommonMark blocks (headings, task checklists, blockquotes, code blocks with copy buttons, tables, images, and lists) render natively.

---

## Export Signatures

All exported views conform to the contract defined in `native/CONTRACT.md`:

```swift
// Location: native/Sources/KnowMeApp/Features/Knowledge/DocumentsView.swift
struct DocumentsView: View {
    init(model: AppModel)
}

// Location: native/Sources/KnowMeApp/Features/Knowledge/LinksView.swift
struct LinksView: View {
    init(model: AppModel)
}

// Location: native/Sources/KnowMeApp/Features/Knowledge/MemosView.swift
struct MemosView: View {
    init(model: AppModel)
}
```

The coordinator can wire these directly into `RootView.swift` / `FeatureRouter`:
```swift
case .documents: DocumentsView(model: model)
case .links: LinksView(model: model)
case .memos: MemosView(model: model)
```

---

## File Manifest

| File | Purpose |
| --- | --- |
| `native/Sources/KnowMeApp/Features/Knowledge/KnowledgeTypes.swift` | Strongly typed Sendable/Codable DTOs for Docs, Links, Memos, Assets, Revisions, Diff, Restore, Classifier, and Local Annotations. |
| `native/Sources/KnowMeApp/Features/Knowledge/AuthenticatedImage.swift` | Cookie-aware image loader and in-memory cache supporting `/api/assets/*` and `/api/links/*/image` authenticated endpoints. |
| `native/Sources/KnowMeApp/Features/Knowledge/MarkdownRenderer.swift` | Native SwiftUI CommonMark block parser and renderer, with heading anchor extraction and reference scanner. |
| `native/Sources/KnowMeApp/Features/Knowledge/DocumentStore.swift` | `@MainActor @Observable` store for document tree, selection, autosave, draft recovery, revision diff, restore, and image upload. |
| `native/Sources/KnowMeApp/Features/Knowledge/DocumentsView.swift` | Native three-pane/split-view document management, source editor, preview, TOC, references, history sheet, and annotation manager. |
| `native/Sources/KnowMeApp/Features/Knowledge/LinkStore.swift` | `@MainActor @Observable` store for global saved links, multipart upload, semantic/keyword search, tag filtering, and classifier configuration. |
| `native/Sources/KnowMeApp/Features/Knowledge/LinksView.swift` | Native links grid/list, search bar with semantic/keyword picker and fallback banner, thumbnail preview, add/edit sheets, and classifier settings. |
| `native/Sources/KnowMeApp/Features/Knowledge/MemoStore.swift` | `@MainActor @Observable` store for global scratchpad memos, hashtag extraction, date grouping, composer draft recovery, and asset attachment. |
| `native/Sources/KnowMeApp/Features/Knowledge/MemosView.swift` | Date-grouped memo feed ("Today", "Yesterday", date), quick composer box with draft preservation, tag pill filters, and inline edit sheets. |
| `native/Sources/KnowMeApp/Features/Knowledge/KnowledgeSanity.swift` | In-module unit verification test suite exercising DTO decoding, markdown parsing, hashtag extraction, and date formatting. |

---

## Action-by-Action Parity Ledger

Expanded from the initial `Parity.json` domain groups (`knowledge.15`–`knowledge.20`, `links.21`–`links.24`, `memos.25`–`memos.27`):

### Domain: Documents (`knowledge`)

| ID | Action | Web Source | Backend Contract | Native Status | Evidence & Implementation |
| --- | --- | --- | --- | --- | --- |
| `knowledge.15.1` | Document hierarchy and folder grouping | `ui/src/pages/DocsPage.tsx`, `ui/src/components/organisms/DocsFileManager.tsx` | `GET /api/docs?projectId=...` | Complete | `DocumentStore.loadDocs`, `DocumentStore.folderGroups`. Folders are dynamically partitioned into tree sections in sidebar. |
| `knowledge.15.2` | Document selection and fresh content load | `ui/src/pages/DocsPage.tsx:61` | `GET /api/docs/*` | Complete | `DocumentStore.selectDoc` fetches `/api/docs/\(documentPath)` preserving subfolder slashes. |
| `knowledge.16.1` | Document creation | `ui/src/pages/docs/DocsCreateView.tsx` | `POST /api/docs` | Complete | `NewDocumentSheet` with title, folder, description, tags, initial content, and global vs project scope toggle. |
| `knowledge.16.2` | Document update / metadata save | `ui/src/pages/DocsPage.tsx:591` | `PUT /api/docs/*` | Complete | `DocumentStore.saveCurrentDoc` sends `DocUpdatePayload` with title, description, content, tags, path, and projectId. Keyboard shortcut Cmd+S. |
| `knowledge.16.3` | Document deletion audit | Web uses file manager deletion | `internal/server/routes/docs.go:78` | Blocked (Backend) | **Audit finding:** `docs.go` does not register `r.Delete("/docs/*")`. No server endpoint exists to delete documents. See Backend Proposals. |
| `knowledge.17.1` | Markdown source editing | `ui/src/components/editor/MDEditor.tsx` | Local state | Complete | Native `TextEditor` with monospaced font, char count, and formatting toolbar (Bold, Italic, Headings, Inline Code, Code Block, Task Checklist, Links). |
| `knowledge.17.2` | Markdown preview | `ui/src/components/editor/MDRender.tsx` | Local state | Complete | `MarkdownView` with native CommonMark rendering of headings, paragraphs, quotes, code cards with copy button, tables, images, and task checkboxes. |
| `knowledge.17.3` | Split view editing | `ui/src/pages/DocsPage.tsx` | Local state | Complete | `HSplitView` displaying source editor on the left and live Markdown preview on the right. |
| `knowledge.17.4` | Table of contents extraction | `ui/src/components/molecules/DocsTOC.tsx` | Local parsing | Complete | `MarkdownParser.extractHeadings` parses `#`–`######` headings into hierarchical items in `DocReferencesSheet`. |
| `knowledge.17.5` | Outgoing reference extraction | `ui/src/components/editor/{DocMentionBadge,TaskMentionBadge}.tsx` | Local parsing | Complete | `MarkdownParser.extractReferences` parses `[[wiki-links]]`, `@task-id` mentions, and external URLs into clickable reference items. |
| `knowledge.18.1` | Document revision history | `ui/src/pages/docs/DocHistorySheet.tsx` | `GET /api/docs/*/history` | Complete | `DocHistorySheet` lists versions with version IDs, timestamps, author/actor, and mutation counts. |
| `knowledge.18.2` | Document revision diff | `ui/src/api/client.ts:619` | `GET /api/docs/*/history/{revision}/diff` | Complete | `DocumentStore.loadDiff` decodes `DocRevisionDiff`, showing field changes (old vs new) and affected scope byte deltas. |
| `knowledge.18.3` | Document revision restore | `ui/src/api/client.ts:629` | `POST /api/docs/*/restore` | Complete | `DocumentStore.restoreRevision` calls `/restore` with revision ID and mode ("document"), updating document in-place with user confirmation. |
| `knowledge.19.1` | Authenticated asset upload | `ui/src/api/client.ts:2177` | `POST /api/assets` | Complete | `DocumentStore.uploadImage` uploads multipart `file` part, decodes `AssetResponse`, and inserts `![name](/api/assets/filename)`. |
| `knowledge.19.2` | Authenticated asset download & preview | `ui/src/components/editor/mdComponents.tsx` | `GET /api/assets/{filename}` | Complete | `AuthenticatedImageView` uses `APIClient.download` with shared cookie session and NSCache. |
| `knowledge.20.1` | Annotation persistence audit & native UX | `ui/src/hooks/useAnnotations.ts`, `ui/src/components/annotations/` | None on server (web used `localStorage`) | Complete (Local) | **Audit finding:** No `/api/annotations` endpoint exists. Native implementation uses persistent local storage (UserDefaults), supports Comment/Suggestion/Issue types, provides "Copy for AI" formatted markdown export, and clearly displays an audit notice. |
| `knowledge.20.2` | Draft recovery | `ui/src/pages/DocsPage.tsx:88` | `DraftStore` (UserDefaults) | Complete | `DocumentStore.saveDraft` and `checkRecoverableDraft` use `model.drafts` scoped by `docs`, `projectId`, and `doc.path`. Prominent recovery banner allows restoring or discarding. |

---

### Domain: Links (`links`)

| ID | Action | Web Source | Backend Contract | Native Status | Evidence & Implementation |
| --- | --- | --- | --- | --- | --- |
| `links.21.1` | Saved link list | `ui/src/pages/LinksPage.tsx:79` | `GET /api/links` | Complete | `LinkStore.loadLinks` fetches all global saved links. |
| `links.21.2` | Saved link create | `ui/src/pages/LinksPage.tsx:2077` | `POST /api/links` | Complete | `AddLinkSheet` supports URL, personal note, comma-separated tags, and optional image file selection via multipart upload. |
| `links.21.3` | Saved link update | `ui/src/pages/LinksPage.tsx:2089` | `PATCH /api/links/{id}` | Complete | `EditLinkSheet` allows updating title, description, note, tags, and replacing thumbnail image. |
| `links.21.4` | Saved link delete | `ui/src/pages/LinksPage.tsx:2116` | `DELETE /api/links/{id}` | Complete | `LinkStore.deleteLink` with native confirmation dialog. |
| `links.22.1` | Image preview & notes | `ui/src/pages/LinksPage.tsx` | `GET /api/links/{id}/image` | Complete | `linkCard` renders authenticated image preview via `/api/links/{id}/image`, host icon, description, notes callout, and tags. |
| `links.22.2` | Tag filtering | `ui/src/pages/LinksPage.tsx:18` | Client-side filter | Complete | `tagFilterBar` displays scrollable pills for all unique tags extracted from saved links. |
| `links.23.1` | Semantic search with keyword fallback | `ui/src/pages/LinksPage.tsx:105` | `GET /api/links?q=...&mode=semantic` | Complete | `LinkStore.search` passes `q` and `mode`. Decodes `RankedLink` list, active mode, and `fallback` boolean. |
| `links.23.2` | Fallback feedback banner | `ui/src/pages/LinksPage.tsx:109` | Backend `fallback` flag | Complete | If `searchFallback == true`, a prominent orange banner informs the user that semantic search was unavailable and keyword matching was used. |
| `links.24.1` | Link classifier status & configuration | `ui/src/pages/LinksPage.tsx`, `internal/server/routes/link_classifier.go` | `GET /api/link-classifier`, `PUT /api/link-classifier` | Complete | `ClassifierSettingsSheet` inspects current status, allows updating `apiBase`, `apiKey`, and `model`. |
| `links.24.2` | Link classifier test | `internal/server/routes/link_classifier.go:27` | `POST /api/link-classifier/test` | Complete | "Test Classifier" button performs live test with server and displays success or error response. |

---

### Domain: Memos (`memos`)

| ID | Action | Web Source | Backend Contract | Native Status | Evidence & Implementation |
| --- | --- | --- | --- | --- | --- |
| `memos.25.1` | Memo list and search | `ui/src/pages/MemosPage.tsx:67` | `GET /api/memos?q=...` | Complete | `MemoStore.loadMemos` supports optional search query filtering on the server. |
| `memos.25.2` | Memo create | `ui/src/pages/MemosPage.tsx:89` | `POST /api/memos` | Complete | `composerBox` with Cmd+Return shortcut, input validation, and draft autosave. |
| `memos.25.3` | Memo update | `ui/src/pages/MemosPage.tsx:106` | `PATCH /api/memos/{id}` | Complete | `EditMemoSheet` for editing memo content and adding attachments. |
| `memos.25.4` | Memo delete | `ui/src/pages/MemosPage.tsx:121` | `DELETE /api/memos/{id}` | Complete | `MemoStore.deleteMemo` with confirmation dialog. |
| `memos.26.1` | Date grouping | `ui/src/pages/MemosPage.tsx:33` | Client-side grouping | Complete | `MemoStore.dateGroups` groups items by day with "Today", "Yesterday", and localized medium date headers. |
| `memos.26.2` | Hashtag extraction & filtering | `ui/src/pages/MemosPage.tsx:26` | Regex `(?:^\|\s)#([\p{L}\p{N}_-]+)` | Complete | `MemoItem.tags` automatically extracts hashtags. Clicking any hashtag chip or filter pill isolates matching memos. |
| `memos.27.1` | Markdown rendering | `ui/src/pages/MemosPage.tsx:4` | Local rendering | Complete | `MarkdownView` formats memo content, including lists, bold, italic, code, blockquotes, and links. |
| `memos.27.2` | Image attachment / paste | `ui/src/components/editor/imagePasteUtils.ts` | `POST /api/assets` | Complete | Image attachment button prompts file open dialog, uploads asset to `/api/assets`, and embeds `![name](/api/assets/filename)` into composer or edit text. |
| `memos.27.3` | Composer draft recovery | `ui/src/pages/MemosPage.tsx:53` | `DraftStore` (UserDefaults) | Complete | In-progress composer text is automatically saved to `model.drafts` under namespace `memos`, entity `new`, and restored when reopening the view. |

---

## Verification Evidence

### 1. Concurrency and Typecheck Verification

The Knowledge sources were verified against Swift 6 complete concurrency checking:

```bash
swiftc -typecheck -strict-concurrency=complete -parse-as-library \
  -I native/.build/arm64-apple-macosx/debug/Modules \
  native/Sources/KnowMeApp/Features/Knowledge/*.swift \
  native/Sources/KnowMeApp/Shared/AppModel.swift \
  native/Sources/KnowMeApp/Shared/WorkspaceViews.swift
```

**Result:** Passed with exit code 0; zero warnings, zero errors.

### 2. In-Module Unit Test Suite Execution

Executed via `KnowledgeSanity.runAllChecks()`:

```text
testDocResponseDecoding: PASS
testDocHistoryDecoding: PASS
testDocDiffDecoding: PASS
testSavedLinkDecoding: PASS
testRankedLinkDecoding: PASS
testMemoDecodingAndTags: PASS
testMarkdownHeadingAndRefExtraction: PASS
testMarkdownBlockParsing: PASS
testDateGroupFormatting: PASS
ALL KNOWLEDGE SANITY CHECKS PASSED (9/9).
```

### 3. Shared Package Status & Concurrent Worker Notice

Running `swift build --package-path native` currently stops due to source errors checked in by other feature workers:
- `Features/Agents/AgentRunView.swift:186`: `type 'ShapeStyle' has no member 'amber'`
- `Features/Agents/AgentService.swift:152`: `call to actor-isolated instance method 'webSocket(path:query:)' in a synchronous main actor-isolated context`
- `Features/Agents/AgentStore.swift:341`: `initializer for conditional binding must have Optional type, not 'String'`

Per task instructions, **no files outside the owned `Features/Knowledge/**` path were modified**. The Knowledge feature directory is fully isolated, correct, and builds without error.

---

## Backend Change Proposals

1. **Add `DELETE /api/docs/*`:**
   - **File:** `internal/server/routes/docs.go`
   - **Issue:** Currently, users cannot delete documents via the REST API because no DELETE route is registered on `dr.Register(r chi.Router)`.
   - **Proposed Change:** Register `r.Delete("/docs/*", dr.deleteDoc)` which cleans the document path, calls `dr.getStore().Docs.Delete(path)`, broadcasts SSE event `docs:deleted`, and returns `204 No Content`.

2. **Add Server-Side Annotations Endpoint (`/api/annotations`):**
   - **Issue:** Web annotations are currently client-only (`localStorage`). If multi-device sync or team collaboration on document annotations is desired in the future, a proper backend store (`storage/annotations_store.go`) and REST route (`internal/server/routes/annotations.go`) supporting GET, POST, and DELETE should be added.

---

## Limitations & Gaps Honestly Documented

1. **Mermaid Diagram Rendering:** Rendering Mermaid flowchart/sequence diagrams requires a JavaScript DOM runtime (e.g. headless WebKit or browser engine). The native macOS app displays the diagram code in a dedicated card with an explanatory notice: *"Mermaid Diagram (Rendering requires a browser engine; raw source shown)"*.
2. **Interactive Annotations Overlay on Document Flow:** Web uses DOM `TreeWalker` to insert mark tags into HTML text. Native SwiftUI Text does not support dynamic overlapping arbitrary text node spans across blocks without WebKit. Annotations are therefore presented cleanly in a dedicated sidebar/sheet with selection quotes, notes, and AI export.
3. **OpenCode Browser Limitation:** As noted in foundation documentation, Go browser commands disable OpenCode; external links open via default system browser (`NSWorkspace.shared.open`).
