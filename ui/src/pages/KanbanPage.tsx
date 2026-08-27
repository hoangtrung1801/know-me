import { useEffect, useRef, useState } from "react";
import { Plus, Archive, ChevronDown, FolderKanban, ListTodo, RefreshCw, X } from "lucide-react";
import type { Task } from "@/ui/models/task";
import { Board } from "../components/organisms";
import { Button } from "../components/ui/button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "../components/ui/select";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuLabel,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "../components/ui/DropdownMenu";
import { api } from "../api/client";
import { LifecycleAPIError } from "../api/client";
import type { TaskLifecycleResponse } from "../models/taskLifecycle";
import { TaskLifecycleDialog } from "../components/organisms/TaskLifecycleDialog";
import { toast } from "../components/ui/sonner";
import { useIsMobile } from "../hooks/useMobile";
import { useWorkspaceProjects } from "../hooks/useWorkspaceProjects";
import { usePageLifecycle, usePersistentPageState } from "../contexts/PageWorkspaceContext";
import {
	PageContent,
	PageError,
	PageHeader,
	PageLoading,
	PageShell,
} from "../components/templates/PageShell";

// Time duration options for batch archive (in milliseconds)
const BATCH_ARCHIVE_OPTIONS = [
	{ label: "now", value: 0 },
	{ label: "1 hour ago", value: 1 * 60 * 60 * 1000 },
	{ label: "1 day ago", value: 24 * 60 * 60 * 1000 },
	{ label: "1 week ago", value: 7 * 24 * 60 * 60 * 1000 },
	{ label: "1 month ago", value: 30 * 24 * 60 * 60 * 1000 },
	{ label: "3 months ago", value: 90 * 24 * 60 * 60 * 1000 },
];

interface KanbanPageProps {
	tasks: Task[];
	loading: boolean;
	error?: string | null;
	onRetry?: () => void;
	onTasksUpdate: (tasks: Task[]) => void;
	onNewTask: () => void;
}

