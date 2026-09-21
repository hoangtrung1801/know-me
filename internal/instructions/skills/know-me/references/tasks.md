# Tasks

Use a task for bounded work with observable acceptance criteria, not as a substitute for a memo or saved link.

## Required project scope

Every new task should belong to a specific, identified project. First follow [Projects and setup](projects.md). The CLI defaults to the active project, but a default is not proof that it is the intended one.

- Use a verified active project from the intended working directory, or pass a known project ID explicitly.
- For explicit scoping, inspect `knowme task list --help`, then list that project's tasks with `knowme task list --project-id <project-id> --plain`.
- If the project cannot be determined from available context, ask before creating the task.
- Use `--global` only when the user explicitly requests an unscoped global task. Never use it to bypass missing project configuration or combine it with `--project-id`.

## Create and execute

1. List existing tasks and inspect relevant matches with `knowme task <id> --plain`; avoid duplicating existing work.
2. Create a concise outcome-oriented title and testable criteria. Keep implementation steps in the plan, not in acceptance criteria.
3. Inspect `knowme task create --help` and `knowme task edit --help` for available metadata and update flags.

Example: replace the project placeholder with a verified ID before executing.

```bash
knowme task create "Add login" --project-id <project-id> --ac "Valid credentials start a session" --ac "Invalid credentials do not start a session"
knowme task edit <id> -s in-progress
```

4. Record the plan before implementation. Update status, assignee, notes, and criteria through the CLI. Use existing project labels; do not invent a parallel taxonomy.
5. Verify the behavior before checking a criterion with `knowme task edit <id> --check-ac 1`. A checked box is a claim of evidence, not a plan.
6. Read back the task and run `knowme validate --plain`. Report unresolved criteria or blockers rather than marking incomplete work done.

Use `task history` help before resolving disputed changes. Inspect `time` and `board` help when time tracking or board views are requested. Archive completed/inactive work when requested; use `hard-delete` only after confirming the exact ID and that recovery is unnecessary.
