# Codex foundation delivery

Date: 14 October 2026. Owner: the user's current Codex session.

## Delivered

Swift 6 strict-mode package with KnowMeCore library and KnowMeApp native macOS executable. Connection/login, sidebar/content/inspector layout, project listing/selection, standard Settings scene, native menus and file/folder panels. Actor-isolated HTTP transport, typed workspace/status/auth contracts, JSONValue escape hatch, authenticated multipart/download/WebSocket, cancellable byte-framed SSE with reconnect, workspace revisions/stale-response rejection, scoped draft storage and app-owned helper supervisor. Local development app packaging is repeatable through `scripts/package-app.sh`.

Shared feature integration contract is in `native/CONTRACT.md`. `native/Parity.json` starts with 48 action groups requiring detailed feature audits; none is misrepresented as verified domain parity.

## Verification

- `swift build --package-path native`: passed, Xcode 16.2 / Swift 6.0.3, arm64, macOS 14 minimum.
- `KNOWME_TEST_URL=<disposable-fixture-origin> swift test --package-path native`: 16 Swift Testing tests passed. Covers encoded identifiers/query/body, malformed origins/paths, 204/non-JSON/HTTP errors, lifecycle denial details, production workspace/status shapes, SSE line/byte/CRLF/BOM/Unicode/multiline framing, stale revisions, multipart injection rejection, draft isolation, helper reported-port ownership/startup failure, and actual Go route integration.
- Integration fixture uses production Go route handlers and temporary storage/registry, cookie authentication and production SSE broker. A dedicated WebSocket fixture verifies cookie sharing and upgrade; production OMP streaming is not claimed verified.
- `bash native/scripts/package-app.sh`: passed, plist lint and local ad-hoc signature; artifact at `native/dist/KnowMe.app`.
- Packaged executable smoke with `KNOWME_SMOKE_TEST=1`: `KNOWME_SMOKE connected=true projects=1 login=false` against the protected fixture. Smoke mode uses a disposable preferences suite.
- Native app launched through Cua and connection controls observed in accessibility state; a connection-screen capture is in this directory. Cua reported inconsistent window/screenshot geometry, so the capture is not accepted as full visual-layout verification.
- Latest packaged app's protected-server login screen was also observed. Cua could not verify background password typing and requested foreground delivery; no foreground takeover was attempted. Automated packaged-app authentication smoke passed independently.

The live integration test caught URLSession line-stream behavior that prevented the handshake reaching the SSE parser. Raw byte framing fixed it, and the production broker handshake then passed. An early multipart header-injection test also caught Swift CRLF grapheme matching; Unicode-scalar validation fixed it.

## Scope findings and limitations

Project switch changes registry recency, not the manager store. Tasks/docs support explicit IDs/scope; config/chat/runtime scope must be audited by their owners. Removed endpoint contracts and `/ws/terminal` discrepancy are documented in README. The Go browser command disables OpenCode, so feature readiness must follow that reality.

Domain workflows remain unimplemented at foundation delivery. Helper lifecycle tests use controlled executable fixtures; the real CLI startup is source-audited but not end-to-end verified in this delivery. A helper that ignores SIGTERM is not forcibly killed. Distribution signing/notarization, universal binaries, launch-on-login, full Markdown extensions and interactive terminal parity are not part of this foundation. macOS 14 runtime compatibility is deployment-target compiled but not exercised on an actual macOS 14 machine.

## Delegation

Orca Run `run_863a87279341`, actual `/opt/homebrew/bin/omp` v18.10.0 terminals, using the user's default OMP model. Each dispatch has a disjoint feature directory and its own report; shared core, app shell, package and parity ledger stay with Codex.

| Domain | Task | Dispatch |
| --- | --- | --- |
| Work | task_cbf8ba4943fb | ctx_428ef362e90e |
| Knowledge | task_2a61dbb8c6bd | ctx_227cacf57514 |
| Agents | task_cc8c6bad2f45 | ctx_85aa31f80f09 |
| Operations | task_2f61445b8a83 | ctx_38f8b74cd396 |

The initial receipts report `ready/input_accepted`; provider turn-start observation is unsupported for custom OMP terminals. Completion requires worker reports and source verification, not the launch receipt alone.
