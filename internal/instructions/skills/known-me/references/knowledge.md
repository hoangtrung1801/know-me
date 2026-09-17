# Knowledge, search, and templates

## Retrieve only relevant context

Start with `knowme search "<query>" --plain`. Use `knowme retrieve "<query>" --json` when the workflow needs ranked, structured context with citations. Read the relevant source before making a claim based on it.

No results do not prove no record exists. Try a narrower term or the relevant entity's list command. If semantic retrieval is unavailable and keyword results are returned, disclose that limitation; do not claim semantic coverage or initialize a project to suppress the error.

## Project documents

Use docs for durable specs, guides, and shared project knowledge. Establish [project scope](projects.md) first.

1. Search for an existing document; prefer updating it over creating a duplicate.
2. Inspect `knowme doc --help` and the relevant subcommand's help. Use `--toc`, `--section`, `--line`, or `--smart` as supported to read only the needed content.
3. Use `doc create` or `doc edit`, never direct edits to managed Markdown. Preserve unrelated sections and existing references.
4. Read back the changed sections and run `knowme validate --plain`.

Use `doc history` for disputed changes. Confirm the exact document before permanent deletion. Keep sources and uncertainty visible rather than presenting inferred facts as verified knowledge.

## Templates

Templates generate files; they are not scratch notes. Inspect `knowme template list` and `knowme template view <name>` using installed help before creating another template.

Before `template run`, check its help, required inputs, destination, and any supported preview. Review potential overwrites before generation. Use `template create` only when a reusable template is actually requested. After changes, inspect the generated result and run the relevant project verification as well as `knowme validate --plain` for template integrity.
