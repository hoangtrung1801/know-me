import type {
  DemoState,
  DemoAction,
  ParseResult,
  ParsedDemoCommand,
  SampleRetrievalProjection,
} from "./demoTypes";
import { SAMPLE_COMMANDS, createInitialDemoState } from "../data/demoFixtures";

export function parseDemoCommand(input: string): ParseResult {
  const trimmed = input.trim();
  if (!trimmed) {
    return {
      success: false,
      error: "Empty command",
      hint: "Try one of the sample workflow commands above.",
    };
  }

  // Reject shell pipe/chain operators
  if (/[;&|]/.test(trimmed)) {
    return {
      success: false,
      error: "Unsupported operator",
      hint: "Compound shell commands are not supported in this interactive demo.",
    };
  }

  // Match memo add: knowme memo add "content"
  const memoMatch = trimmed.match(/^knowme\s+memo\s+add\s+"([^"]+)"$/);
  if (memoMatch) {
    return {
      success: true,
      command: {
        kind: "memo-add",
        raw: trimmed,
        memoContent: memoMatch[1],
      },
    };
  }

  // Match task edit status: knowme task edit <id> -s <status>
  const statusMatch = trimmed.match(
    /^knowme\s+task\s+edit\s+([\w-]+)\s+-s\s+(todo|in-progress)$/
  );
  if (statusMatch) {
    return {
      success: true,
      command: {
        kind: "task-edit-status",
        raw: trimmed,
        taskId: statusMatch[1],
        statusValue: statusMatch[2] as "todo" | "in-progress",
      },
    };
  }

  // Match task check ac: knowme task edit <id> --check-ac <index>
  const checkAcMatch = trimmed.match(
    /^knowme\s+task\s+edit\s+([\w-]+)\s+--check-ac\s+(\d+)$/
  );
  if (checkAcMatch) {
    return {
      success: true,
      command: {
        kind: "task-edit-check",
        raw: trimmed,
        taskId: checkAcMatch[1],
        acIndex: parseInt(checkAcMatch[2], 10),
      },
    };
  }

  // Match task uncheck ac: knowme task edit <id> --uncheck-ac <index>
  const uncheckAcMatch = trimmed.match(
    /^knowme\s+task\s+edit\s+([\w-]+)\s+--uncheck-ac\s+(\d+)$/
  );
  if (uncheckAcMatch) {
    return {
      success: true,
      command: {
        kind: "task-edit-uncheck",
        raw: trimmed,
        taskId: uncheckAcMatch[1],
        acIndex: parseInt(uncheckAcMatch[2], 10),
      },
    };
  }

  // Match search: knowme search "<query>" --plain
  const searchMatch = trimmed.match(
    /^knowme\s+search\s+"([^"]+)"\s+--plain$/
  );
  if (searchMatch) {
    return {
      success: true,
      command: {
        kind: "search",
        raw: trimmed,
        query: searchMatch[1],
      },
    };
  }

  // Match retrieve: knowme retrieve "<query>" --keyword --json
  const retrieveMatch = trimmed.match(
    /^knowme\s+retrieve\s+"([^"]+)"\s+--keyword\s+--json$/
  );
  if (retrieveMatch) {
    return {
      success: true,
      command: {
        kind: "retrieve",
        raw: trimmed,
        query: retrieveMatch[1],
      },
    };
  }

  return {
    success: false,
    error: `Unknown command: '${trimmed}'`,
    hint: "Select a workflow above (Capture, Update a task, Retrieve context) to load valid commands.",
  };
}

export function buildSampleRetrieval(state: DemoState): SampleRetrievalProjection {
  return {
    query: "release",
    mode: "keyword",
    candidates: [
      {
        id: state.task.id,
        type: "task",
        title: state.task.title,
        snippet: `Task [${state.task.id}] in status ${state.task.status}. Criteria: ${state.task.criteria.filter((c) => c.completed).length}/${state.task.criteria.length} done.`,
        score: 0.94,
      },
      {
        id: state.document.id,
        type: "doc",
        title: state.document.title,
        path: state.document.path,
        snippet: state.document.snippet,
        score: 0.88,
      },
    ],
    contextPack: {
      mode: "keyword",
      items: [
        {
          citation: {
            type: "task",
            id: state.task.id,
          },
          directMatch: true,
          metadata: {
            title: state.task.title,
            status: state.task.status,
          },
          content: `# Task: ${state.task.title}\nStatus: ${state.task.status}\n\nAcceptance Criteria:\n${state.task.criteria
            .map((c) => `- [${c.completed ? "x" : " "}] ${c.text}`)
            .join("\n")}`,
        },
        {
          citation: {
            type: "doc",
            id: state.document.id,
            path: state.document.path,
          },
          directMatch: false,
          metadata: {
            title: state.document.title,
          },
          content: `# Document: ${state.document.title}\n${state.document.snippet}\nReference: ${state.document.reference}`,
        },
      ],
    },
  };
}

