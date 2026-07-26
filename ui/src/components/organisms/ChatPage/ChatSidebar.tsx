import { useMemo, useState } from "react";
import { AlertCircle, Check, HelpCircle, Loader2, MessageSquare, Pencil, Plus, Search, Trash2, X } from "lucide-react";

import type { ChatSession } from "../../../models/chat";
import { cn } from "../../../lib/utils";
import { getSessionSortDate, groupSessions } from "./helpers";

interface ChatSidebarProps {
	sessions: ChatSession[];
	activeId: string | null;
	sessionActivity?: Record<
		string,
		{
			isRunning: boolean;
			runningAgents: number;
			hasError: boolean;
			hasPendingPermission: boolean;
			hasPendingQuestion: boolean;
		}
	>;
	onSelect: (id: string) => void;
	onNew: () => void;
	onDelete: (id: string) => void;
	onRename: (id: string, title: string) => void;
	disabled?: boolean;
	actionsDisabled?: boolean;
}

function formatActivityLabel(runningAgents: number): string {
	return runningAgents === 1 ? "1 agent running" : `${runningAgents} agents running`;
}

function formatAgentBadgeLabel(runningAgents: number): string {
	return runningAgents === 1 ? "1 agent" : `${runningAgents} agents`;
}

export function ChatSidebar({
	sessions,
	activeId,
	sessionActivity = {},
	onSelect,
	onNew,
	onDelete,
	onRename,
	disabled = false,
	actionsDisabled = false,
}: ChatSidebarProps) {
	const [query, setQuery] = useState("");
	const [editingId, setEditingId] = useState<string | null>(null);
	const [editTitle, setEditTitle] = useState("");

	const filteredSessions = useMemo(() => {
		const normalized = query.trim().toLowerCase();
		if (!normalized) return sessions;
		return sessions.filter((session) => session.title.toLowerCase().includes(normalized));
	}, [sessions, query]);

	const grouped = useMemo(() => groupSessions(filteredSessions), [filteredSessions]);

	return (
		<div className="flex w-[296px] shrink-0 flex-col border-r border-border/50 bg-background xl:w-[312px]">
			<div className="space-y-3 border-b border-border/50 px-4 py-4">
				<div className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
					AI Chat
				</div>
				<button
					type="button"
					onClick={onNew}
					disabled={disabled}
					className="flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-50"
				>
					<Plus className="h-4 w-4" />
					New Chat
				</button>
				<div className="relative">
					<Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
					<input
						value={query}
						onChange={(event) => setQuery(event.target.value)}
						placeholder="Search chats..."
						className="w-full rounded-lg border border-border bg-background py-2 pl-9 pr-3 text-sm outline-none transition-colors focus:bg-accent/40"
					/>
				</div>
			</div>

			<div className="flex-1 overflow-y-auto px-2 py-3">
				{[...grouped.entries()].map(([group, list]) => (
					<div key={group} className="mb-5 last:mb-0">
						<div className="px-2 pb-2 text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
							{group}
						</div>
						<div className="space-y-1">
							{list.map((session) => {
								const activity = sessionActivity[session.id];
								const isRunning = activity?.isRunning;
								const runningAgents = activity?.runningAgents || 0;
								const hasError = activity?.hasError;
								const hasPendingPermission = activity?.hasPendingPermission;
								const hasPendingQuestion = activity?.hasPendingQuestion;
								const secondaryText = isRunning
									? runningAgents > 0
										? formatActivityLabel(runningAgents)
										: "Generating..."
									: hasError
										? "Attention needed"
										: hasPendingPermission
											? "Permission required"
											: hasPendingQuestion
												? "Question pending"
												: getSessionSortDate(session).toLocaleTimeString([], {
														hour: "2-digit",
														minute: "2-digit",
													});

								return (
									<div
										key={session.id}
										className={cn(
											"group rounded-lg border px-3 py-2.5 transition-colors",
											activeId === session.id
												? "border-border bg-accent/60"
												: "border-transparent hover:border-border/60 hover:bg-accent/40",
										)}
									>
										{editingId === session.id ? (
											<div className="flex items-center gap-2">
												<input
													value={editTitle}
													onChange={(event) => setEditTitle(event.target.value)}
													onKeyDown={(event) => {
														if (event.key === "Enter" && editTitle.trim()) {
															onRename(session.id, editTitle.trim());
															setEditingId(null);
														}
														if (event.key === "Escape") {
															setEditingId(null);
														}
													}}
													autoFocus
													className="flex-1 rounded-md border border-border bg-background px-3 py-1.5 text-sm outline-none focus:bg-accent/40"
												/>
												<button
													type="button"
													onClick={() => {
														if (!editTitle.trim()) return;
														onRename(session.id, editTitle.trim());
														setEditingId(null);
													}}
													className="rounded-md p-1 hover:bg-accent"
												>
													<Check className="h-3.5 w-3.5 text-emerald-500" />
												</button>
												<button
													type="button"
													onClick={() => setEditingId(null)}
													className="rounded-md p-1 hover:bg-accent"
												>
													<X className="h-3.5 w-3.5 text-muted-foreground" />
												</button>
											</div>
										) : (
											<div className="flex items-start gap-2">
												<button
													type="button"
													onClick={() => onSelect(session.id)}
													className="flex min-w-0 flex-1 items-start gap-2 text-left"
												>
													<div className="relative mt-0.5 shrink-0">
														<MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
														{isRunning && (
															<span className="absolute -right-1 -top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-primary text-primary-foreground">
																<Loader2 className="h-2.5 w-2.5 animate-spin" />
															</span>
														)}
														{!isRunning && hasError && (
															<span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-red-500" />
														)}
														{!isRunning && !hasError && hasPendingPermission && (
															<span className="absolute -right-1 -top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-amber-500 text-white">
																<AlertCircle className="h-2.5 w-2.5" />
															</span>
														)}
														{!isRunning && !hasError && !hasPendingPermission && hasPendingQuestion && (
															<span className="absolute -right-1 -top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-blue-500 text-white">
																<HelpCircle className="h-2.5 w-2.5" />
															</span>
														)}
													</div>
													<div className="min-w-0 flex-1">
														<div className="flex items-center gap-2">
															<div className="truncate text-[13px] font-medium text-foreground">
																{session.title}
															</div>
															{runningAgents > 0 && (
																<span className="shrink-0 rounded-md border border-primary/20 bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-primary">
																	{formatAgentBadgeLabel(runningAgents)}
																</span>
															)}
														</div>
													<div
														className={cn(
															"truncate pt-0.5 text-[11px]",
															isRunning
																? "font-medium text-primary"
																: hasError
																	? "text-red-500"
																	: hasPendingPermission
																		? "font-medium text-amber-500"
																		: hasPendingQuestion
																			? "font-medium text-blue-500"
																			: "text-muted-foreground",
														)}
													>
															{secondaryText}
														</div>
													</div>
												</button>
												<div className="hidden shrink-0 items-center gap-1 group-hover:flex">
													<button
														type="button"
														onClick={() => {
															setEditingId(session.id);
															setEditTitle(session.title);
														}}
														disabled={actionsDisabled}
													className="rounded-md p-1 hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40"
												>
														<Pencil className="h-3.5 w-3.5 text-muted-foreground" />
													</button>
													<button
														type="button"
														onClick={() => onDelete(session.id)}
														disabled={actionsDisabled}
													className="rounded-md p-1 hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40"
												>
														<Trash2 className="h-3.5 w-3.5 text-red-500" />
													</button>
												</div>
											</div>
										)}
									</div>
								);
							})}
						</div>
					</div>
				))}

				{filteredSessions.length === 0 && (
					<div className="px-3 py-10 text-center text-xs text-muted-foreground">
						No chats yet. Start a new conversation.
					</div>
				)}
			</div>
		</div>
	);
}
