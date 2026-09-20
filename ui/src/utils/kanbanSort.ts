import type { Task } from "../models/task";

export type KanbanSortOption =
	| "manual"
	| "priority-desc"
	| "priority-asc"
	| "created-desc"
	| "created-asc"
	| "updated-desc"
	| "updated-asc"
	| "title-asc"
	| "title-desc";

export interface SortOptionMeta {
	value: KanbanSortOption;
	label: string;
	shortLabel: string;
	group: "manual" | "priority" | "date" | "title";
	field: "manual" | "priority" | "createdAt" | "updatedAt" | "title";
	direction?: "asc" | "desc";
}

export const KANBAN_SORT_OPTIONS: readonly SortOptionMeta[] = [
	{
		value: "manual",
		label: "Manual order",
		shortLabel: "Manual",
		group: "manual",
		field: "manual",
	},
	{
		value: "priority-desc",
		label: "Severity: High to Low",
		shortLabel: "Severity (High → Low)",
		group: "priority",
		field: "priority",
		direction: "desc",
	},
	{
		value: "priority-asc",
		label: "Severity: Low to High",
		shortLabel: "Severity (Low → High)",
		group: "priority",
		field: "priority",
		direction: "asc",
	},
	{
		value: "created-desc",
		label: "Created: Newest first",
		shortLabel: "Created (Newest)",
		group: "date",
		field: "createdAt",
		direction: "desc",
	},
	{
		value: "created-asc",
		label: "Created: Oldest first",
		shortLabel: "Created (Oldest)",
		group: "date",
		field: "createdAt",
		direction: "asc",
	},
	{
		value: "updated-desc",
		label: "Updated: Newest first",
		shortLabel: "Updated (Newest)",
		group: "date",
		field: "updatedAt",
		direction: "desc",
	},
	{
		value: "updated-asc",
		label: "Updated: Oldest first",
		shortLabel: "Updated (Oldest)",
		group: "date",
		field: "updatedAt",
		direction: "asc",
	},
	{
		value: "title-asc",
		label: "Title: A to Z",
		shortLabel: "Title (A → Z)",
		group: "title",
		field: "title",
		direction: "asc",
	},
	{
		value: "title-desc",
		label: "Title: Z to A",
		shortLabel: "Title (Z → A)",
		group: "title",
		field: "title",
		direction: "desc",
	},
] as const;

const VALID_SORT_OPTIONS = new Set<string>(
	KANBAN_SORT_OPTIONS.map((opt) => opt.value),
);

export function isValidSortOption(value: unknown): value is KanbanSortOption {
	return typeof value === "string" && VALID_SORT_OPTIONS.has(value);
}

export function getSortOptionMeta(value: KanbanSortOption): SortOptionMeta {
	return KANBAN_SORT_OPTIONS.find((opt) => opt.value === value) ?? KANBAN_SORT_OPTIONS[0];
}

export function toggleSortDirection(current: KanbanSortOption): KanbanSortOption {
	switch (current) {
		case "priority-desc":
			return "priority-asc";
		case "priority-asc":
			return "priority-desc";
		case "created-desc":
			return "created-asc";
		case "created-asc":
			return "created-desc";
		case "updated-desc":
			return "updated-asc";
		case "updated-asc":
			return "updated-desc";
		case "title-asc":
			return "title-desc";
		case "title-desc":
			return "title-asc";
		case "manual":
		default:
			return "priority-desc";
	}
}

const PRIORITY_ORDER: Record<string, number> = {
	high: 0,
	medium: 1,
	low: 2,
};

function parseTimestamp(date: Date | string | undefined | null): number {
	if (!date) return 0;
	const time = date instanceof Date ? date.getTime() : new Date(date).getTime();
	return Number.isNaN(time) ? 0 : time;
}

