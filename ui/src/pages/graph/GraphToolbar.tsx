import { Maximize2, Minimize2, Scan, Search, X } from "lucide-react";
import { cn } from "@/ui/lib/utils";
import type { FilterState } from "./constants";

interface GraphToolbarProps {
	filters: FilterState;
	searchQuery: string;
	searchMatchCount: number;
	impactNodeId: string | null;
	isFullscreen: boolean;
	nodeCount: number;
	edgeCount: number;
	onToggleFilter: (key: keyof FilterState) => void;
	onSearchChange: (query: string) => void;
	onClearImpact: () => void;
	onZoomToFit: () => void;
	onToggleFullscreen: () => void;
}

export function GraphToolbar({
	searchQuery,
	searchMatchCount,
	impactNodeId,
	isFullscreen,
	nodeCount,
	edgeCount,
	onSearchChange,
	onClearImpact,
	onZoomToFit,
	onToggleFullscreen,
}: GraphToolbarProps) {
	return (
		<div className="flex items-center gap-2 px-4 py-2 border-b border-border/50 bg-background/95 flex-wrap">
			<div className="relative">
				<Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
				<input
					type="text"
					value={searchQuery}
					onChange={(e) => onSearchChange(e.target.value)}
					placeholder="Search graph..."
					className="h-7 w-40 rounded-md border bg-background pl-7 pr-7 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
				/>
				{searchQuery && (
					<button
						type="button"
						onClick={() => onSearchChange("")}
						className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
					>
						<X className="w-3 h-3" />
					</button>
				)}
			</div>

			{searchQuery && <span className="text-xs text-muted-foreground">{searchMatchCount} matches</span>}

			{impactNodeId && (
				<button
					type="button"
					onClick={onClearImpact}
					className="flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition-colors border bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/30"
				>
					<X className="w-3 h-3" />
					Clear Impact
				</button>
			)}

			<div className="flex-1" />

			<span className="text-xs text-muted-foreground">
				{nodeCount} nodes, {edgeCount} edges
			</span>

			<div className="flex items-center gap-0.5">
				<button
					type="button"
					onClick={onZoomToFit}
					className="rounded-md p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
					title="Zoom to fit"
				>
					<Scan className="w-4 h-4" />
				</button>
				<button
					type="button"
					onClick={onToggleFullscreen}
					className="rounded-md p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
					title="Toggle fullscreen"
				>
					{isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
				</button>
			</div>
		</div>
	);
}
