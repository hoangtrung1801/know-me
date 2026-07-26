/**
 * LiveActivityFeed — Shared live activity feed with merge + markdown rendering
 * Used by TaskWorkspaceSection and WorkspacesPage
 *
 * Layout:
 * - Text events → merged into one Response markdown block
 * - Thinking events → merged into one Thinking markdown block
 * - Tool events → separate collapsible blocks (expand to show result)
 * - Error events → separate error blocks
 */

import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import {
	Bot,
	Terminal,
	FileText,
	Search,
	Brain,
	MessageSquare,
	AlertCircle,
	CheckCircle2,
	ChevronDown,
	ChevronRight,
	Loader2,
	Pencil,
} from "lucide-react";
import { useTerminalWebSocket } from "../../hooks/useTerminalWebsocket";
import { cn } from "@/ui/lib/utils";
import MDRender from "../editor/MDRender";
import type { ProxyEvent } from "@/ui/models/chat";

// ─── Parsed types ───────────────────────────────────────────────────

interface ToolInfo {
	icon: React.ReactNode;
	label: string;
	detail?: string;
}

/** Merged block for rendering */
type MergedBlock =
	| { kind: "text"; markdown: string }
	| { kind: "thinking"; markdown: string }
	| { kind: "tool"; info: ToolInfo; result?: string }
	| { kind: "error"; content: string }
	| { kind: "status"; label: string; detail?: string; variant: "success" | "info" | "warn" };

// ─── Tool parser ────────────────────────────────────────────────────

function parseToolUse(raw: string): ToolInfo {
	const colonIdx = raw.indexOf(":");
	const toolName = colonIdx > 0 ? raw.slice(0, colonIdx) : raw;
	const toolArg = colonIdx > 0 ? raw.slice(colonIdx + 1) : "";

	let icon: React.ReactNode = <Terminal className="w-3.5 h-3.5" />;
	let label = toolName;
	let detail: string | undefined;

	try {
		const args = JSON.parse(toolArg);

		if ((toolName === "Read" || toolName === "read_file") && args.file_path) {
			icon = <FileText className="w-3.5 h-3.5" />;
			label = "Read";
			detail = args.file_path.split("/").slice(-3).join("/");
		} else if (toolName === "Bash" && args.command) {
			icon = <Terminal className="w-3.5 h-3.5" />;
			label = "Bash";
			detail = args.command.slice(0, 120);
		} else if ((toolName === "Grep" || toolName === "grep") && args.pattern) {
			icon = <Search className="w-3.5 h-3.5" />;
			label = "Grep";
			detail = args.pattern.slice(0, 80);
		} else if ((toolName === "Glob" || toolName === "glob") && args.pattern) {
			icon = <Search className="w-3.5 h-3.5" />;
			label = "Glob";
			detail = args.pattern;
		} else if ((toolName === "Edit" || toolName === "replace") && args.file_path) {
			icon = <Pencil className="w-3.5 h-3.5" />;
			label = "Edit";
			const shortPath = args.file_path.split("/").slice(-3).join("/");
			const hint = args.new_string
				? args.new_string.slice(0, 60).split("\n")[0]
				: args.instruction
					? args.instruction.slice(0, 60)
					: "";
			detail = hint ? `${shortPath} — ${hint}` : shortPath;
		} else if (toolName === "Write" && args.file_path) {
			icon = <FileText className="w-3.5 h-3.5" />;
			label = "Write";
			detail = args.file_path.split("/").slice(-3).join("/");
		} else if (toolName === "Agent") {
			icon = <Bot className="w-3.5 h-3.5" />;
			label = "Agent";
			detail = args.description || args.prompt?.slice(0, 80);
		} else if (toolName === "WebSearch") {
			icon = <Search className="w-3.5 h-3.5" />;
			label = "Search";
			detail = args.query?.slice(0, 80);
		} else if (toolName === "WebFetch") {
			icon = <Search className="w-3.5 h-3.5" />;
			label = "Fetch";
			detail = args.url?.slice(0, 80);
		} else if (toolName === "TodoWrite" || toolName === "TaskCreate" || toolName === "write_todos") {
			icon = <CheckCircle2 className="w-3.5 h-3.5" />;
			label = toolName === "write_todos" ? "Todos" : toolName;
			const todos = args.todos || args.tasks;
			if (Array.isArray(todos)) {
				detail = todos
					.map((t: Record<string, string>) => t.content || t.subject || t.description || "")
					.filter(Boolean)
					.join(", ")
					.slice(0, 150);
			}
		} else if (toolName === "list_directory") {
			icon = <Search className="w-3.5 h-3.5" />;
			label = "List Dir";
			detail = args.path || args.directory_path || "";
		} else if (toolName.startsWith("mcp__knowns__")) {
			icon = <Bot className="w-3.5 h-3.5" />;
			label = toolName.replace("mcp__knowns__", "knowns:");
			detail = Object.values(args).filter(v => typeof v === "string").join(", ").slice(0, 80) || undefined;
		} else {
			detail = toolArg.slice(0, 100);
		}
	} catch {
		detail = toolArg.slice(0, 100);
	}

	return { icon, label, detail };
}

