import { memo, useDeferredValue, useMemo, useState } from "react";
import {
	AlertCircle,
	Bot,
	CheckCircle2,
	ChevronRight,
	Edit3,
	FilePenLine,
	FileText,
	ListTodo,
	Loader2,
	Search,
	Sparkles,
	Terminal,
	Wrench,
} from "lucide-react";

import FlipNumbers from "react-flip-numbers";

import { cn } from "../../lib/utils";
import type { ChatMessage, SessionAgentItem } from "../../models/chat";
import knownsLogo from "../../public/logo.png";
import MDRender from "../editor/MDRender";
import { isTaskAgentToolCall, toTaskAgentItem } from "../organisms/ChatPage/helpers";
import { AnimatedCollapse } from "../ui/animatedCollapse";
import { DiffViewer } from "../ui/DiffViewer";
import { TaskSubAgentBlock } from "./TaskSubAgentBlock";
import { renderToolDetails } from "./toolRenderers";

interface ToolCallBlockProps {
	toolName: string;
	toolArgs?: Record<string, unknown>;
	result?: string;
	status?: "loading" | "success" | "error";
	title?: string;
	metadata?: Record<string, unknown>;
	isExpanded?: boolean;
	subtitle?: string;
	command?: string;
	messageId?: string;
	messageCreatedAt?: string;
	onOpenTaskAgent?: (agent: Extract<SessionAgentItem, { kind: "task" }>) => void;
}

interface ToolPresentation {
	icon: React.ReactNode;
	label: string;
	summary?: string;
	meta?: string[];
	tone: "neutral" | "info" | "success" | "warn";
	isKnowns?: boolean;
}

type ToolCallItem = NonNullable<ChatMessage["toolCalls"]>[number];

interface ToolCallListProps {
	toolCalls: ToolCallItem[];
	parentSessionId?: string;
	messageId?: string;
	messageCreatedAt?: string;
	onOpenTaskAgent?: (agent: Extract<SessionAgentItem, { kind: "task" }>) => void;
}

function KnownsIcon({ className }: { className?: string }) {
	return <img src={knownsLogo} alt="Knowns" className={cn("h-3.5 w-3.5 rounded-sm object-contain", className)} />;
}

function truncate(value: string, limit = 120): string {
	return value.length > limit ? `${value.slice(0, limit)}...` : value;
}

function stringifyInline(value: unknown): string | undefined {
	if (typeof value === "string") return value;
	if (typeof value === "number" || typeof value === "boolean") return String(value);
	return undefined;
}

function stringifyTodoSummary(raw: unknown): string | undefined {
	if (!Array.isArray(raw)) return undefined;
	const items = raw
		.map((item) => {
			if (typeof item === "string") return item;
			if (!item || typeof item !== "object") return "";
			const record = item as Record<string, unknown>;
			return (
				stringifyInline(record.content) ||
				stringifyInline(record.subject) ||
				stringifyInline(record.description) ||
				stringifyInline(record.title) ||
				""
			);
		})
		.filter(Boolean);
	if (items.length === 0) return undefined;
	return truncate(items.join(", "), 160);
}

function getQuestionToolDetails(
	toolArgs: Record<string, unknown> | undefined,
	metadata: Record<string, unknown> | undefined,
): { question?: string; answer?: string } {
	const questions = Array.isArray(toolArgs?.questions) ? toolArgs.questions : [];
	const firstQuestion = questions[0];
	if (!firstQuestion || typeof firstQuestion !== "object") {
		const answers = Array.isArray(metadata?.answers) ? metadata.answers : [];
		const firstAnswers = Array.isArray(answers[0]) ? answers[0].filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
		return { answer: firstAnswers.length > 0 ? firstAnswers.join(", ") : undefined };
	}
	const questionRecord = firstQuestion as Record<string, unknown>;
	const questionText = typeof questionRecord.question === "string" ? questionRecord.question.trim() : "";
	const answers = Array.isArray(metadata?.answers) ? metadata.answers : [];
	const firstAnswers = Array.isArray(answers[0]) ? answers[0].filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
	return {
		question: questionText || undefined,
		answer: firstAnswers.length > 0 ? firstAnswers.join(", ") : undefined,
	};
}