export function sortKanbanTasks(tasks: Task[], sortBy: KanbanSortOption = "manual"): Task[] {
	if (tasks.length <= 1) return tasks;

	return [...tasks].sort((a, b) => {
		switch (sortBy) {
			case "priority-desc": {
				const pa = PRIORITY_ORDER[a.priority] ?? 1;
				const pb = PRIORITY_ORDER[b.priority] ?? 1;
				if (pa !== pb) return pa - pb;
				const updatedDiff = parseTimestamp(b.updatedAt) - parseTimestamp(a.updatedAt);
				if (updatedDiff !== 0) return updatedDiff;
				return a.id.localeCompare(b.id);
			}
			case "priority-asc": {
				const pa = PRIORITY_ORDER[a.priority] ?? 1;
				const pb = PRIORITY_ORDER[b.priority] ?? 1;
				if (pa !== pb) return pb - pa;
				const updatedDiff = parseTimestamp(b.updatedAt) - parseTimestamp(a.updatedAt);
				if (updatedDiff !== 0) return updatedDiff;
				return a.id.localeCompare(b.id);
			}
			case "created-desc": {
				const diff = parseTimestamp(b.createdAt) - parseTimestamp(a.createdAt);
				if (diff !== 0) return diff;
				const pa = PRIORITY_ORDER[a.priority] ?? 1;
				const pb = PRIORITY_ORDER[b.priority] ?? 1;
				if (pa !== pb) return pa - pb;
				return a.id.localeCompare(b.id);
			}
			case "created-asc": {
				const diff = parseTimestamp(a.createdAt) - parseTimestamp(b.createdAt);
				if (diff !== 0) return diff;
				const pa = PRIORITY_ORDER[a.priority] ?? 1;
				const pb = PRIORITY_ORDER[b.priority] ?? 1;
				if (pa !== pb) return pa - pb;
				return a.id.localeCompare(b.id);
			}
			case "updated-desc": {
				const diff = parseTimestamp(b.updatedAt) - parseTimestamp(a.updatedAt);
				if (diff !== 0) return diff;
				const pa = PRIORITY_ORDER[a.priority] ?? 1;
				const pb = PRIORITY_ORDER[b.priority] ?? 1;
				if (pa !== pb) return pa - pb;
				return a.id.localeCompare(b.id);
			}
			case "updated-asc": {
				const diff = parseTimestamp(a.updatedAt) - parseTimestamp(b.updatedAt);
				if (diff !== 0) return diff;
				const pa = PRIORITY_ORDER[a.priority] ?? 1;
				const pb = PRIORITY_ORDER[b.priority] ?? 1;
				if (pa !== pb) return pa - pb;
				return a.id.localeCompare(b.id);
			}
			case "title-asc": {
				const diff = (a.title || "").localeCompare(b.title || "", undefined, { sensitivity: "base" })
					|| (a.title || "").localeCompare(b.title || "");
				if (diff !== 0) return diff;
				const updatedDiff = parseTimestamp(b.updatedAt) - parseTimestamp(a.updatedAt);
				if (updatedDiff !== 0) return updatedDiff;
				return a.id.localeCompare(b.id);
			}
			case "title-desc": {
				const diff = (b.title || "").localeCompare(a.title || "", undefined, { sensitivity: "base" })
					|| (b.title || "").localeCompare(a.title || "");
				if (diff !== 0) return diff;
				const updatedDiff = parseTimestamp(b.updatedAt) - parseTimestamp(a.updatedAt);
				if (updatedDiff !== 0) return updatedDiff;
				return a.id.localeCompare(b.id);
			}
			case "manual":
			default: {
				const hasOrderA = a.order != null;
				const hasOrderB = b.order != null;

				if (hasOrderA && hasOrderB) {
					return a.order! - b.order!;
				}
				if (hasOrderA) return -1;
				if (hasOrderB) return 1;

				const priorityA = PRIORITY_ORDER[a.priority] ?? 2;
				const priorityB = PRIORITY_ORDER[b.priority] ?? 2;
				if (priorityA !== priorityB) {
					return priorityA - priorityB;
				}
				return parseTimestamp(b.updatedAt) - parseTimestamp(a.updatedAt);
			}
		}
	});
}
