import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { PanelRightOpen } from "lucide-react";
import type { Task } from "@/ui/models/task";
import { Button } from "../../ui/button";
import { TaskAgentPanel } from "./TaskAgentPanel";

const MIN_RAIL_WIDTH = 320;
const MAX_RAIL_WIDTH = 560;

function clampRailWidth(width: number): number {
	return Math.min(MAX_RAIL_WIDTH, Math.max(MIN_RAIL_WIDTH, Math.round(width)));
}

interface TaskCodexRailProps {
	task: Task;
	width: number;
	collapsed: boolean;
	onWidthChange: (width: number) => void;
	onToggleCollapse: () => void;
	onTaskUpdated?: (task: Task) => void;
}

export function TaskCodexRail({
	task,
	width,
	collapsed,
	onWidthChange,
	onToggleCollapse,
	onTaskUpdated,
}: TaskCodexRailProps) {
	const railRef = useRef<HTMLElement>(null);
	const expandButtonRef = useRef<HTMLButtonElement>(null);
	const [resizing, setResizing] = useState(false);

	useEffect(() => {
		if (collapsed) expandButtonRef.current?.focus();
	}, [collapsed]);

	useEffect(() => {
		if (!resizing) return;
		const handlePointerMove = (event: PointerEvent) => {
			const right = railRef.current?.getBoundingClientRect().right;
			if (right === undefined) return;
			onWidthChange(clampRailWidth(right - event.clientX));
		};
		const stopResize = () => setResizing(false);
		window.addEventListener("pointermove", handlePointerMove);
		window.addEventListener("pointerup", stopResize, { once: true });
		window.addEventListener("blur", stopResize, { once: true });
		return () => {
			window.removeEventListener("pointermove", handlePointerMove);
			window.removeEventListener("pointerup", stopResize);
			window.removeEventListener("blur", stopResize);
		};
	}, [onWidthChange, resizing]);

	const adjustWidth = (event: KeyboardEvent<HTMLButtonElement>) => {
		if (event.key === "ArrowLeft") {
			event.preventDefault();
			onWidthChange(clampRailWidth(width + 16));
		} else if (event.key === "ArrowRight") {
			event.preventDefault();
			onWidthChange(clampRailWidth(width - 16));
		} else if (event.key === "Home") {
			event.preventDefault();
			onWidthChange(MIN_RAIL_WIDTH);
		} else if (event.key === "End") {
			event.preventDefault();
			onWidthChange(MAX_RAIL_WIDTH);
		}
	};

	return (
		<aside
			ref={railRef}
			style={{ width: collapsed ? 44 : clampRailWidth(width) }}
			className="relative min-w-0 shrink-0 border-l border-border/40 bg-muted/10 transition-[width] duration-200"
			data-collapsed={collapsed}
			data-testid="task-codex-rail"
		>
			<div className={collapsed ? "hidden" : "h-full"}>
				<button
					type="button"
					aria-label="Resize Codex panel"
					aria-valuemin={MIN_RAIL_WIDTH}
					aria-valuemax={MAX_RAIL_WIDTH}
					aria-valuenow={clampRailWidth(width)}
					aria-valuetext={`${clampRailWidth(width)} pixels`}
					onPointerDown={(event) => {
						event.preventDefault();
						setResizing(true);
					}}
					onKeyDown={adjustWidth}
					className={`absolute -left-1 top-0 z-20 h-full w-2 cursor-col-resize outline-none transition-colors hover:bg-primary/30 focus-visible:bg-primary/50 ${resizing ? "bg-primary/40" : ""}`}
				/>
				<TaskAgentPanel
					task={task}
					onTaskUpdated={onTaskUpdated}
					onCollapse={onToggleCollapse}
					embedded
				/>
			</div>
			{collapsed && (
				<div className="flex h-full items-start justify-center pt-3">
					<Button
						ref={expandButtonRef}
						variant="ghost"
						size="icon"
						className="h-8 w-8"
						onClick={onToggleCollapse}
						aria-label="Expand Codex panel"
						title="Expand Codex panel"
					>
						<PanelRightOpen />
					</Button>
				</div>
			)}
		</aside>
	);
}