function toneClasses(tone: ToolPresentation["tone"]) {
	if (tone === "success") {
		return {
			row: "bg-emerald-500/[0.04]",
			icon: "text-emerald-600 dark:text-emerald-400",
			label: "text-foreground",
		};
	}
	if (tone === "info") {
		return {
			row: "bg-sky-500/[0.04]",
			icon: "text-sky-600 dark:text-sky-400",
			label: "text-foreground",
		};
	}
	if (tone === "warn") {
		return {
			row: "bg-amber-500/[0.05]",
			icon: "text-amber-600 dark:text-amber-400",
			label: "text-foreground",
		};
	}
	return {
		row: "bg-muted/25",
		icon: "text-muted-foreground",
		label: "text-foreground",
	};
}

function buildPresentation(
	toolName: string,
	toolArgs: Record<string, unknown> | undefined,
	metadata: Record<string, unknown> | undefined,
	subtitle?: string,
	command?: string,
): ToolPresentation {
	const name = toolName.toLowerCase();
	const args = toolArgs || {};
	const questionDetails = getQuestionToolDetails(toolArgs, metadata);
	const inlineCommand = command || stringifyInline(args.command);
	const filePath = stringifyInline(args.filePath) || stringifyInline(args.file_path) || stringifyInline(args.path);
	const query = stringifyInline(args.query) || stringifyInline(args.pattern);
	const prompt = stringifyInline(args.prompt) || stringifyInline(args.description);
	const todos = stringifyTodoSummary(args.todos || args.tasks);
	const isKnownsTool =
		name.startsWith("mcp__knowns__") ||
		name.startsWith("knowns_") ||
		(name === "bash" && inlineCommand?.trim().startsWith("knowns "));

	if (isKnownsTool) {
		const label = name.startsWith("mcp__knowns__")
			? toolName.replace("mcp__knowns__", "knowns:")
			: name.startsWith("knowns_")
				? toolName.replace("knowns_", "knowns:")
				: "knowns cli";
		return {
			icon: <KnownsIcon />,
			label,
			summary: subtitle || query || prompt || filePath || inlineCommand || undefined,
			meta: [],
			tone: "info",
			isKnowns: true,
		};
	}

	if (name === "read" || name === "read_file") {
		return {
			icon: <FileText className="h-3.5 w-3.5" />,
			label: "Read",
			summary: subtitle || (filePath ? truncate(filePath, 110) : undefined),
			meta: [
				stringifyInline(args.offset) ? `offset=${args.offset}` : "",
				stringifyInline(args.limit) ? `limit=${args.limit}` : "",
			].filter(Boolean),
			tone: "neutral",
		};
	}

	if (name === "grep" || name === "search") {
		return {
			icon: <Search className="h-3.5 w-3.5" />,
			label: name === "grep" ? "Grep" : "Search",
			summary: subtitle || query || prompt || filePath || undefined,
			meta: [filePath || "", stringifyInline(args.include) ? `include=${args.include}` : ""].filter(Boolean),
			tone: "neutral",
		};
	}

	if (name === "edit" || name === "replace") {
		return {
			icon: <Edit3 className="h-3.5 w-3.5" />,
			label: "Edit",
			summary:
				subtitle ||
				filePath ||
				(stringifyInline(args.instruction) ? truncate(String(args.instruction), 110) : undefined),
			meta: [],
			tone: "info",
		};
	}

	if (name === "write" || name === "patch" || name === "apply_patch") {
		return {
			icon: <FilePenLine className="h-3.5 w-3.5" />,
			label: name === "patch" || name === "apply_patch" ? "Patch" : "Write",
			summary: subtitle || filePath || undefined,
			meta: [],
			tone: "success",
		};
	}

	if (name === "bash" || name === "shell") {
		return {
			icon: <Terminal className="h-3.5 w-3.5" />,
			label: "Bash",
			summary: subtitle || inlineCommand || undefined,
			meta: [stringifyInline(args.workdir) || ""].filter(Boolean),
			tone: "info",
		};
	}

	if (name === "todowrite" || name === "write_todos" || name === "taskcreate") {
		const todoList = Array.isArray(args.todos) ? args.todos : Array.isArray(args.tasks) ? args.tasks : [];
		return {
			icon: <ListTodo className="h-3.5 w-3.5" />,
			label: name === "taskcreate" ? "TaskCreate" : "Todo",
			summary: subtitle || todos || undefined,
			meta: [todoList.length > 0 ? `${todoList.length} items` : ""].filter(Boolean),
			tone: "success",
		};
	}

	if (name === "question") {
		return {
			icon: <CheckCircle2 className="h-3.5 w-3.5" />,
			label: "Questions",
			summary: questionDetails.question || subtitle || prompt || undefined,
			meta: [],
			tone: "neutral",
		};
	}

	if (name === "agent" || name.startsWith("mcp__")) {
		return {
			icon: <Bot className="h-3.5 w-3.5" />,
			label: toolName,
			summary: subtitle || prompt || undefined,
			meta: [],
			tone: "info",
		};
	}

	return {
		icon: <Wrench className="h-3.5 w-3.5" />,
		label: toolName,
		summary:
			subtitle ||
			inlineCommand ||
			filePath ||
			query ||
			prompt ||
			(Object.values(args).map(stringifyInline).filter(Boolean)[0] ?? undefined),
		meta: [],
		tone: "neutral",
	};
}