export function demoReducer(state: DemoState, action: DemoAction): DemoState {
  switch (action.type) {
    case "select-workflow": {
      return {
        ...state,
        selectedWorkflow: action.workflow,
        workflowStep: 0,
        errorMessage: undefined,
      };
    }

    case "set-perspective": {
      return {
        ...state,
        activePerspective: action.perspective,
      };
    }

    case "next-command": {
      return {
        ...state,
        workflowStep: state.workflowStep + 1,
        errorMessage: undefined,
      };
    }

    case "reset": {
      const fresh = createInitialDemoState();
      return {
        ...fresh,
        activePerspective: state.activePerspective,
      };
    }

    case "run": {
      const parsed = parseDemoCommand(action.command);
      if (!parsed.success) {
        const entry = {
          id: state.nextTranscriptId,
          command: action.command,
          summary: `${parsed.error}. ${parsed.hint || ""}`,
          status: "error" as const,
          timestamp: new Date().toLocaleTimeString(),
        };
        const nextTranscript = [...state.transcript.slice(-19), entry];
        return {
          ...state,
          transcript: nextTranscript,
          nextTranscriptId: state.nextTranscriptId + 1,
          lastOutcomeMessage: parsed.error,
          errorMessage: parsed.error,
        };
      }

      const { command } = parsed;
      let nextTask = { ...state.task };
      let nextMemos = [...state.memos];
      let summaryText = "";

      switch (command.kind) {
        case "memo-add": {
          const content = command.memoContent || "New memo";
          const memo = {
            id: `memo-${state.nextMemoId}`,
            content,
            createdAt: new Date().toLocaleTimeString(),
            scope: "global" as const,
          };
          nextMemos = [...nextMemos, memo];
          summaryText = `Added global memo [${memo.id}]: "${content}"`;
          break;
        }

        case "task-edit-status": {
          const nextStatus = command.statusValue || "in-progress";
          nextTask = {
            ...nextTask,
            status: nextStatus,
          };
          summaryText = `Task [${nextTask.id}] status changed to '${nextStatus}'`;
          break;
        }

        case "task-edit-check": {
          const index = (command.acIndex || 1) - 1;
          const criteria = nextTask.criteria.map((c, i) =>
            i === index ? { ...c, completed: true } : c
          );
          nextTask = {
            ...nextTask,
            criteria,
          };
          const itemText = nextTask.criteria[index]?.text || `Criterion ${index + 1}`;
          summaryText = `Checked AC #${index + 1} on [${nextTask.id}]: "${itemText}"`;
          break;
        }

        case "task-edit-uncheck": {
          const index = (command.acIndex || 1) - 1;
          const criteria = nextTask.criteria.map((c, i) =>
            i === index ? { ...c, completed: false } : c
          );
          nextTask = {
            ...nextTask,
            criteria,
          };
          const itemText = nextTask.criteria[index]?.text || `Criterion ${index + 1}`;
          summaryText = `Unchecked AC #${index + 1} on [${nextTask.id}]: "${itemText}"`;
          break;
        }

        case "search": {
          summaryText = `Search "${command.query}": found 1 task ([${state.task.id}] - ${state.task.status}) and 1 document ([${state.document.id}]).`;
          break;
        }

        case "retrieve": {
          summaryText = `Context pack generated: 2 items cited (task [${state.task.id}] status ${state.task.status}, doc [${state.document.id}]). Ready for LLM ingestion.`;
          break;
        }
      }

      const entry = {
        id: state.nextTranscriptId,
        command: action.command,
        summary: summaryText,
        status: "success" as const,
        timestamp: new Date().toLocaleTimeString(),
      };

      const nextTranscript = [...state.transcript.slice(-19), entry];

      return {
        ...state,
        task: nextTask,
        memos: nextMemos,
        nextMemoId: command.kind === "memo-add" ? state.nextMemoId + 1 : state.nextMemoId,
        transcript: nextTranscript,
        nextTranscriptId: state.nextTranscriptId + 1,
        lastOutcomeMessage: summaryText,
        errorMessage: undefined,
      };
    }
  }
}
