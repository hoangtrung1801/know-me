export type DemoStatus = "todo" | "in-progress";

export type WorkflowId = "capture" | "task" | "retrieve";

export type Perspective = "human" | "agent";

export interface DemoTask {
  id: string;
  title: string;
  status: DemoStatus;
  priority: "low" | "medium" | "high";
  criteria: Array<{
    id: number;
    text: string;
    completed: boolean;
  }>;
}

export interface DemoMemo {
  id: string;
  content: string;
  createdAt: string;
  scope: "global";
}

export interface DemoDocument {
  id: string;
  title: string;
  path: string;
  reference: string;
  snippet: string;
}

export interface TranscriptEntry {
  id: number;
  command: string;
  summary: string;
  status: "success" | "info" | "error";
  timestamp: string;
}

export interface CandidateResult {
  id: string;
  type: "task" | "doc";
  title: string;
  path?: string;
  snippet: string;
  score: number;
}

export interface SampleRetrievalProjection {
  query: string;
  mode: "keyword";
  candidates: CandidateResult[];
  contextPack: {
    mode: "keyword";
    items: Array<{
      citation: {
        type: "task" | "doc";
        id: string;
        path?: string;
      };
      directMatch: boolean;
      metadata: {
        status?: DemoStatus;
        title: string;
      };
      content: string;
    }>;
  };
}

export interface DemoState {
  projectName: string;
  task: DemoTask;
  document: DemoDocument;
  memos: DemoMemo[];
  selectedWorkflow: WorkflowId;
  workflowStep: number;
  activePerspective: Perspective;
  transcript: TranscriptEntry[];
  nextMemoId: number;
  nextTranscriptId: number;
  lastOutcomeMessage: string;
  errorMessage?: string;
}

export type DemoAction =
  | { type: "run"; command: string }
  | { type: "select-workflow"; workflow: WorkflowId }
  | { type: "set-perspective"; perspective: Perspective }
  | { type: "next-command" }
  | { type: "reset" };

export interface ParsedDemoCommand {
  kind:
    | "memo-add"
    | "task-edit-status"
    | "task-edit-check"
    | "task-edit-uncheck"
    | "search"
    | "retrieve";
  raw: string;
  memoContent?: string;
  taskId?: string;
  statusValue?: DemoStatus;
  acIndex?: number;
  query?: string;
}

export type ParseResult =
  | { success: true; command: ParsedDemoCommand }
  | { success: false; error: string; hint?: string };
