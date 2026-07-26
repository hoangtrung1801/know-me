import { useState } from "react";
import { Columns2, AlignJustify } from "lucide-react";
import type { TaskChange } from "@/ui/models/version";
import { Button } from "../ui/button";
import { DiffViewer } from "../ui/DiffViewer";
import { cn } from "../../lib/utils";

interface VersionDiffViewerProps {
	changes: TaskChange[];
	viewType?: "split" | "unified";
	showToggle?: boolean;
}

// Human-readable field names
const FIELD_LABELS: Record<string, string> = {
	title: "Title",
	description: "Description",
	status: "Status",
	priority: "Priority",
	assignee: "Assignee",
	labels: "Labels",
	acceptanceCriteria: "Acceptance Criteria",
	implementationPlan: "Implementation Plan",
	implementationNotes: "Implementation Notes",
};

// Convert value to string for display
function valueToString(value: unknown): string {
	if (value === null || value === undefined) return "";
	if (typeof value === "string") return value;
	if (Array.isArray(value)) {
		// Handle acceptance criteria array
		if (value.length > 0 && typeof value[0] === "object" && "text" in value[0]) {
			return value
				.map((ac: { text: string; completed: boolean }, i) =>
					`${i + 1}. [${ac.completed ? "x" : " "}] ${ac.text}`
				)
				.join("\n");
		}
		// Handle labels array
		return value.join(", ");
	}
	if (typeof value === "object") {
		return JSON.stringify(value, null, 2);
	}
	return String(value);
}

export default function VersionDiffViewer({
	changes,
	viewType: initialViewType = "unified",
	showToggle = true,
}: VersionDiffViewerProps) {
	const [viewType, setViewType] = useState<"split" | "unified">(initialViewType);

	if (changes.length === 0) {
		return (
			<div className={cn('text-sm', 'text-secondary-foreground', 'text-center', 'py-4')}>
				No changes to display
			</div>
		);
	}

	return (
		<div className="space-y-4">
			{/* View Type Toggle */}
			{showToggle && (
				<div className={cn('flex', 'items-center', 'justify-end', 'gap-2')}>
					<Button
						variant={viewType === "unified" ? "secondary" : "ghost"}
						size="sm"
						onClick={() => setViewType("unified")}
						title="Unified view"
					>
						<AlignJustify className={cn('w-4', 'h-4', 'mr-1')} />
						Unified
					</Button>
					<Button
						variant={viewType === "split" ? "secondary" : "ghost"}
						size="sm"
						onClick={() => setViewType("split")}
						title="Split view"
					>
						<Columns2 className={cn('w-4', 'h-4', 'mr-1')} />
						Split
					</Button>
				</div>
			)}

			{/* Diffs */}
			{changes.map((change, idx) => {
				const oldStr = valueToString(change.oldValue);
				const newStr = valueToString(change.newValue);
				const label = FIELD_LABELS[change.field] || change.field;

				return (
					<div
						key={`${change.field}-${idx}`}
						className={cn('rounded-lg', 'border', 'border-border', 'overflow-hidden')}
					>
						{/* Field Header */}
						<div className={cn('px-3', 'py-2', 'bg-muted', 'border-b', 'border-border', 'font-medium', 'text-sm', 'text-secondary-foreground')}>
							{label}
						</div>
						{/* Diff Content */}
						<DiffViewer
							oldValue={oldStr}
							newValue={newStr}
							className={cn('rounded-none', 'border-0')}
						/>
					</div>
				);
			})}
		</div>
	);
}
