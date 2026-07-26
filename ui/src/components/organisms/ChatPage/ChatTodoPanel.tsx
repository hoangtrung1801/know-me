import { useState, useMemo } from "react";
import { CheckCircle2, ChevronDown, Circle, ListTodo, Loader2 } from "lucide-react";
import { cn } from "../../../lib/utils";
import type { ChatTodoItem } from "./helpers";

interface ChatTodoPanelProps {
	todos: ChatTodoItem[];
	variant?: "inline" | "sidebar";
}

export function ChatTodoPanel({ todos, variant = "inline" }: ChatTodoPanelProps) {
	const [isExpanded, setIsExpanded] = useState(true);
	const completedCount = todos.filter((todo) => todo.status === "completed").length;

	const { pendingTodos, inProgressTodo } = useMemo(() => {
		const pending = todos.filter((todo) => todo.status === "pending");
		const inProgress = todos.filter((todo) => todo.status === "in_progress");
		return {
			pendingTodos: pending,
			inProgressTodo: inProgress[0] || null,
		};
	}, [todos]);

	if (todos.length === 0 || completedCount >= todos.length) return null;

	if (variant === "sidebar") {
		return (
			<div className="rounded-xl border border-border/60 bg-background/90 p-2.5 shadow-sm sm:rounded-2xl sm:p-3">
				<div
					className="flex cursor-pointer select-none items-center gap-2 py-1 text-sm"
					onClick={() => setIsExpanded(!isExpanded)}
				>
					<ListTodo className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
					<div className="min-w-0 flex-1 font-medium text-foreground">Todo</div>
					<div className="text-[11px] text-muted-foreground">{completedCount}/{todos.length}</div>
					<div
						className={cn(
							"h-4 w-4 text-muted-foreground transition-transform duration-200",
							isExpanded ? "rotate-180" : "rotate-0"
						)}
					>
						<ChevronDown />
					</div>
				</div>

				<div
					className={cn(
						"mt-2 overflow-hidden transition-all duration-200 ease-in-out",
						isExpanded ? "max-h-60 opacity-100" : "max-h-0 opacity-0"
					)}
				>
					<div className="space-y-1 overflow-y-auto sm:space-y-1.5">
						{pendingTodos.map((todo) => (
							<div key={todo.id} className="flex items-start gap-2 rounded-lg px-2 py-2 hover:bg-muted/30 sm:py-1.5">
								<div className="mt-0.5 shrink-0">
									<Circle className="h-3.5 w-3.5 text-muted-foreground" />
								</div>
								<div className="min-w-0 flex-1 text-[13px]">{todo.content}</div>
								{todo.priority && (
									<span className="shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground">
										{todo.priority}
									</span>
								)}
							</div>
						))}
					</div>
				</div>

				{!isExpanded && inProgressTodo && (
					<div className="mt-2 animate-in fade-in slide-in-from-top-1 duration-200">
						<div className="flex items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2 py-1.5 text-xs">
							<Loader2 className="h-3 w-3 shrink-0 animate-spin text-amber-500" />
							<span className="truncate text-amber-700 dark:text-amber-400">{inProgressTodo.content}</span>
						</div>
					</div>
				)}

				{isExpanded && inProgressTodo && (
					<div className="mt-2 border-t border-border/60 pt-2">
						<div className="flex items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2 py-1.5 text-xs">
							<Loader2 className="h-3 w-3 shrink-0 animate-spin text-amber-500" />
							<span className="truncate text-amber-700 dark:text-amber-400">{inProgressTodo.content}</span>
						</div>
					</div>
				)}
			</div>
		);
	}

	return (
		<div className="rounded-xl border border-border/60 bg-muted/15 px-2.5 py-2 sm:rounded-2xl sm:px-3">
			<div
				className="flex cursor-pointer select-none items-center gap-2 py-0.5 text-xs sm:text-[12px]"
				onClick={() => setIsExpanded(!isExpanded)}
			>
				<ListTodo className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
				<span className="font-medium text-foreground">Todo</span>
				<span className="flex-1 text-muted-foreground">{completedCount}/{todos.length}</span>
				<div
					className={cn(
						"h-3.5 w-3.5 text-muted-foreground hover:text-foreground transition-transform duration-200",
						isExpanded ? "rotate-180" : "rotate-0"
					)}
				>
					<ChevronDown />
				</div>
			</div>

			<div
				className={cn(
					"mt-2 overflow-hidden transition-all duration-200 ease-in-out",
					isExpanded ? "max-h-40 opacity-100" : "max-h-0 opacity-0"
				)}
			>
				<div className="flex flex-col gap-1 overflow-y-auto max-h-32 sm:max-h-40">
					{pendingTodos.map((todo) => (
						<div
							key={todo.id}
							className="flex items-center gap-1.5 rounded-lg border border-border/60 bg-background/90 px-2 py-2 text-xs sm:py-1.5 sm:text-[12px]"
						>
							<Circle className="h-3 w-3 shrink-0 text-muted-foreground" />
							<span className="truncate">{todo.content}</span>
						</div>
					))}
				</div>
			</div>

			{!isExpanded && inProgressTodo && (
				<div className="mt-2 animate-in fade-in slide-in-from-top-1 duration-200">
					<div className="flex items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-xs">
						<Loader2 className="h-3 w-3 shrink-0 animate-spin text-amber-500" />
						<span className="truncate text-amber-700 dark:text-amber-400">{inProgressTodo.content}</span>
					</div>
				</div>
			)}

			{isExpanded && inProgressTodo && (
				<div className="mt-2 border-t border-border/60 pt-2">
					<div className="flex items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-xs">
						<Loader2 className="h-3 w-3 shrink-0 animate-spin text-amber-500" />
						<span className="truncate text-amber-700 dark:text-amber-400">{inProgressTodo.content}</span>
					</div>
				</div>
			)}
		</div>
	);
}
