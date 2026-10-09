import type { DemoState, WorkflowId } from "../lib/demoTypes";

export const SAMPLE_COMMANDS = {
  captureMemo: 'knowme memo add "Idea: weekly review every Friday"',
  taskStatus: "knowme task edit demo-104 -s in-progress",
  taskCheckAc: "knowme task edit demo-104 --check-ac 1",
  taskUncheckAc: "knowme task edit demo-104 --uncheck-ac 1",
  search: 'knowme search "release" --plain',
  retrieve: 'knowme retrieve "release" --keyword --json',
} as const;

export interface WorkflowPreset {
  id: WorkflowId;
  label: string;
  description: string;
  steps: string[];
}

export const WORKFLOW_PRESETS: WorkflowPreset[] = [
  {
    id: "capture",
    label: "Capture",
    description: "Capture an idea into global developer memory (~/.know-me/)",
    steps: [SAMPLE_COMMANDS.captureMemo],
  },
  {
    id: "task",
    label: "Update a task",
    description: "Transition task state and check off verifiable acceptance criteria",
    steps: [SAMPLE_COMMANDS.taskStatus, SAMPLE_COMMANDS.taskCheckAc],
  },
  {
    id: "retrieve",
    label: "Retrieve context",
    description: "Hybrid keyword search and structured context pack generation for agents",
    steps: [SAMPLE_COMMANDS.search, SAMPLE_COMMANDS.retrieve],
  },
];

export function createInitialDemoState(): DemoState {
  return {
    projectName: "Release workspace",
    task: {
      id: "demo-104",
      title: "Prepare the release checklist",
      status: "todo",
      priority: "medium",
      criteria: [
        { id: 1, text: "Review installation steps", completed: false },
        { id: 2, text: "Check documentation links", completed: false },
      ],
    },
    document: {
      id: "release-plan",
      title: "Release plan",
      path: "docs/release-plan.md",
      reference: "@task/demo-104",
      snippet: "Coordinate release steps and verify checklist items for v1 launch.",
    },
    memos: [],
    selectedWorkflow: "task",
    workflowStep: 0,
    activePerspective: "human",
    transcript: [
      {
        id: 1,
        command: "knowme status",
        summary: "Workspace loaded: demo-104 (To Do, 0/2 criteria completed).",
        status: "info",
        timestamp: "00:00:01",
      },
    ],
    nextMemoId: 1,
    nextTranscriptId: 2,
    lastOutcomeMessage: "Interactive sample initialized. Select a workflow or run a command.",
  };
}
