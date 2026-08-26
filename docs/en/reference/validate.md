# Validate

`knownme validate` checks the consistency of the current project context.

## What it is for

Use validation to catch issues such as:

- broken references
- incomplete task/spec relationships
- drift between expected structure and actual stored data

## Common commands

```bash
knownme validate --plain
knownme validate --scope docs --plain
knownme validate --scope sdd --plain
knownme validate --strict --plain
```

## When to run it

- before finishing a task
- after restructuring docs
- after changing references or generated files
- before asking AI to rely heavily on the stored project context
