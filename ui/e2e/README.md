# UI E2E Tests

Playwright end-to-end tests for the Knowns web UI.

## Run

```bash
make test-e2e-ui
```

Or from `ui/`:

```bash
bun test:e2e
bun test:e2e:ui
bun test:e2e:headed
```

## Notes

- Tests expect a built binary at `bin/knowns`
- `startServer()` creates an isolated temporary project for each spec file
- Specs target browser-history routes such as `/kanban`, `/tasks`, `/docs`, `/imports`, and `/config`

## Structure

```text
ui/e2e/
  *.spec.ts
  helpers.ts
  README.md
```
