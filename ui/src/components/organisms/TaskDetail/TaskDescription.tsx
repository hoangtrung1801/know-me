import { useState, useEffect } from "react";
import { Button } from "../../ui/button";
import { MDEditor, MDRender } from "../../editor";
import type { Task } from "@/ui/models/task";

interface TaskDescriptionProps {
	task: Task;
	onSave: (updates: Partial<Task>) => Promise<void>;
	saving: boolean;
}

export function TaskDescription({ task, onSave, saving }: TaskDescriptionProps) {
	const [editing, setEditing] = useState(false);
	const [description, setDescription] = useState(task.description || "");

	useEffect(() => {
		setDescription(task.description || "");
	}, [task.description]);

	const handleSave = () => {
		if (description !== task.description) {
			onSave({ description: description || undefined });
		}
		setEditing(false);
	};

	const handleCancel = () => {
		setDescription(task.description || "");
		setEditing(false);
	};

	return (
		<div className="py-6">
			<h3 className="text-base font-semibold mb-3">Description</h3>
			{editing ? (
				<div className="space-y-3">
					<MDEditor
						markdown={description}
						onChange={setDescription}
						placeholder="Add a more detailed description..."
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
					{task.description ? (
						<MDRender markdown={task.description} className="text-sm prose prose-sm dark:prose-invert max-w-none" />
					) : (
						<span className="text-muted-foreground text-sm">
							Click to add description...
						</span>
					)}
				</div>
			)}
		</div>
	);
}