// ─── Merge logic ────────────────────────────────────────────────────

/**
 * Merge events into display blocks:
 * - Consecutive text → one text block
 * - Consecutive thinking → one thinking block
 * - tool_use + optional tool_result → one tool block
 * - error → separate error block
 */
function mergeEvents(events: ProxyEvent[]): MergedBlock[] {
	const blocks: MergedBlock[] = [];
	let textAccum = "";
	let thinkAccum = "";

	const flushText = () => {
		if (textAccum) {
			blocks.push({ kind: "text", markdown: textAccum });
			textAccum = "";
		}
	};
	const flushThink = () => {
		if (thinkAccum) {
			blocks.push({ kind: "thinking", markdown: thinkAccum });
			thinkAccum = "";
		}
	};
	const flushAll = () => {
		flushText();
		flushThink();
	};

	for (let i = 0; i < events.length; i++) {
		const ev = events[i];

		switch (ev.type) {
			case "text":
				if (!ev.text?.trim()) continue;
				flushThink();
				textAccum += ev.text;
				break;

			case "thinking":
				if (!ev.text?.trim()) continue;
				flushText();
				thinkAccum += ev.text;
				break;

			case "tool_use": {
				flushAll();
				const info = parseToolUse(ev.text || "");
				// Look ahead for tool_result
				let result: string | undefined;
				if (i + 1 < events.length && events[i + 1].type === "tool_result") {
					const next = events[i + 1];
					if (next.text?.trim()) {
						result = next.text.slice(0, 500);
					}
					i++; // skip the tool_result
				}
				blocks.push({ kind: "tool", info, result });
				break;
			}

			case "tool_result":
				// Standalone tool_result (not paired with tool_use) — skip if empty
				if (!ev.text?.trim()) continue;
				flushAll();
				blocks.push({
					kind: "tool",
					info: { icon: <Terminal className="w-3.5 h-3.5" />, label: "Result" },
					result: ev.text.slice(0, 500),
				});
				break;

			case "error":
			case "stderr":
				if (!ev.text?.trim()) continue;
				flushAll();
				blocks.push({ kind: "error", content: ev.text });
				break;

			case "result": {
				flushAll();
				// Parse stats if available
				let detail: string | undefined;
				try {
					const stats = JSON.parse(ev.text || "{}");
					const parts: string[] = [];
					if (stats.cost_usd) parts.push(`$${Number(stats.cost_usd).toFixed(4)}`);
					if (stats.duration_ms) parts.push(`${(Number(stats.duration_ms) / 1000).toFixed(1)}s`);
					if (stats.duration_api_ms) parts.push(`API ${(Number(stats.duration_api_ms) / 1000).toFixed(1)}s`);
					if (parts.length > 0) detail = parts.join(" · ");
				} catch {
					if (ev.text && ev.text !== "done") detail = ev.text.slice(0, 150);
				}
				blocks.push({ kind: "status", label: "Completed", detail, variant: "success" });
				break;
			}

			case "exit": {
				flushAll();
				const codeMatch = ev.text?.match(/code:(\d+)/);
				const code = codeMatch ? parseInt(codeMatch[1]) : null;
				if (code !== null && code !== 0) {
					blocks.push({ kind: "status", label: "Exited", detail: `code ${code}`, variant: "warn" });
				}
				// code 0 — skip (already shown by "result")
				break;
			}

			default:
				break;
		}
	}
	flushAll();

	return blocks;
}

