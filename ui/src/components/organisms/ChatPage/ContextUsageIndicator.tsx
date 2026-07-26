import { useState } from "react";

import { Popover, PopoverContent, PopoverTrigger } from "../../ui/popover";
import { ArcIndicator } from "./ArcIndicator";
import { ContextHeatmapGrid } from "./ContextHeatmapGrid";
import type { ContextUsageData } from "../../../hooks/useContextUsage";

interface ContextUsageIndicatorProps {
	data: ContextUsageData;
	modelName?: string;
	messages?: Array<{ role: string; model: string }>;
}

function formatTokens(n: number): string {
	if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
	if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
	return String(n);
}

export function ContextUsageIndicator({ data, modelName, messages }: ContextUsageIndicatorProps) {
	const [open, setOpen] = useState(false);

	if (data.totalTokens === 0) return null;

	const hasLimit = data.contextLimit != null;
	const pct = data.usagePercent;

	// Infer model name: prop > last assistant message > fallback
	let displayModel = modelName;
	if (!displayModel && messages) {
		for (let i = messages.length - 1; i >= 0; i--) {
			const msg = messages[i];
			if (msg && msg.role === "assistant" && msg.model) {
				displayModel = msg.model;
				break;
			}
		}
	}
	displayModel = displayModel || "Unknown model";

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<button
					type="button"
					className="flex items-center gap-1.5 rounded-lg px-1.5 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
					onMouseEnter={() => setOpen(true)}
					onMouseLeave={() => setOpen(false)}
					title="Context usage"
				>
					{hasLimit && pct != null ? (
						<>
							<ArcIndicator percent={pct} size={20} strokeWidth={2.5} />
							<span className="hidden sm:inline tabular-nums">
								{Math.round(pct)}%
							</span>
						</>
					) : (
						<span className="tabular-nums">{formatTokens(data.totalTokens)}</span>
					)}
				</button>
			</PopoverTrigger>
			<PopoverContent
				side="top"
				align="start"
				sideOffset={8}
				className="w-[280px] rounded-xl border-border/60 p-0 shadow-xl"
				onMouseEnter={() => setOpen(true)}
				onMouseLeave={() => setOpen(false)}
			>
				<div className="p-3 space-y-3">
					{/* Header */}
					<div>
						<div className="text-xs font-medium text-foreground">Context Usage</div>
						<div className="text-[11px] text-muted-foreground mt-0.5">
							{displayModel}
							{" • "}
							<span className="tabular-nums">
								{formatTokens(data.totalTokens)}
								{hasLimit && `/${formatTokens(data.contextLimit!)}`}
								{" tokens"}
								{pct != null && ` (${Math.round(pct)}%)`}
							</span>
						</div>
					</div>

					{/* Heatmap grid */}
					{hasLimit && (
						<ContextHeatmapGrid
							categories={data.categories}
							contextLimit={data.contextLimit}
						/>
					)}

					{/* Legend */}
					<div className="space-y-1">
						{data.categories.map((cat) => (
							<div key={cat.key} className="flex items-center gap-2 text-[11px]">
								<span
									className="h-2 w-2 rounded-full shrink-0"
									style={{
										backgroundColor: cat.key === "free" ? undefined : cat.color,
										border: cat.key === "free" ? "1px solid var(--border)" : "none",
									}}
								/>
								<span className="flex-1 text-muted-foreground">{cat.label}</span>
								<span className="tabular-nums text-foreground">
									{formatTokens(cat.tokens)}
								</span>
								{hasLimit && (
									<span className="tabular-nums text-muted-foreground w-[38px] text-right">
										{cat.percent.toFixed(1)}%
									</span>
								)}
							</div>
						))}
					</div>

					{/* Cost */}
					{data.cost > 0 && (
						<div className="border-t border-border/40 pt-2 flex items-center justify-between text-[11px]">
							<span className="text-muted-foreground">Cost</span>
							<span className="tabular-nums text-foreground">
								${data.cost.toFixed(4)}
							</span>
						</div>
					)}
				</div>
			</PopoverContent>
		</Popover>
	);
}
