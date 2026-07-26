import { memo, useEffect, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, ChevronDown, ChevronRight, Copy, Loader2, Terminal } from "lucide-react";

import type { ChatMessage } from "../../models/chat";
import { cn } from "../../lib/utils";
import { AnimatedCollapse } from "../ui/animatedCollapse";

type ToolCallItem = NonNullable<ChatMessage["toolCalls"]>[number];

interface ShellCallListProps {
	toolCalls: ToolCallItem[];
}

function stringifyInline(value: unknown): string | undefined {
	if (typeof value === "string") return value;
	if (typeof value === "number" || typeof value === "boolean") return String(value);
	return undefined;
}

export function isShellToolName(name: string): boolean {
	const normalized = name.toLowerCase();
	return (
		normalized === "bash" ||
		normalized === "shell" ||
		normalized === "exec_command" ||
		normalized === "functions.exec_command"
	);
}

function getShellCommand(tool: ToolCallItem): string {
	return (
		stringifyInline(tool.input.command) ||
		stringifyInline(tool.input.cmd) ||
		stringifyInline(tool.input.prompt) ||
		tool.name
	);
}

function getShellTitle(tool: ToolCallItem): string {
	const command = getShellCommand(tool);
	return command.split("\n")[0] || tool.name;
}

async function copyText(value: string) {
	await navigator.clipboard.writeText(value);
}

const ShellCallCard = memo(function ShellCallCard({ tool }: { tool: ToolCallItem }) {
	const command = getShellCommand(tool);
	const output = tool.output || "";
	const status = tool.status;
	const [expanded, setExpanded] = useState(status === "loading");
	const previousWasLoadingRef = useRef(status === "loading");

	useEffect(() => {
		if (status === "loading") {
			setExpanded(true);
		} else if (previousWasLoadingRef.current) {
			setExpanded(false);
		}
		previousWasLoadingRef.current = status === "loading";
	}, [status]);

	const firstLine = command.split("\n")[0] || command;
	const isMultiLine = command.includes("\n");
	const hasOutput = Boolean(output);

	return (
		<div className="my-1.5 overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950 text-zinc-100">
			{/* Header bar */}
			<button
				type="button"
				onClick={() => setExpanded((value) => !value)}
				className="flex w-full items-center gap-2 px-2.5 py-2 text-left transition-colors duration-200 hover:bg-zinc-900 sm:gap-2.5 sm:px-3"
			>
				<span className="shrink-0 text-zinc-600">
					<ChevronRight
						className={cn(
							"h-3.5 w-3.5 transition-transform duration-200 ease-out",
							expanded && "rotate-90",
						)}
					/>
				</span>
				<span className="shrink-0 font-mono text-[13px] font-semibold text-emerald-400">$</span>
				<span className="min-w-0 flex-1 truncate font-mono text-[12px] text-zinc-200">{firstLine}</span>
				<span className="shrink-0">
					{status === "loading" ? (
						<Loader2 className="h-3.5 w-3.5 animate-spin text-amber-400" />
					) : status === "success" ? (
						<CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
					) : (
						<AlertCircle className="h-3.5 w-3.5 text-red-500" />
					)}
				</span>
			</button>

			{/* Expanded body */}
			<AnimatedCollapse open={expanded} className="border-t border-zinc-800" innerClassName="bg-zinc-950">
					{/* Show full command if multiline */}
					{isMultiLine && (
						<div className="border-b border-zinc-800/60 p-2.5 sm:p-3">
							<pre className="overflow-x-auto whitespace-pre-wrap break-all font-mono text-[12px] leading-5 text-zinc-300">
								{command.split("\n").map((line, i) => (
									<span key={i} className="block">
										<span className="select-none text-emerald-500/70">{i === 0 ? "$ " : "  "}</span>
										{line}
									</span>
								))}
							</pre>
						</div>
					)}

					{/* Output */}
					{hasOutput ? (
						<div className="group relative">
							<pre className="max-h-[320px] overflow-auto whitespace-pre-wrap break-words p-2.5 font-mono text-[12px] leading-5 text-zinc-400 sm:p-3">
								{output}
							</pre>
							<button
								type="button"
								onClick={() => void copyText([`$ ${command}`, output].filter(Boolean).join("\n\n"))}
								className="absolute right-2 top-2 rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-[10px] text-zinc-400 opacity-100 transition-opacity hover:text-zinc-200 sm:opacity-0 sm:group-hover:opacity-100"
								title="Copy"
							>
								<Copy className="inline h-3 w-3" />
							</button>
						</div>
					) : status === "loading" ? (
						<div className="flex items-center p-2.5 font-mono text-[12px] text-zinc-500 sm:p-3">
							<Loader2 className="h-3.5 w-3.5 animate-spin text-amber-400" />
						</div>
					) : (
						<div className="p-2.5 font-mono text-[12px] text-zinc-600 sm:p-3">
							(no output)
						</div>
					)}
			</AnimatedCollapse>
		</div>
	);
});

export const ShellCallList = memo(function ShellCallList({ toolCalls }: ShellCallListProps) {
	if (toolCalls.length === 0) return null;

	return (
		<div className="space-y-1">
			{toolCalls.map((tool) => (
				<ShellCallCard key={tool.id} tool={tool} />
			))}
		</div>
	);
});
