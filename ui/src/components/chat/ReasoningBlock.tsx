/**
 * ReasoningBlock - Compact thinking label using the first H1 in markdown
 */

import { memo } from "react";
import { Brain, Loader2 } from "lucide-react";
import { cn } from "../../lib/utils";

interface ReasoningBlockProps {
	markdown: string;
	isStreaming?: boolean;
}

function extractThinkingTitle(markdown: string): string {
	const lines = markdown.split("\n");
	const heading = lines.find((line) => /^#\s+/.test(line.trim()));
	if (heading) {
		return heading.replace(/^#\s+/, "").trim();
	}

	const firstContentLine = lines
		.map((line) => line.trim())
		.find((line) => line.length > 0);

	if (!firstContentLine) return "Thinking";

	return firstContentLine
		.replace(/^[-*+]\s+/, "")
		.replace(/^[0-9]+\.\s+/, "")
		.replace(/[`*_#]/g, "")
		.trim()
		.slice(0, 120) || "Thinking";
}

export const ReasoningBlock = memo(function ReasoningBlock({
	markdown,
	isStreaming = false,
}: ReasoningBlockProps) {
	const title = extractThinkingTitle(markdown);

	// Only show transient thinking while the response is still streaming.
	if (!markdown.trim() || !isStreaming) return null;

	return (
		<div className="my-1">
			<div className="flex items-center gap-2 px-2 py-2 text-left sm:px-3">
				<Brain className="w-3.5 h-3.5 text-amber-500 shrink-0" />
				<span className="text-[13px] font-medium text-muted-foreground shrink-0">Thinking</span>
				<span
					className={cn(
						"min-w-0 flex-1 text-[13px] text-muted-foreground/80 truncate",
						isStreaming && "animate-pulse",
					)}
				>
					{title}
				</span>
				{isStreaming && <Loader2 className="w-3 h-3 animate-spin text-amber-400 shrink-0" />}
			</div>
		</div>
	);
});

interface CompactReasoningProps {
	markdown: string;
}

export const CompactReasoning = memo(function CompactReasoning({ markdown }: CompactReasoningProps) {
	if (!markdown.trim()) return null;

	return (
		<div className="inline-flex items-center gap-1 text-[10px] text-amber-500">
			<Brain className="w-3 h-3" />
			<span className="truncate">{extractThinkingTitle(markdown)}</span>
		</div>
	);
});
