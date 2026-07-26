# Task Management

Tasks are the main unit of planned work in Knowns.

## What a task contains

A task may include:

- title
- description
- status
- priority
- labels
- assignee
- acceptance criteria
- implementation plan
- implementation notes

## Why tasks matter

Tasks give both humans and AI a concrete execution target.

Instead of saying “work on auth,” you can define:

- what should be built
- how success is checked
- what context is relevant
- what the current progress is

## Typical flow

```bash
knowns task create "Add authentication" \
  -d "JWT-based auth with login and register endpoints" \
  --ac "User can register" \
  --ac "User can login" \
  --priority high

knowns task edit <id> -s in-progress
knowns task edit <id> --plan $'1. Review auth pattern\n2. Implement endpoints\n3. Add tests'
knowns task edit <id> --check-ac 1
knowns task edit <id> --append-notes "Completed middleware"
knowns task edit <id> -s done
```

## Acceptance criteria

Acceptance criteria are especially valuable for AI-assisted work because they make “done” testable.

Good acceptance criteria are:

- concrete
- observable
- small enough to check individually

## References inside tasks

Tasks can reference docs and other entities, for example:

- `@doc/architecture/auth`
- `@task-abc123`

## Related

- [Commands](../reference/commands.md)
- [Reference System](../reference/reference-system.md)
- [Workflow](./workflow.md)