export default function KanbanPage({ tasks, loading, error, onRetry, onTasksUpdate, onNewTask }: KanbanPageProps) {
	const { activationId, isActive, isHydrated } = usePageLifecycle("kanban");
	const isMobile = useIsMobile();
	const projects = useWorkspaceProjects();
	const [projectScope, setProjectScope] = usePersistentPageState("kanban", "projectScope", "all");
	const isProjectFiltered = projectScope !== "all";
	const visibleTasks = projectScope === "all"
		? tasks
		: tasks.filter((task) => projectScope === "global" ? !task.projectId : task.projectId === projectScope);
	const [mobileWarningDismissed, setMobileWarningDismissed] = useState(() => {
		return sessionStorage.getItem("kanban-mobile-warning-dismissed") === "true";
	});
	const [archiveDialogOpen, setArchiveDialogOpen] = useState(false);
	const [archiveResponse, setArchiveResponse] = useState<TaskLifecycleResponse | null>(null);
	const [archiveError, setArchiveError] = useState<string | null>(null);
	const [archiveLoading, setArchiveLoading] = useState(false);
	const [refreshing, setRefreshing] = useState(false);
	const [archiveRequest, setArchiveRequest] = useState<{ generation: number; minimumAgeMs: number; label: string; ids?: readonly string[] } | null>(null);
	const archiveGenerationRef = useRef(0);
	const archiveInFlightRef = useRef(false);
	const isActiveRef = useRef(isActive);
	const onRetryRef = useRef(onRetry);
	isActiveRef.current = isActive;
	onRetryRef.current = onRetry;

	useEffect(() => {
		if (!isHydrated || !isActiveRef.current || activationId === 0) return;
		onRetryRef.current?.();
	}, [activationId, isHydrated]);

	const reconcileTasks = async () => {
		if (!isActiveRef.current) return;
		const current = await api.getTasks();
		if (isActiveRef.current) onTasksUpdate(current);
	};

	const handleRefresh = async () => {
		if (!isActiveRef.current || refreshing) return;
		setRefreshing(true);
		try {
			await reconcileTasks();
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "Failed to refresh tasks");
		} finally {
			setRefreshing(false);
		}
	};

	const handleBatchArchivePreview = async (minimumAgeMs: number, label: string) => {
		const generation = ++archiveGenerationRef.current;
		setArchiveRequest({ generation, minimumAgeMs, label });
		setArchiveDialogOpen(true);
		setArchiveResponse(null);
		setArchiveError(null);
		setArchiveLoading(true);
		try {
			const response = await api.batchArchiveTasks({ minimumAgeMs });
			if (archiveGenerationRef.current !== generation) return;
			setArchiveRequest({ generation, minimumAgeMs, label, ids: Object.freeze(response.items.map((item) => item.taskId)) });
			setArchiveResponse(response);
		} catch (error) {
			if (archiveGenerationRef.current !== generation) return;
			const response = error instanceof LifecycleAPIError ? error.response || null : null;
			if (response) {
				setArchiveRequest({ generation, minimumAgeMs, label, ids: Object.freeze(response.items.map((item) => item.taskId)) });
			}
			setArchiveResponse(response);
			setArchiveError(error instanceof Error ? error.message : "Failed to preview archive");
		} finally {
			if (archiveGenerationRef.current === generation) setArchiveLoading(false);
		}
	};

	const handleBatchArchiveExecute = async () => {
		if (!archiveRequest?.ids || archiveInFlightRef.current) return;
		const { generation, minimumAgeMs, ids } = archiveRequest;
		archiveInFlightRef.current = true;
		setArchiveLoading(true);
		setArchiveError(null);
		try {
			const response = await api.batchArchiveTasks({ ids: [...ids], minimumAgeMs, execute: true });
			if (archiveGenerationRef.current !== generation) return;
			setArchiveResponse(response);
			await reconcileTasks();
			if (!response.failedTaskId) {
				toast.success(`Archived ${response.changed} task${response.changed === 1 ? "" : "s"}`);
			}
		} catch (error) {
			if (archiveGenerationRef.current === generation) {
				if (error instanceof LifecycleAPIError && error.response) setArchiveResponse(error.response);
				setArchiveError(error instanceof Error ? error.message : "Failed to archive Tasks");
			}
			await reconcileTasks().catch(() => {});
		} finally {
			archiveInFlightRef.current = false;
			if (archiveGenerationRef.current === generation) setArchiveLoading(false);
		}
	};

	const closeArchiveDialog = (open: boolean) => {
		if (open) return setArchiveDialogOpen(true);
		++archiveGenerationRef.current;
		setArchiveDialogOpen(false);
		setArchiveRequest(null);
		setArchiveResponse(null);
		setArchiveError(null);
	};

	const dismissMobileWarning = () => {
		setMobileWarningDismissed(true);
		sessionStorage.setItem("kanban-mobile-warning-dismissed", "true");
	};

	return (
		<PageShell>
			<PageHeader
				size="full"
				title="Kanban Board"
				description="Move active work through your configured delivery stages."
				context="Project work"
				status={
					<span className="tabular-nums">
						{isProjectFiltered
							? `Showing ${visibleTasks.length} of ${tasks.length} tasks`
							: `${visibleTasks.length} ${visibleTasks.length === 1 ? "task" : "tasks"}`}
					</span>
				}
				actions={
					<div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
						<div className="flex min-w-0 basis-full items-center gap-2 sm:basis-auto">
							<span className="shrink-0 text-xs font-medium text-muted-foreground">Project</span>
							<div className="relative min-w-0 flex-1 sm:flex-none">
								<FolderKanban className="pointer-events-none absolute left-2.5 top-1/2 z-10 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
								<Select value={projectScope} onValueChange={setProjectScope}>
									<SelectTrigger aria-label="Filter Kanban by project" className="h-11 w-full min-w-0 border-border/70 bg-muted/30 pl-8 pr-2 text-xs font-medium shadow-none transition-colors hover:bg-muted/55 focus:ring-1 sm:h-8 sm:min-w-44">
										<SelectValue />
									</SelectTrigger>
									<SelectContent align="start">
										<SelectItem value="all">All projects</SelectItem>
										<SelectItem value="global">Global</SelectItem>
										{projects.map((project) => <SelectItem key={project.id} value={project.id}>{project.name}</SelectItem>)}
									</SelectContent>
								</Select>
							</div>
							{isProjectFiltered && (
								<Button
									type="button"
									variant="ghost"
									size="sm"
									onClick={() => setProjectScope("all")}
									aria-label="Clear project filter"
									className="h-11 shrink-0 gap-1 px-2 text-muted-foreground hover:text-foreground sm:h-8"
								>
									<X className="h-3.5 w-3.5" />
									<span className="hidden sm:inline">Clear</span>
								</Button>
							)}
						</div>
						<Button
							type="button"
							variant="outline"
							size="sm"
							onClick={handleRefresh}
							disabled={refreshing}
							aria-label="Refresh tasks"
							aria-busy={refreshing}
							title="Refresh tasks"
							className="h-11 w-11 shrink-0 gap-1.5 px-2 text-muted-foreground hover:text-foreground sm:h-8 sm:w-auto sm:px-3"
						>
							<RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
							<span className="hidden text-sm sm:inline">Refresh</span>
						</Button>
						{/* Batch Archive Dropdown */}
						<DropdownMenu>
							<DropdownMenuTrigger asChild>
								<Button
									variant="outline"
									size="sm"
									aria-label="Archive completed Tasks"
									className="h-11 min-w-0 flex-1 gap-1.5 px-3 text-muted-foreground hover:text-foreground sm:h-8 sm:flex-none"
								>
									<Archive className="w-4 h-4" />
									<span className="text-sm">Archive completed</span>
									<ChevronDown className="w-3 h-3" />
								</Button>
							</DropdownMenuTrigger>
							<DropdownMenuContent align="end">
								<DropdownMenuLabel className="px-2 text-xs font-normal text-muted-foreground">
									Archive completed before
								</DropdownMenuLabel>
								{BATCH_ARCHIVE_OPTIONS.map((option) => (
									<DropdownMenuItem
										key={option.value}
										onClick={() => handleBatchArchivePreview(option.value, option.label)}
									>
										<span className="flex-1">Completed before {option.label}</span>
									</DropdownMenuItem>
								))}
							</DropdownMenuContent>
						</DropdownMenu>
						{/* New Task Button */}
						<Button
							onClick={onNewTask}
							size="sm"
							aria-label="New Task"
							className="h-11 min-w-0 flex-1 gap-1.5 px-3 sm:h-8 sm:flex-none"
						>
							<Plus className="w-4 h-4" />
							<span className="text-sm">New task</span>
						</Button>
					</div>
				}
			/>

			<PageContent size="full" className="flex min-h-0 flex-1 flex-col overflow-hidden py-5">
				{isMobile && !mobileWarningDismissed && (
					<div role="note" className="mb-4 flex shrink-0 items-center gap-3 rounded-lg border border-amber-200/80 bg-amber-50 px-3 py-2.5 text-sm text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100">
						<ListTodo className="h-4 w-4 shrink-0" />
						<span className="flex-1">
							For smoother drag-and-drop on mobile, open the Tasks list.{" "}
							<a href="/tasks" className="font-medium underline underline-offset-2">Open Tasks</a>.
						</span>
						<button
							type="button"
							onClick={dismissMobileWarning}
							aria-label="Dismiss mobile Kanban notice"
							className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-amber-800 transition-colors hover:bg-amber-100 hover:text-amber-950 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring dark:text-amber-200 dark:hover:bg-amber-900/40 dark:hover:text-amber-50"
						>
							<X className="h-3.5 w-3.5" />
						</button>
					</div>
				)}

				{loading ? (
					<PageLoading label="Loading Kanban board" className="flex-1" />
				) : error && tasks.length === 0 ? (
					<PageError
						description={error}
						onRetry={onRetry}
						className="flex-1"
					/>
				) : (
					<Board tasks={visibleTasks} loading={false} onTasksUpdate={onTasksUpdate} />
				)}
			</PageContent>

			<TaskLifecycleDialog
				open={archiveDialogOpen}
				onOpenChange={closeArchiveDialog}
				title="Archive completed Tasks"
				description={`Preview for Tasks completed before ${archiveRequest?.label || "the selected retention window"}. Eligibility and warnings come from the backend.`}
				response={archiveResponse}
				loading={archiveLoading}
				error={archiveError}
				confirmLabel="Archive eligible Tasks"
				onConfirm={handleBatchArchiveExecute}
			/>
		</PageShell>
	);
}