function statusIcon(status?: "loading" | "success" | "error") {
	if (status === "loading") return <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-500" />;
	if (status === "success") return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />;
	if (status === "error") return <AlertCircle className="h-3.5 w-3.5 text-red-500" />;
	return null;
}

function normalizeKnownsToolName(name: string) {
	if (name.startsWith("mcp__knowns__")) return name.replace("mcp__knowns__", "");
	if (name.startsWith("knowns_")) return name.replace("knowns_", "");
	return name;
}

function isKnownsTool(name: string) {
	const normalized = name.toLowerCase();
	return normalized.startsWith("mcp__knowns__") || normalized.startsWith("knowns_");
}

function isExplorationTool(name: string) {
	const normalized = name.toLowerCase();
	return (
		normalized === "read" ||
		normalized === "read_file" ||
		normalized === "grep" ||
		normalized === "search" ||
		normalized === "glob" ||
		normalized === "list_directory"
	);
}

function isCodeEditTool(name: string) {
	const normalized = name.toLowerCase();
	return normalized === "edit" || normalized === "replace" || normalized === "write" || normalized === "patch" || normalized === "apply_patch";
}

function getKnownsIntent(tool: ToolCallItem) {
	const normalized = normalizeKnownsToolName(tool.name.toLowerCase());
	if (normalized.includes("validate")) {
		return {
			key: "knowns-validate",
			label: "Knowns validation",
			icon: <KnownsIcon />,
			tone: "success" as const,
		};
	}
	if (normalized.includes("time")) {
		return {
			key: "knowns-time",
			label: "Knowns time",
			icon: <KnownsIcon />,
			tone: "info" as const,
		};
	}
	if (normalized.includes("task") || normalized.includes("board")) {
		return {
			key: "knowns-task",
			label: "Knowns task ops",
			icon: <KnownsIcon />,
			tone: "info" as const,
		};
	}
	if (normalized.includes("template")) {
		return {
			key: "knowns-template",
			label: "Knowns templates",
			icon: <KnownsIcon />,
			tone: "info" as const,
		};
	}
	return {
		key: "knowns-research",
		label: "Knowns research",
		icon: <KnownsIcon />,
		tone: "info" as const,
	};
}

function summarizeTools(tools: ToolCallItem[]) {
	const labels = tools.map((tool) => buildPresentation(tool.name, tool.input, tool.metadata).label);
	const uniqueLabels = Array.from(new Set(labels));
	const actionSummary = uniqueLabels.join(", ");
	return `${tools.length} actions${actionSummary ? ` · ${actionSummary}` : ""}`;
}

