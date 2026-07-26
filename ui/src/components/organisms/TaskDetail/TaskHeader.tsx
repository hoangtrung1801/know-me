import { useState, useRef, useEffect } from "react";
import { SheetHeader, SheetTitle } from "../../ui/sheet";
import { Input } from "../../ui/input";
import type { Task } from "@models/task";
import { useConfig } from "../../../contexts/ConfigContext";
import { getStatusBadgeClasses, getStatusLabel, type ColorName } from "../../../utils/colors";

interface TaskHeaderProps {
	task: Task;
	onSave: (updates: Partial<Task>) => Promise<void>;
	saving: boolean;
}

export function TaskHeader({ task, onSave, saving }: TaskHeaderProps) {
	const [editing, setEditing] = useState(false);
	const [title, setTitle] = useState(task.title);
	const inputRef = useRef<HTMLInputElement>(null);
	const { config } = useConfig();
	const configStatusColors = (config.statusColors || {}) as Record<string, ColorName>;

	useEffect(() => {
		setTitle(task.title);
	}, [task.title]);

	useEffect(() => {
		if (editing && inputRef.current) {
			inputRef.current.focus();
			inputRef.current.select();
		}
	}, [editing]);

	const handleSave = () => {
		if (title.trim() && title !== task.title) {
			onSave({ title: title.trim() });
		}
		setEditing(false);
	};

	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === "Enter") handleSave();
		if (e.key === "Escape") {
			setTitle(task.title);
			setEditing(false);
		}
	};

	return (
		<SheetHeader className="space-y-2">
			<div className="flex items-center gap-2">
				<span className="text-xs font-mono text-muted-foreground">#{task.id}</span>
				<span className={`text-xs px-1.5 py-0.5 rounded font-medium ${getStatusBadgeClasses(task.status, configStatusColors)}`}>
					{getStatusLabel(task.status)}
				</span>
			</div>
			{editing ? (
				<Input
					ref={inputRef}
					value={title}
					onChange={(e) => setTitle(e.target.value)}
					onBlur={handleSave}
					onKeyDown={handleKeyDown}
					disabled={saving}
					className="text-xl font-semibold border-none shadow-none px-0 focus-visible:ring-0"
				/>
			) : (
				<SheetTitle
					className="text-xl font-semibold cursor-pointer hover:text-muted-foreground transition-colors text-left"
					onClick={() => setEditing(true)}
				>
					{task.title}
				</SheetTitle>
			)}
		</SheetHeader>
	);
}
