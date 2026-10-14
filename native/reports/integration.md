# Native macOS integration report

Date: 14 October 2026. Owner: current Codex session.

## Delivered local preview

Integrated all four OMP deliveries into the macOS shell: Overview, Projects, Tasks list/board/details, Documents, Saved Links, Memos, AI Chat, Audit, and the native Settings scene. Search now routes task/document results with persistent selection and project scope. Task details present the task-specific OMP run/plan/diff/review interface. Contextual task detail no longer forces a 640 pt sheet layout into a 360 pt inspector. Creation commands work through the standard File menu.

The app is packaged at `native/dist/KnowMe.app`, including a Go helper built from the current repository. This is an arm64 local development build with an ad-hoc signature, not a notarized distribution release.

## Independent corrections after OMP settlement

- Duplicate-path documents now have project-qualified identity. Fetch/save/history/diff/restore use the document's actual project scope instead of the current picker alone.
- Document reload keeps dirty edits; rapid selection rejects older responses. Empty-content deletions and metadata edits can be recovered as scoped drafts. Local annotations are project-qualified.
- Settings raw JSON retains unmodeled fields. Form saves send only changed fields and retain unknown nested settings. Read-only capabilities are excluded from writes. Unsaved form/JSON edits survive reload, with an explicit discard action; valid JSON containing credentials is excluded from draft persistence.
- Chat events carry a local monotonic sequence, preventing replay of the entire recent event buffer on every update. Reconnect prompts an authoritative session refresh. OpenCode permission payload uses once/always/reject values.
- Task status choices and board columns load from configuration. Permanent deletion is disabled without the server capability. Task lists refresh from live events and reject obsolete list responses.
- Image cache keys include server identity; same-origin absolute assets use authenticated transport. Main document and memo editors accept clipboard images through native paste handling.

## Validation evidence

- Combined source builds under Swift 6 strict concurrency, macOS 14 deployment target.
- `KNOWME_TEST_URL=http://127.0.0.1:53439 swift test --package-path native`: all 22 tests passed, including the production Go route/authentication/SSE fixture and cookie-authenticated WebSocket protocol fixture.
- App-level regressions cover domain DTO/parser verification, preservation of unknown nested settings, credential detection, document scope/identity/empty draft recovery, and non-replay of chat history events.
- `go build -o native/.build/knowme-helper ./cmd/knowme`: passed.
- `bash native/scripts/package-app.sh native/.build/knowme-helper`: passed, with plist validation and local signing.
- Packaged executable smoke against the disposable protected fixture: `KNOWME_SMOKE connected=true projects=1 login=false`.
- Native connection/login accessibility controls were observed. Full integrated-screen visual QA remains unverified: existing native windows were older foundation instances, and the Cua driver returned inconsistent thumbnail/window geometry. No foreground takeover was performed.

The fixture URL above was temporary. Recreate it with `go run native/scripts/smoke-backend.go`; it prints a fresh origin. The fixture restricts routes to prevent arbitrary writes and access to personal global collections. Tests used no personal records or live paid agent runs.

## Release gate remains open

Worker completion and compilation do not prove full web workflow parity. `Parity.json` records implemented versus partial/blocked groups and references the domain reports. In particular:

- The native Markdown renderer shows Mermaid source rather than rendering diagrams; TOC scrolling is implemented below; complete semantic-reference behavior still needs further parity work.
- OpenCode is disabled by the current Go browser command. Full provider/OAuth/model management, pending permission UI and subagent parity are not independently verified and are not complete merely because service methods exist.
- `/ws/terminal` is not registered. Run logs are available; an interactive terminal is not implemented.
- Task grouping/filter coverage, detailed board ordering, cross-domain navigation for remaining search entity types, and all workflows against representative real data still require end-to-end evidence.
- OMP investigation/approval/implementation/cancellation screens are wired, but a complete paid-provider run was not executed during this validation.
- The Go backend does not register document deletion. No unsupported deletion action was added.
- Signing/notarization, universal binaries, an actual macOS 14 runtime test, and full supported-size/light/dark/VoiceOver visual QA remain outside the evidence above.

The codebase is a runnable integrated preview. The plan's full-parity release condition is not met and is not marked complete.

## OMP accounting

All four completion messages matched their expected Task/Dispatch IDs and were processed. Post-settlement release returned `retained / external_terminal / processAction:none` for each reused OMP terminal; Orca intentionally leaves those external terminals untouched. The completion delivery was acknowledged. The Run has no reclaimable worker terminals requiring a cleanup decision.

## Continuation: document navigation, task views, and chat recovery

- TOC entries scroll the native preview to stable block targets, including repeated heading titles. Code examples are excluded. Invalid heading-like text no longer stalls parsing.
- Native inline task/document links recognize web task notation, legacy task mentions, subtask IDs, document notation, wiki links, and stored doc paths. References in code examples are excluded. Document heading fragments route to the preview; line/range fragments and other semantic entity types remain open.
- Task views add project/status/priority/assignee/label/spec filters, ID/assignee search, list grouping, and deterministic sorting. A filter popover reduces toolbar width.
- Board cards support native drag/drop and Move Up/Down commands. Ordering includes hidden cards from the full loaded column, preserves project identities, applies status before order, checks partial responses, and reloads canonical state on failure.
- Task completion, board moves, timer actions, and OpenCode question replies report errors.
- Search rejects obsolete responses. Chat session selection rejects stale detail/queue/socket responses; failed sends retain the draft and restore the composer. New text typed during submission is retained.
- Production API validation exposed escaped task IDs reaching storage unchanged. Task routes now decode the escaped chi representation exactly once. A Go regression verifies duplicate IDs in two projects, scoped updates, and rejection of double decoding.

Validation: all 29 Swift tests passed with a fresh disposable backend, including production authentication, scoped task creation/status/reordering, SSE, and the WebSocket fixture. The Go route test suite passed and the Go helper was rebuilt. Fixture task writes are constrained to its temporary project; indexing runs inline in the fixture process.

This batch does not certify pointer-driven drag/drop, full screen visual QA, Mermaid, provider/OAuth/subagent workflows, or live paid-agent execution. The full parity release gate remains open.
