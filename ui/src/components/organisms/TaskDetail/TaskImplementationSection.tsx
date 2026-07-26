import { useState, useEffect } from "react";
import { Button } from "../../ui/button";
import { MDEditor, MDRender } from "../../editor";
import type { Task } from "@/ui/models/task";

interface TaskImplementationSectionProps {
	task: Task;
	onSave: (updates: Partial<Task>) => Promise<void>;
	saving: boolean;
	type: "plan" | "notes";
}

const sectionConfig = {
	plan: {
		title: "Implementation Plan",
		field: "implementationPlan" as const,
		placeholder: "1. First step\n2. Second step\n3. Third step...",
		emptyText: "Click to add implementation plan...",
	},
	notes: {
		title: "Implementation Notes",
		field: "implementationNotes" as const,
		placeholder: "Add implementation notes...",
		emptyText: "Click to add notes...",
	},
};

export function TaskImplementationSection({
	task,
	onSave,
	saving,
	type,
}: TaskImplementationSectionProps) {
	const cfg = sectionConfig[type];
	const fieldValue = task[cfg.field] || "";

	const [editing, setEditing] = useState(false);
	const [content, setContent] = useState(fieldValue);

	useEffect(() => {
		setContent(fieldValue);
	}, [fieldValue]);

	const handleSave = () => {
		if (content !== fieldValue) {
			onSave({ [cfg.field]: content || undefined });
		}
		setEditing(false);
	};

	const handleCancel = () => {
		setContent(fieldValue);
		setEditing(false);
	};

	return (
		<div className="py-6">
			<h3 className="text-base font-semibold mb-3">{cfg.title}</h3>
			{editing ? (
				<div className="space-y-3">
					<MDEditor
						markdown={content}
						onChange={setContent}
						placeholder={cfg.placeholder}
						readOnly={saving}
						height={200}
					/>
					<div className="flex gap-2">
						<Button size="sm" onClick={handleSave} disabled={saving}>
							Save
						</Button>
						<Button size="sm" variant="ghost" onClick={handleCancel}>
							Cancel
						</Button>
					</div>
				</div>
			) : (
				<div
					className="min-h-[48px] py-2 cursor-pointer rounded-md hover:bg-muted/50 transition-colors -mx-2 px-2"
					onClick={() => setEditing(true)}
					role="button"
					tabIndex={0}
					onKeyDown={(e) => e.key === "Enter" && setEditing(true)}
				>
					{fieldValue ? (
						<MDRender markdown={fieldValue} className="text-sm prose prose-sm dark:prose-invert max-w-none" />
					) : (
						<span className="text-muted-foreground text-sm">{cfg.emptyText}</span>
					)}
				</div>
			)}
		</div>
	);
}
