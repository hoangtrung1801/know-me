# Links and classification

Saved links are global URLs, not project docs. They do not require a project to be initialized.

## Capture workflow

1. Run `knowme link list --json`; compare URLs and inspect existing metadata before adding a duplicate. Preserve meaningful URL parameters; do not rewrite the destination speculatively.
2. Inspect `knowme link add --help` and `knowme link update --help`.
3. Save the URL with a short note describing why it matters and how it is classified.
4. Read back through `knowme link list --json` and verify the returned ID, URL, and note. Match by ID/URL, not by assuming the newest row is yours.

## Classify with reusable tags

Use the user's existing vocabulary first. Otherwise choose a small set of lowercase, hyphenated hashtags:

- **Topic:** what the resource is about, e.g. `#authentication`, `#golang`.
- **Type:** what kind of resource it is, e.g. `#official-docs`, `#tutorial`, `#tool`, `#article`.
- **Purpose, when useful:** why it was saved, e.g. `#reference`, `#to-read`.

Prefer one topic and one type, adding a purpose only when it helps. Reuse existing terms rather than creating synonyms, and classify only from available evidence. If the page cannot be inspected, keep classification broad and say so; do not invent its contents.

Use the `--tag` (`-t`) flag (repeatable or comma-separated) on `knowme link add` and `knowme link update` to assign structured tags directly:

```bash
knowme link add "https://go.dev/doc/" --tag golang --tag official-docs --note "Go documentation for implementation reference."
```

When updating classification, preserve the existing note's useful content: `--note` supplies the replacement note, not an append operation. Use `link update <id>` for supported title, description, note, or image changes. There is no link delete command in the current CLI; do not invent one or delete storage files as a workaround.