// ─── Block components ───────────────────────────────────────────────

/** Collapsible tool block — header shows tool name + detail, expand shows result */
function ToolBlock({ info, result }: { info: ToolInfo; result?: string }) {
	const [open, setOpen] = useState(false);

	return (
		<div className="rounded border border-blue-500/20 overflow-hidden">
			<button
				type="button"
				className="flex items-center gap-1.5 w-full px-2 py-1 bg-blue-500/5 hover:bg-blue-500/10 transition-colors text-left cursor-pointer"
				onClick={() => result && setOpen(!open)}
			>
				{result ? (
					open ? <ChevronDown className="w-3 h-3 text-blue-400 shrink-0" /> : <ChevronRight className="w-3 h-3 text-blue-400 shrink-0" />
				) : (
					<span className="w-3 h-3 shrink-0">{info.icon}</span>
				)}
				<span className="text-[11px] font-semibold text-blue-400">{info.label}</span>
				{info.detail && (
					<span className="text-[11px] font-mono text-muted-foreground truncate">
						{info.detail}
					</span>
				)}
			</button>
			{open && result && (
				<div className="px-2 py-1.5 bg-muted/30 border-t border-blue-500/10">
					<pre className="text-[10px] leading-relaxed font-mono text-muted-foreground whitespace-pre-wrap break-all">
						{result}
					</pre>
				</div>
			)}
		</div>
	);
}

/** Markdown text block */
function MarkdownTextBlock({ markdown }: { markdown: string }) {
	return (
		<div className="rounded-md border border-border overflow-hidden">
			<div className="flex items-center gap-1.5 px-2.5 py-1 bg-muted/60 text-foreground">
				<MessageSquare className="w-3.5 h-3.5" />
				<span className="text-[11px] font-semibold">Response</span>
			</div>
			<div className="px-2.5 py-1.5 bg-background/80">
				<MDRender
					markdown={markdown}
					className="text-xs prose-xs prose-zinc dark:prose-invert max-w-none [&_p]:text-foreground [&_p]:text-xs [&_p]:leading-relaxed [&_li]:text-foreground [&_li]:text-xs [&_code]:text-[11px] [&_code]:bg-muted [&_pre]:text-[11px] [&_h1]:text-sm [&_h2]:text-xs [&_h3]:text-xs [&_strong]:text-foreground [&_blockquote]:text-muted-foreground [&_blockquote]:border-muted-foreground/30"
				/>
			</div>
		</div>
	);
}

/** Markdown thinking block (dimmed/italic) */
function MarkdownThinkingBlock({ markdown }: { markdown: string }) {
	return (
		<div className="rounded-md border border-border/50 overflow-hidden">
			<div className="flex items-center gap-1.5 px-2.5 py-1 bg-muted/40 text-muted-foreground">
				<Brain className="w-3.5 h-3.5" />
				<span className="text-[11px] font-semibold">Thinking</span>
			</div>
			<div className="px-2.5 py-1.5 bg-background/50">
				<MDRender
					markdown={markdown}
					className="text-xs prose-xs prose-zinc dark:prose-invert max-w-none italic opacity-80 [&_p]:text-muted-foreground [&_p]:text-xs [&_p]:leading-relaxed [&_li]:text-muted-foreground [&_li]:text-xs [&_code]:text-[11px] [&_pre]:text-[11px] [&_h1]:text-sm [&_h2]:text-xs [&_h3]:text-xs [&_strong]:text-foreground"
				/>
			</div>
		</div>
	);
}

/** Error block */
function ErrorBlock({ content }: { content: string }) {
	return (
		<div className="rounded border border-red-500/20 overflow-hidden">
			<div className="flex items-center gap-1.5 px-2 py-1 bg-red-500/5 text-red-400">
				<AlertCircle className="w-3.5 h-3.5 shrink-0" />
				<span className="text-[11px] font-mono truncate">{content}</span>
			</div>
		</div>
	);
}

