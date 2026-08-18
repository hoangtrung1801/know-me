# Release Binaries Only Design

## Goal

Make `.github/workflows/publish.yml` create and attach verified platform CLI archives to a GitHub Release without publishing to npm, updating Homebrew, or sending Discord notifications.

## Scope

- Keep release/manual version resolution, UI verification, Go tests, native platform builds, ONNX library packaging, tarball checksums, and GitHub Release uploads.
- Rename the workflow to reflect artifact-only release behavior.
- Remove npm package preparation and publishing, Homebrew tap updates, changelog retrieval, and Discord notification steps.

## Outcome

A published GitHub Release contains the five platform archives and their SHA-256 files. No external registry, tap repository, or webhook is contacted.

## Validation

Parse the workflow YAML and assert it contains the GitHub Release upload command but no `npm publish`, Homebrew tap URL, or Discord webhook reference.
