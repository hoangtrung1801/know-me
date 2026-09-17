# Memos

Memos are short global scratch notes. Use them for quick capture, ideas, and reminders that do not yet need a project's execution workflow.

1. Inspect `knowme memo list --help`, then search with `knowme memo list --search "<query>"`.
2. Capture with `knowme memo add "<content>"`. Preserve the user's meaning; do not add commitments, deadlines, or conclusions they did not supply.
3. To revise a known record, inspect its current content and use `knowme memo update <id> "<content>"`.
4. List again and verify the saved content and ID.

If an idea becomes actionable project work, follow [Tasks](tasks.md) to establish its project and acceptance criteria; do not silently create a global task. If promoting a memo to another record type, retain its context and do not delete the original unless requested.

Confirm the exact ID before `knowme memo delete <id>`. Do not store credentials or secrets in scratch notes.
