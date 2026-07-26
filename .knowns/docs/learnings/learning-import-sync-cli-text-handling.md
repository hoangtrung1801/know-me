---
title: 'Learning: Import Sync + CLI Text Handling'
description: Learnings from import sync caching and CLI text escape fixes
createdAt: '2026-04-02T08:18:27.549Z'
updatedAt: '2026-04-02T08:18:27.549Z'
tags:
  - learning
  - cli
  - import
  - sync
---

# Learning: Import Sync + CLI Text Handling

## Patterns

### git ls-remote Cache Before Clone
- **What:** Before `git clone --depth 1`, run `git ls-remote <url> HEAD` to get the remote commit hash. Compare with cached hash in `_import.json`. Skip clone entirely if unchanged.
- **When to use:** Any git-based sync operation where the remote rarely changes (imports, templates, etc.)
- **Key detail:** `git ls-remote` is ~200-500ms vs clone which can be several seconds. Store `lastCommitHash` alongside `lastSync` in metadata.
- **Source:** @task-aq1efd

### CLI unescapeText for Shell Arguments
- **What:** Shell passes `"line1\nline2"` as literal `\` + `n` characters. Added `unescapeText()` helper that converts `\n` → newline, `\t` → tab for all text flags.
- **When to use:** Any CLI string flag that accepts multi-line content (`--notes`, `--plan`, `--content`, `--append`, `--description`).
- **Key detail:** Only `$'...\n...'` syntax in bash/zsh produces real newlines. Double-quoted `"...\n..."` does not. This is a common user expectation mismatch.

## Decisions

### Sentinel Error vs Boolean for "Up To Date"
- **Chose:** CLI uses `errUpToDate` sentinel error; server uses `(upToDate bool)` return value
- **Over:** Unified approach for both
- **Tag:** TRADEOFF
- **Outcome:** CLI needed sentinel because `cliGitSync` is called through closures where adding return values is awkward. Server already had multi-return so a bool was cleaner.
- **Recommendation:** Match the existing return style of the function rather than forcing consistency.

### RunWithSpinner + Sentinel Error Handling
- **Chose:** Catch `errUpToDate` inside the RunWithSpinner closure, return nil to spinner
- **Over:** Checking error after RunWithSpinner returns
- **Tag:** GOOD_CALL
- **Outcome:** RunWithSpinner prints any non-nil error as `✗ <label>: <error>`. Returning errUpToDate directly would show as a failure. Catching inside the closure and using a `isUpToDate` bool flag avoids the false failure display.
- **Recommendation:** When using RunWithSpinner, any "expected" non-error condition must be caught inside the closure. The spinner treats ALL errors as failures.

## Failures

None — both changes were straightforward with no backtracking.