function groupToolCalls(toolCalls: ToolCallItem[]) {
	const groups: Array<
		| { type: "single"; tool: ToolCallItem }
		| { type: "explored"; tools: ToolCallItem[] }
		| { type: "edited"; tools: ToolCallItem[] }
		| { type: "knowns"; tools: ToolCallItem[]; intent: ReturnType<typeof getKnownsIntent> }
	> = [];

	const allEditedToolIndexes = new Set<number>();
	const editedTools = toolCalls.filter((tool, index) => {
		if (!tool || !isCodeEditTool(tool.name)) return false;
		allEditedToolIndexes.add(index);
		return true;
	});
	const editedToolIndexes = editedTools.length > 1 ? allEditedToolIndexes : new Set<number>();

	if (editedTools.length > 1) {
		groups.push({ type: "edited", tools: editedTools });
	}

	let index = 0;
	while (index < toolCalls.length) {
		const current = toolCalls[index];
		if (!current) {
			index += 1;
			continue;
		}

		if (editedToolIndexes.has(index)) {
			index += 1;
			continue;
		}

		if (isCodeEditTool(current.name)) {
			const edited: ToolCallItem[] = [current];
			let nextIndex = index + 1;
			while (nextIndex < toolCalls.length) {
				const next = toolCalls[nextIndex];
				if (!next || !isCodeEditTool(next.name)) break;
				edited.push(next);
				nextIndex += 1;
			}
			if (edited.length > 1) {
				groups.push({ type: "edited", tools: edited });
			} else {
				groups.push({ type: "single", tool: current });
			}
			index = nextIndex;
			continue;
		}

		if (isKnownsTool(current.name)) {
			const intent = getKnownsIntent(current);
			const knownsTools: ToolCallItem[] = [current];
			let nextIndex = index + 1;
			while (nextIndex < toolCalls.length) {
				const next = toolCalls[nextIndex];
				if (!next || !isKnownsTool(next.name)) break;
				const nextIntent = getKnownsIntent(next);
				if (nextIntent.key !== intent.key) break;
				knownsTools.push(next);
				nextIndex += 1;
			}
			if (knownsTools.length > 1) {
				groups.push({ type: "knowns", tools: knownsTools, intent });
			} else {
				groups.push({ type: "single", tool: current });
			}
			index = nextIndex;
			continue;
		}

		if (!isExplorationTool(current.name)) {
			groups.push({ type: "single", tool: current });
			index += 1;
			continue;
		}

		const exploratory: ToolCallItem[] = [current];
		let nextIndex = index + 1;
		while (nextIndex < toolCalls.length) {
			const next = toolCalls[nextIndex];
			if (!next || !isExplorationTool(next.name)) break;
			exploratory.push(next);
			nextIndex += 1;
		}

		if (exploratory.length > 1) {
			groups.push({ type: "explored", tools: exploratory });
		} else {
			groups.push({ type: "single", tool: current });
		}
		index = nextIndex;
	}

	return groups;
}

function combinedStatus(tools: ToolCallItem[]): ToolCallItem["status"] {
	if (tools.some((tool) => tool.status === "loading")) return "loading";
	if (tools.some((tool) => tool.status === "error")) return "error";
	return "success";
}

// ---------------------------------------------------------------------------
// SkillCallBlock — Notion-style toggle
// ---------------------------------------------------------------------------
const SkillCallBlock = memo(function SkillCallBlock({
	toolArgs,
	result,
	status,
	isExpanded = false,
}: {
	toolArgs?: Record<string, unknown>;
	result?: string;
	status?: "loading" | "success" | "error";
	isExpanded?: boolean;
}) {
	const [expanded, setExpanded] = useState(isExpanded);
	const deferredResult = useDeferredValue(result);

	const skillName = useMemo(() => {
		const args = toolArgs || {};
		return ((args.name as string) || (args.skill as string) || (args.args as string) || "");
	}, [toolArgs]);

	const content = useMemo(() => {
		if (!deferredResult) return null;
		const m = deferredResult.match(/<skill_content[^>]*>([\s\S]*?)<\/skill_content>/);
		return m?.[1]?.trim() || deferredResult.trim() || null;
	}, [deferredResult]);

	return (
		<div className="my-0.5 text-[13px] leading-5">
			<button
				type="button"
				onClick={() => setExpanded((v) => !v)}
				className="flex w-full items-center gap-2 rounded-sm px-1.5 py-1 text-left transition-colors hover:bg-muted/35"
			>
				<ChevronRight
					className={cn(
						"h-3 w-3 shrink-0 text-muted-foreground/50 transition-transform duration-200",
						expanded && "rotate-90",
					)}
				/>
				<span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-indigo-100/80 px-1.5 py-0.5 dark:bg-indigo-900/50">
					<Sparkles className="h-2.5 w-2.5 text-indigo-500 dark:text-indigo-400" />
					<span className="text-[10px] font-semibold text-indigo-600 dark:text-indigo-300">skill</span>
				</span>
				<span className="min-w-0 flex-1 truncate text-[13px] text-foreground/85">
					{skillName || "unknown"}
				</span>
				<span className="ml-auto shrink-0">{statusIcon(status)}</span>
			</button>

			<AnimatedCollapse open={expanded}>
				<div className="ml-5 border-l-2 border-muted/70 pl-3.5 pb-2 pt-1">
					{content ? (
						<div className="max-h-[28rem] overflow-y-auto">
							<MDRender markdown={content} className="chat-markdown-compact" />
						</div>
					) : status === "loading" ? (
						<span className="flex items-center gap-1.5 text-[11px] text-muted-foreground/60">
							<Loader2 className="h-3 w-3 animate-spin" />
							Loading…
						</span>
					) : null}
				</div>
			</AnimatedCollapse>
		</div>
	);
});

