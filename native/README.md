# KnowMe for macOS

Native SwiftUI/AppKit implementation, macOS 14+, Swift 6.0 or newer. The four OMP feature domains are integrated into a working local preview. Full web parity is not yet verified. Screens connect to the existing Go backend; production records remain owned by KnowMe's backend.

## Build and run

```sh
swift build --package-path native
swift test --package-path native
bash native/scripts/package-app.sh
# Build and include the current Go helper for a self-contained backend launch option:
go build -o native/.build/knowme-helper ./cmd/knowme
bash native/scripts/package-app.sh native/.build/knowme-helper
```

Launch `native/dist/KnowMe.app` in Finder. The connection screen accepts an existing loopback HTTP server or an HTTPS origin, including password-protected servers. The default address is `http://127.0.0.1:6420`. `--server-url <origin>` and `KNOWME_SERVER_URL` override the saved address without persisting the override. Smoke mode uses a separate preferences suite and removes it when finished.

To bundle a compatible CLI helper:

```sh
bash native/scripts/package-app.sh /absolute/path/to/knowme
```

The helper is optional for an attached-server build. Select the helper and working directory in the connection screen to start it. The app reads the address actually reported after the CLI binds a free port; it does not adopt whichever server happens to use port 6420. Attached servers are never stopped. An app-owned helper receives SIGTERM at quit. A helper that ignores SIGTERM is not forcibly killed. No provider passwords are passed in process arguments. Packaging uses a local ad-hoc signature; distribution signing/notarization and universal binaries are not implemented.

The current Go browser command disables OpenCode. Feature work must expose that limitation accurately and propose any necessary minimal backend compatibility change; do not silently present an unavailable agent as ready.

## Integrated application

The shell opens Overview, Projects, task list/board with a contextual inspector, Documents, Saved Links, Memos, AI Chat, and Audit. Standard macOS Settings opens the Operations forms. Command-K opens search; task/doc results navigate to the selected record. Command-N opens the creation sheet for supported destinations. Task details open the OMP run/review interface.

Integration corrections include explicit document project scope and identity, dirty-draft preservation, metadata recovery, settings patches that preserve unmodeled fields, credential-safe settings draft recovery, sequence-based chat event processing, configured board columns/statuses, capability-gated permanent deletion, same-origin authenticated image loading, and clipboard image upload in the main document/memo editors.

The continuation adds TOC navigation, inline task/document references, task filters/grouping, native board ordering, stale-search rejection, and chat draft recovery. The Swift suite has 29 tests, including isolated production task status/order mutations.

See [reports/integration.md](reports/integration.md) for independent validation and remaining release-gate gaps. Worker reports document their deliveries; claims of complete parity in those reports are not release certification.

## Foundation

- Swift 6 library and native executable, native navigation/sidebar/inspector/Settings scene.
- HTTP JSON transport, typed workspace/status/auth DTOs, lifecycle error payload preservation, multipart and authenticated downloads.
- Shared ephemeral cookie session for HTTP/SSE/WebSocket. Passwords stay in memory; provider secrets are not copied.
- Cancellable SSE stream, framing parser, bounded event history, reconnect backoff and snapshot invalidation.
- Explicit selected-project revision, stale-result rejection and deliberate scoped query/body requests.
- Project selection/list refresh and native file/folder panels.
- Project/entity-scoped draft recovery storage for feature owners.
- Repeatable local `.app` packaging and production-route integration fixture.

Feature views are wired into the shell. See [CONTRACT.md](CONTRACT.md) and [Parity.json](Parity.json) for interfaces, ownership, and parity evidence.

## Safe integration verification

```sh
go run native/scripts/smoke-backend.go
# Copy the printed loopback URL into this second command:
KNOWME_TEST_URL=http://127.0.0.1:PORT swift test --package-path native
```

The fixture uses actual Go workspace/task/doc/auth/SSE handlers with temporary storage and registry. Its WebSocket echo handler is a protocol fixture, not the production OMP runner. It requires the known fixture password `fixture-password`. The test verifies unauthenticated rejection, cookie login, real route reads, SSE connection and cookie-authenticated WebSocket upgrade. It does not launch paid agents or mutate personal records. Stop the fixture with Ctrl-C; it removes its temporary data.

For a native launch/connection smoke check against that fixture:

```sh
KNOWME_SERVER_URL=http://127.0.0.1:PORT KNOWME_SMOKE_TEST=1 KNOWME_TEST_PASSWORD=fixture-password native/dist/KnowMe.app/Contents/MacOS/KnowMeApp
```

This prints a connection summary and exits. The ordinary test suite skips the integration test unless `KNOWME_TEST_URL` is supplied.

## Backend scope findings

`POST /api/workspaces/switch` updates registry recency, not the active manager store. Tasks and documents accept explicit `projectId`; scoped HTTP identifiers may also encode a project. Config/chat/runtime/timer endpoints need domain-specific audits. A universal assumption that changing the picker changes every backend route is incorrect. The foundation sends explicit scope only when requested and invalidates stale responses. Each feature must verify whether its endpoint supports that scope before implementing a mutation. All-project task/doc views are distinct from global-only links/memos.

Removed graph/memory/decision/import/LSP/embedding endpoints are excluded from current parity unless live routes are restored deliberately. The current server registers `/ws/chat` but not the `/ws/terminal` URL in a leftover web hook. A terminal log panel is not interactive terminal parity.
