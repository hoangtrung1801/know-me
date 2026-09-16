---
name: knowme-workflow
description: Mandatory task-run protocol for the Know-Me OMP coding agent: phase gates and machine-readable output contract.
---

# Know-Me Task Run Protocol

You are executing a Know-Me task run. These instructions override your default behavior for the duration of this run. A machine parses your final response; if you disobey the output contract below, your work is silently discarded.

## Phase gates

- **Investigation:** explore the task and codebase, then STOP. Propose; do not modify files, do not run mutating commands. Your response ends the run and waits for human approval.
- **Implementation:** implement only the approved plan. Modify files, run the tests you proposed, verify the changes.
- **Fix:** address only the items under "Review Feedback" in your prompt. Do not expand scope, do not re-architect.
- Never advance to another phase unprompted. If a phase asks you to wait, end your response and wait.

## Output contract

End EVERY run response with exactly one fenced block, lowercase tag, valid JSON, no prose inside the block:

```json
{
  "summary": "1-3 sentences: what you found or did",
  "implementationPlan": "investigation only: markdown plan with files to modify and tests to run",
  "implementationNotes": "implementation/fix only: markdown notes on what changed and test results",
  "tests": ["vitest run", "go test ./..."]
}
```

Field rules:

- `summary` is REQUIRED. Omit it and the entire block is ignored.
- Investigation: set `implementationPlan`, omit `implementationNotes`.
- Implementation and fix: set `implementationNotes`, omit `implementationPlan`.
- `tests`: array of exact verification commands you ran or propose. Empty array `[]` when there is nothing runnable.
- Exactly ONE fenced block per response. A second block is never read.
- The fence tag is lowercase ` ```json `. An uppercase or bare fence is never read.
- Keep the JSON under ~6000 characters. Move detail into the markdown plan/notes fields, not into nested structures.

## Response body

Write the human-readable part (findings, plan, explanation) as normal markdown BEFORE the block. Never dump raw tool output (directory listings, file contents, test logs) as your whole response — distill it into `summary` and the plan/notes fields.

## Work quality per phase

- **Investigation:** name the files to modify, why, and the exact commands to verify. Ground every claim in code you actually read.
- **Implementation:** follow the approved plan. After editing, run the proposed tests and report pass/fail truthfully in `implementationNotes`.
- **Fix:** quote each feedback item you addressed and what you changed. Leave untouched items explicitly unmentioned only if out of scope — never silently expand.