const ToolCallGroupBlock = memo(function ToolCallGroupBlock({
	tools,
	title,
	icon,
	toneName,
}: {
	tools: ToolCallItem[];
	title: string;
	icon: React.ReactNode;
	toneName: ToolPresentation["tone"];
}) {
	const [expanded, setExpanded] = useState(false);
	const status = combinedStatus(tools);
	const tone = toneClasses(toneName);
	const count = tools.length;
	const actionSummary = useMemo(() => {
		const labels = tools.map((t) => buildPresentation(t.name, t.input, t.metadata).label);
		return Array.from(new Set(labels)).join(", ");
	}, [tools]);

	return (
		<div className="my-1 text-[13px] leading-5">
			<button
				type="button"
				onClick={() => setExpanded((value) => !value)}
				className="flex w-full items-start gap-2 rounded-md px-1.5 py-1 text-left transition-colors hover:bg-muted/35"
			>
				<span className="mt-1 shrink-0 text-muted-foreground/80">
					<ChevronRight className={cn("h-3 w-3 transition-transform duration-200", expanded && "rotate-90")} />
				</span>
				<span className={cn("mt-0.5 shrink-0 opacity-85", tone.icon)}>
					{icon}
				</span>
				<div className="min-w-0 flex-1 pt-px">
					<div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
						<span className={cn("text-[12px] font-medium", tone.label)}>{title}</span>
						<span className="flex min-w-0 flex-wrap items-center gap-x-0.5 gap-y-0.5 text-[12px] text-muted-foreground">
							<FlipNumbers height={11} width={7} color="currentColor" background="transparent" play perspective={200} numbers={String(count)} />
							{` action${count !== 1 ? "s" : ""}${actionSummary ? ` · ${actionSummary}` : ""}`}
						</span>
					</div>
				</div>
				<span className="mt-0.5 shrink-0">{statusIcon(status)}</span>
			</button>

			<AnimatedCollapse open={expanded} innerClassName="ml-5 mt-1 space-y-1 border-l border-border/60 pl-2 sm:ml-8 sm:pl-3">
				{tools.map((tool) => (
					<ToolCallBlock
						key={tool.id}
						toolName={tool.name}
						toolArgs={tool.input}
						result={tool.output}
						status={tool.status}
						title={tool.title}
						metadata={tool.metadata}
						isExpanded={false}
					/>
				))}
			</AnimatedCollapse>
		</div>
	);
});

