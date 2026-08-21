export type AgentPhase =
	| "idle"
	| "investigating"
	| "plan-review"
	| "implementing"
	| "interrupted"
	| "code-review"
	| "fix-ready"
	| "completed";

export type AgentRunPhase = "investigation" | "implementation" | "fix" | "chat";
export type AgentRunStatus = "running" | "succeeded" | "failed" | "cancelled" | "interrupted";
export type ReviewStage = "plan" | "implementation";
export type AgentAction =
	| "start-investigation"
	| "approve-plan"
	| "request-plan-changes"
	| "approve-implementation"
	| "request-implementation-changes"
	| "start-fix"
	| "create-worktree"
	| "resume"
	| "cancel";

export interface AgentWorkflow {
	projectId: string;
	taskId: string;
	phase: AgentPhase;
	activeRunId?: string;
	codexSessionId?: string;
	chatSessionId?: string;
	worktreePath?: string;
	worktreeBranch?: string;
	resumePhase?: AgentRunPhase;
	updatedAt: string;
}

export interface AgentRun {
	id: string;
	projectId: string;
	taskId: string;
	phase: AgentRunPhase;
	status: AgentRunStatus;
	codexThreadId?: string;
	codexSessionId?: string;
	startedAt: string;
	finishedAt?: string;
	exitCode?: number;
	summary?: string;
	tests?: string[];
	error?: string;
	logPath?: string;
}

export interface ReviewComment {
	id: string;
	projectId: string;
	taskId: string;
	stage: ReviewStage;
	body: string;
	createdAt: string;
	runId?: string;
}

export interface AgentTaskSnapshot {
	workflow: AgentWorkflow;
	chatSessionId?: string;
	runs: AgentRun[];
	reviewComments: ReviewComment[];
	dirtyFiles: string[];
	adapterState: "running" | "stopped";
	resumable: boolean;
	interrupted: boolean;
}

export interface CodexStatus {
	installed: boolean;
	loggedIn: boolean;
	version?: string;
	error?: string;
	installCommand?: string;
	loginCommand: string;
	docsUrl: string;
}

export interface AgentEvent {
	type?: string;
	projectId: string;
	taskId: string;
	runId?: string;
	message?: string;
	taskChanged?: boolean;
}