/** Status block — completion, exit, etc. */
function StatusBlock({ label, detail, variant }: { label: string; detail?: string; variant: "success" | "info" | "warn" }) {
	const styles = {
		success: "border-emerald-500/20 bg-emerald-500/5 text-emerald-400",
		info: "border-blue-500/20 bg-blue-500/5 text-blue-400",
		warn: "border-amber-500/20 bg-amber-500/5 text-amber-400",
	};
	return (
		<div className={cn("rounded border overflow-hidden", styles[variant])}>
			<div className="flex items-center gap-1.5 px-2 py-1">
				{variant === "success" ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0" /> : <AlertCircle className="w-3.5 h-3.5 shrink-0" />}
				<span className="text-[11px] font-semibold">{label}</span>
				{detail && <span className="text-[11px] font-mono opacity-80">{detail}</span>}
			</div>
		</div>
	);
}

// ─── Main component ─────────────────────────────────────────────────

interface LiveActivityFeedProps {
	workspaceId: string;
	/** Max events to show (default 200) */
	maxEvents?: number;
}

/** Live activity feed — always open, scrollable, merges events + renders markdown */
export function LiveActivityFeed({
	workspaceId,
	maxEvents = 200,
}: LiveActivityFeedProps) {
	const { messages } = useTerminalWebSocket(workspaceId);
	const bottomRef = useRef<HTMLDivElement>(null);
	const scrollContainerRef = useRef<HTMLDivElement>(null);
	const isNearBottomRef = useRef(true);

	const merged = useMemo(() => {
		const sliced = messages.slice(-maxEvents);
		return mergeEvents(sliced);
	}, [messages, maxEvents]);

	// With flex-col-reverse, scrollTop 0 = bottom (newest content).
	// User scrolls up (scrollTop goes negative in some browsers, or grows in others).
	// We consider "near bottom" when scrollTop is close to 0.
	const handleScroll = useCallback(() => {
		const el = scrollContainerRef.current;
		if (!el) return;
		const threshold = 80;
		// flex-col-reverse: scrollTop 0 means at bottom, positive means scrolled up
		isNearBottomRef.current = el.scrollTop <= threshold;
	}, []);

	// Auto-snap to bottom when user is near bottom and new content arrives
	useEffect(() => {
		if (isNearBottomRef.current) {
			const el = scrollContainerRef.current;
			if (el) el.scrollTop = 0; // flex-col-reverse: 0 = bottom
		}
	}, [merged.length]);

	if (merged.length === 0) {
		return (
			<div className="text-xs text-muted-foreground px-3 py-2 border border-border rounded-lg bg-muted/20 flex items-center gap-2">
				<Loader2 className="w-3 h-3 animate-spin" />
				Waiting for agent output...
			</div>
		);
	}

	return (
		<div className="border border-border rounded-lg bg-background overflow-hidden">
			<div
				ref={scrollContainerRef}
				onScroll={handleScroll}
				className="overflow-y-auto max-h-[60vh] flex flex-col-reverse"
			>
				{/* flex-col-reverse: content anchors to bottom, overflow grows upward.
				    This prevents the parent scroll container from jumping when new events arrive. */}
				<div className="p-2 space-y-1">
					{merged.map((m, i) => {
						switch (m.kind) {
							case "text":
								return <MarkdownTextBlock key={`t-${i}`} markdown={m.markdown} />;
							case "thinking":
								return <MarkdownThinkingBlock key={`k-${i}`} markdown={m.markdown} />;
							case "tool":
								return <ToolBlock key={`tl-${i}`} info={m.info} result={m.result} />;
							case "error":
								return <ErrorBlock key={`e-${i}`} content={m.content} />;
							case "status":
								return <StatusBlock key={`s-${i}`} label={m.label} detail={m.detail} variant={m.variant} />;
							default:
								return null;
						}
					})}
					<div ref={bottomRef} />
				</div>
			</div>
		</div>
	);
}