export const ToolCallBlock = memo(function ToolCallBlock({
	toolName,
	toolArgs,
	result,
	status,
	title,
	metadata,
	isExpanded = false,
	subtitle,
	command,
	messageId,
	messageCreatedAt,
	onOpenTaskAgent,
}: ToolCallBlockProps) {
	const [expanded, setExpanded] = useState(isExpanded);
	const deferredToolArgs = useDeferredValue(toolArgs);
	const deferredResult = useDeferredValue(result);
	const questionDetails = useMemo(
		() => getQuestionToolDetails(deferredToolArgs, metadata),
		[deferredToolArgs, metadata],
	);
	const isQuestionTool = toolName.toLowerCase() === "question";
	const presentation = useMemo(
		() => buildPresentation(toolName, deferredToolArgs, metadata, subtitle || title, command),
		[toolName, deferredToolArgs, metadata, subtitle, title, command],
	);
	const isEditTool = /^(edit|replace|write|patch|apply_patch)$/i.test(toolName);
	const specializedDetails = useMemo(
		() => renderToolDetails({ toolName, toolArgs: deferredToolArgs, result: deferredResult, metadata, command, status }),
		[command, deferredResult, deferredToolArgs, metadata, status, toolName],
	);

	// Returns array of { path, old, next } — one per file changed
	const editFiles = useMemo(() => {
		if (!isEditTool) return [];
		const args = deferredToolArgs || {};
		// apply_patch: metadata.files[] has per-file before/after
		const files = Array.isArray(metadata?.files) ? (metadata.files as Record<string, unknown>[]) : [];
		if (files.length > 0) {
			return files.map((f) => ({
				path: typeof f.relativePath === "string" ? f.relativePath : typeof f.filePath === "string" ? f.filePath : undefined,
				old: typeof f.before === "string" ? f.before : undefined,
				next: typeof f.after === "string" ? f.after : undefined,
			})).filter((f) => f.old || f.next);
		}
		// edit: metadata.filediff.before/after
		const filediff = metadata?.filediff as Record<string, unknown> | undefined;
		const old =
			typeof filediff?.before === "string" ? filediff.before :
			typeof args.oldString === "string" ? args.oldString :
			typeof args.old_string === "string" ? args.old_string : undefined;
		const next =
			typeof filediff?.after === "string" ? filediff.after :
			typeof args.newString === "string" ? args.newString :
			typeof args.new_string === "string" ? args.new_string :
			typeof args.content === "string" ? args.content : undefined;
		if (!old && !next) return [];
		return [{ path: undefined, old, next }];
	}, [isEditTool, deferredToolArgs, metadata]);

	const hasDetails = Boolean(
		specializedDetails ||
		(isEditTool && editFiles.length > 0) ||
		(!isQuestionTool && (questionDetails.question || questionDetails.answer)) ||
		command ||
		deferredResult ||
		(deferredToolArgs && Object.keys(deferredToolArgs).length > 0),
	);
	const tone = toneClasses(presentation.tone);

	// Delegate skill calls to the Notion-style toggle
	if (toolName.toLowerCase() === "skill") {
		return (
			<SkillCallBlock
				toolArgs={deferredToolArgs}
				result={deferredResult}
				status={status}
				isExpanded={expanded}
			/>
		);
	}

	const taskAgent =
		onOpenTaskAgent &&
		messageId &&
		messageCreatedAt &&
		isTaskAgentToolCall({
			id: messageId,
			name: toolName,
			input: deferredToolArgs || {},
			output: deferredResult,
			status: status || "loading",
		})
			? toTaskAgentItem(
					{
						id: `${messageId}:${toolName}`,
						name: toolName,
						input: deferredToolArgs || {},
						output: deferredResult,
						status: status || "loading",
					},
					{ id: messageId, createdAt: messageCreatedAt },
				)
			: null;

	return (
		<div className="my-1 text-[13px] leading-5">
			<button
				type="button"
				onClick={() => {
					if (taskAgent && onOpenTaskAgent) {
						onOpenTaskAgent(taskAgent);
						return;
					}
					if (hasDetails) setExpanded((value) => !value);
				}}
				disabled={!hasDetails && !taskAgent}
				className={cn(
					"flex w-full items-start gap-2 rounded-md px-1.5 py-1 text-left transition-colors hover:bg-muted/35 disabled:cursor-default",
					taskAgent && "rounded-xl border border-border/60 bg-card/60 px-3 py-2.5 hover:bg-card/90",
				)}
			>
				<span className="mt-1 shrink-0 text-muted-foreground/80">
					{taskAgent ? (
						<ChevronRight className="h-3 w-3" />
					) : hasDetails ? (
						<ChevronRight className={cn("h-3 w-3 transition-transform duration-200", expanded && "rotate-90")} />
					) : (
						<span className="block h-3 w-3" />
					)}
				</span>
				<span className={cn("mt-0.5 shrink-0 opacity-85", tone.icon)}>{presentation.icon}</span>
				<div className="min-w-0 flex-1 pt-px">
					<div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
						<span className={cn("text-[12px] font-medium", tone.label, presentation.isKnowns && "text-sky-700 dark:text-sky-300")}>
							{presentation.label}
						</span>
						{presentation.summary && <span className="min-w-0 break-all text-[12px] text-muted-foreground sm:truncate sm:break-normal">{presentation.summary}</span>}
						{(presentation.meta?.length ?? 0) > 0 && (
							<span className="break-all text-[11px] text-muted-foreground/80 sm:truncate sm:break-normal">{presentation.meta?.join(" / ")}</span>
						)}
					</div>
				</div>
				<span className="mt-0.5 shrink-0">{statusIcon(status)}</span>
			</button>

			<AnimatedCollapse open={expanded && hasDetails && !taskAgent} innerClassName="ml-5 mt-1 space-y-2 border-l border-border/60 pl-2 text-xs sm:ml-8 sm:pl-3">
					{specializedDetails}
					{isEditTool && !specializedDetails && editFiles.map((f, i) => (
						<div key={i} className="space-y-0.5">
							{f.path && (
								<div className="truncate px-1 font-mono text-[10px] text-muted-foreground">{f.path}</div>
							)}
							<div className="max-h-80 overflow-y-auto rounded-md">
								<DiffViewer oldValue={f.old} newValue={f.next} />
							</div>
						</div>
					))}
					{command && !isQuestionTool && !specializedDetails && (
						<div className="rounded-md bg-muted/25 px-2.5 py-2">
							<div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Command</div>
							<pre className="whitespace-pre-wrap break-all font-mono text-xs text-foreground/90">{command}</pre>
						</div>
					)}

					{deferredToolArgs && Object.keys(deferredToolArgs).length > 0 && !command && !isQuestionTool && !specializedDetails && (
						<div className="rounded-md bg-muted/25 px-2.5 py-2">
							<div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Arguments</div>
							<pre className="whitespace-pre-wrap break-all font-mono text-xs text-foreground/80">{JSON.stringify(deferredToolArgs, null, 2)}</pre>
						</div>
					)}

					{deferredResult && !isQuestionTool && !specializedDetails && (
						<div className="rounded-md bg-muted/25 px-2.5 py-2">
							<div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Output</div>
							<pre className="max-h-80 overflow-y-auto whitespace-pre-wrap break-all font-mono text-xs text-foreground/90">{deferredResult}</pre>
						</div>
					)}

			</AnimatedCollapse>
		</div>
	);
});

