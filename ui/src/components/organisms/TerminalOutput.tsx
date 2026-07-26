/**
 * TerminalOutput — renders JSONL ProxyEvent messages as styled terminal output
 * Color-coded by event type, auto-scrolls, scroll-lock on manual scroll up
 */

import { useEffect, useRef, useState } from "react";
import { cn } from "@/ui/lib/utils";
import type { ProxyEvent } from "@/ui/models/chat";

interface TerminalOutputProps {
	messages: ProxyEvent[];
	className?: string;
}

// Style map for ProxyEvent types
const EVENT_STYLES: Record<string, string> = {
	init: "text-emerald-400",
	thinking: "text-zinc-500 italic",
	text: "text-zinc-200",
	tool_use: "text-blue-400",
	tool_result: "text-cyan-400",
	result: "text-emerald-300 font-medium",
	error: "text-red-400",
	stderr: "text-yellow-400",
	exit: "text-zinc-500",
};

const EVENT_PREFIX: Record<string, string> = {
	init: "⚡",
	thinking: "💭",
	tool_use: "🔧",
	tool_result: "📋",
	result: "✓",
	error: "✗",
	stderr: "⚠",
	exit: "⏹",
};

function formatMessage(msg: ProxyEvent): string {
	const prefix = EVENT_PREFIX[msg.type] || "";
	const text = msg.text || "";

	if (msg.type === "tool_use") {
		// Try to extract tool name from text
		return `${prefix} ${text || "Using tool..."}`;
	}

	if (msg.type === "exit") {
		return `${prefix} Process exited`;
	}

	if (msg.type === "init") {
		return `${prefix} Agent ${msg.agent} started`;
	}

	if (!text) return "";
	return prefix ? `${prefix} ${text}` : text;
}

export function TerminalOutput({ messages, className }: TerminalOutputProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const [autoScroll, setAutoScroll] = useState(true);
	const userScrolledRef = useRef(false);

	// Auto-scroll to bottom when new messages arrive
	useEffect(() => {
		if (autoScroll && containerRef.current) {
			containerRef.current.scrollTop = containerRef.current.scrollHeight;
		}
	}, [messages, autoScroll]);

	// Detect manual scroll to disable auto-scroll
	const handleScroll = () => {
		if (!containerRef.current) return;
		const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
		const isAtBottom = scrollHeight - scrollTop - clientHeight < 30;

		if (!isAtBottom && !userScrolledRef.current) {
			userScrolledRef.current = true;
			setAutoScroll(false);
		} else if (isAtBottom && userScrolledRef.current) {
			userScrolledRef.current = false;
			setAutoScroll(true);
		}
	};

	return (
		<div
			ref={containerRef}
			onScroll={handleScroll}
			className={cn(
				"overflow-y-auto bg-zinc-950 text-zinc-200 font-mono text-xs leading-5 p-3",
				className,
			)}
		>
			{messages.length === 0 ? (
				<div className="text-zinc-600 italic">
					Waiting for agent output...
				</div>
			) : (
				messages.map((msg, i) => {
					const formatted = formatMessage(msg);
					if (!formatted) return null;
					const style = EVENT_STYLES[msg.type] || "text-zinc-200";

					return (
						<div
							key={`${msg.ts}-${i}`}
							className={cn("whitespace-pre-wrap break-words", style)}
						>
							{formatted}
						</div>
					);
				})
			)}

			{/* Scroll-to-bottom indicator */}
			{!autoScroll && messages.length > 0 && (
				<button
					type="button"
					onClick={() => {
						setAutoScroll(true);
						userScrolledRef.current = false;
						if (containerRef.current) {
							containerRef.current.scrollTop =
								containerRef.current.scrollHeight;
						}
					}}
					className="sticky bottom-2 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-zinc-800 text-zinc-400 text-xs hover:bg-zinc-700 transition-colors"
				>
					↓ Scroll to bottom
				</button>
			)}
		</div>
	);
}