export const ToolCallList = memo(function ToolCallList({ toolCalls, parentSessionId, messageCreatedAt }: ToolCallListProps) {
	const groups = useMemo(() => groupToolCalls(toolCalls), [toolCalls]);

	return (
		<>
			{groups.map((group, index) =>
				group.type === "explored" ? (
					<ToolCallGroupBlock
						key={`explored_${group.tools.map((tool) => tool.id).join("_") || index}`}
						tools={group.tools}
						title="Explored"
						icon={<Search className="h-3.5 w-3.5" />}
						toneName="neutral"
					/>
				) : group.type === "edited" ? (
					<ToolCallGroupBlock
						key={`edited_${group.tools.map((tool) => tool.id).join("_") || index}`}
						tools={group.tools}
						title="Edited code"
						icon={<FilePenLine className="h-3.5 w-3.5" />}
						toneName="success"
					/>
				) : group.type === "knowns" ? (
					<ToolCallGroupBlock
						key={`${group.intent.key}_${group.tools.map((tool) => tool.id).join("_") || index}`}
						tools={group.tools}
						title={group.intent.label}
						icon={group.intent.icon}
						toneName={group.intent.tone}
					/>
				) : (
					isTaskAgentToolCall(group.tool) ? (
						<TaskSubAgentBlock
							key={group.tool.id || index}
							tool={group.tool}
							parentSessionId={parentSessionId}
							messageCreatedAt={messageCreatedAt}
						/>
					) : (
						<ToolCallBlock
							key={group.tool.id || index}
							toolName={group.tool.name}
							toolArgs={group.tool.input}
							result={group.tool.output}
							status={group.tool.status}
							title={group.tool.title}
							metadata={group.tool.metadata}
							isExpanded={false}
						/>
					)
				),
			)}
		</>
	);
});

interface ToolCallRowProps {
	toolName: string;
	toolArgs?: Record<string, unknown>;
}

export const ToolCallRow = memo(function ToolCallRow({ toolName, toolArgs }: ToolCallRowProps) {
	const presentation = buildPresentation(toolName, toolArgs, undefined);
	const tone = toneClasses(presentation.tone);

	return (
		<div className={cn("flex items-center gap-2 rounded-md px-1.5 py-1 text-[11px]", tone.row)}>
			<span className={cn("shrink-0", tone.icon)}>{presentation.icon}</span>
			<span className="font-semibold text-foreground">{presentation.label}</span>
			{presentation.summary && <span className="truncate text-muted-foreground">{presentation.summary}</span>}
		</div>
	);
});
