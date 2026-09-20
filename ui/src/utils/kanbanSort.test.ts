import { describe, expect, test } from "bun:test";
import type { Task } from "../models/task";
import {
	sortKanbanTasks,
	toggleSortDirection,
	isValidSortOption,
	getSortOptionMeta,
	KANBAN_SORT_OPTIONS,
} from "./kanbanSort";

function makeTask(overrides: Partial<Task> = {}): Task {
	return {
		id: "task-1",
		title: "Task title",
		status: "todo",
		priority: "medium",
		labels: [],
		subtasks: [],
		acceptanceCriteria: [],
		timeSpent: 0,
		timeEntries: [],
		archived: false,
		lifecycleState: "active",
		createdAt: new Date("2026-01-01T10:00:00Z"),
		updatedAt: new Date("2026-01-01T10:00:00Z"),
		...overrides,
	};
}

describe("kanbanSort", () => {
	test("validates sort options correctly", () => {
		expect(isValidSortOption("manual")).toBe(true);
		expect(isValidSortOption("priority-desc")).toBe(true);
		expect(isValidSortOption("priority-asc")).toBe(true);
		expect(isValidSortOption("created-desc")).toBe(true);
		expect(isValidSortOption("created-asc")).toBe(true);
		expect(isValidSortOption("updated-desc")).toBe(true);
		expect(isValidSortOption("updated-asc")).toBe(true);
		expect(isValidSortOption("title-asc")).toBe(true);
		expect(isValidSortOption("title-desc")).toBe(true);
		expect(isValidSortOption("invalid")).toBe(false);
		expect(isValidSortOption(null)).toBe(false);
		expect(isValidSortOption(123)).toBe(false);
	});

	test("returns metadata for sort option", () => {
		const meta = getSortOptionMeta("priority-desc");
		expect(meta.value).toBe("priority-desc");
		expect(meta.label).toContain("Severity");
		const fallback = getSortOptionMeta("invalid" as unknown as KanbanSortOption);
		expect(fallback.value).toBe("manual");
	});

	test("toggles sort direction between asc and desc", () => {
		expect(toggleSortDirection("priority-desc")).toBe("priority-asc");
		expect(toggleSortDirection("priority-asc")).toBe("priority-desc");
		expect(toggleSortDirection("created-desc")).toBe("created-asc");
		expect(toggleSortDirection("created-asc")).toBe("created-desc");
		expect(toggleSortDirection("updated-desc")).toBe("updated-asc");
		expect(toggleSortDirection("updated-asc")).toBe("updated-desc");
		expect(toggleSortDirection("title-asc")).toBe("title-desc");
		expect(toggleSortDirection("title-desc")).toBe("title-asc");
		expect(toggleSortDirection("manual")).toBe("priority-desc");
	});

	test("sorts by manual order matching existing logic", () => {
		const tasks = [
			makeTask({ id: "t1", order: 2 }),
			makeTask({ id: "t2", order: 0 }),
			makeTask({ id: "t3", order: 1 }),
			makeTask({ id: "t4", order: undefined, priority: "high" }),
			makeTask({ id: "t5", order: undefined, priority: "low" }),
		];

		const sorted = sortKanbanTasks(tasks, "manual");
		expect(sorted.map((t) => t.id)).toEqual(["t2", "t3", "t1", "t4", "t5"]);
	});

	test("sorts by severity (priority) desc: high -> medium -> low", () => {
		const tasks = [
			makeTask({ id: "med", priority: "medium" }),
			makeTask({ id: "low", priority: "low" }),
			makeTask({ id: "high", priority: "high" }),
		];

		const sorted = sortKanbanTasks(tasks, "priority-desc");
		expect(sorted.map((t) => t.id)).toEqual(["high", "med", "low"]);
	});

	test("sorts by severity (priority) asc: low -> medium -> high", () => {
		const tasks = [
			makeTask({ id: "med", priority: "medium" }),
			makeTask({ id: "high", priority: "high" }),
			makeTask({ id: "low", priority: "low" }),
		];

		const sorted = sortKanbanTasks(tasks, "priority-asc");
		expect(sorted.map((t) => t.id)).toEqual(["low", "med", "high"]);
	});

	test("sorts by created date desc: newest first", () => {
		const tasks = [
			makeTask({ id: "old", createdAt: new Date("2026-01-01T00:00:00Z") }),
			makeTask({ id: "newest", createdAt: new Date("2026-01-03T00:00:00Z") }),
			makeTask({ id: "mid", createdAt: new Date("2026-01-02T00:00:00Z") }),
		];

		const sorted = sortKanbanTasks(tasks, "created-desc");
		expect(sorted.map((t) => t.id)).toEqual(["newest", "mid", "old"]);
	});

	test("sorts by created date asc: oldest first", () => {
		const tasks = [
			makeTask({ id: "mid", createdAt: new Date("2026-01-02T00:00:00Z") }),
			makeTask({ id: "old", createdAt: new Date("2026-01-01T00:00:00Z") }),
			makeTask({ id: "newest", createdAt: new Date("2026-01-03T00:00:00Z") }),
		];

		const sorted = sortKanbanTasks(tasks, "created-asc");
		expect(sorted.map((t) => t.id)).toEqual(["old", "mid", "newest"]);
	});

	test("sorts by updated date desc: newest updated first", () => {
		const tasks = [
			makeTask({ id: "old-up", updatedAt: new Date("2026-01-01T00:00:00Z") }),
			makeTask({ id: "new-up", updatedAt: new Date("2026-01-05T00:00:00Z") }),
		];

		const sorted = sortKanbanTasks(tasks, "updated-desc");
		expect(sorted.map((t) => t.id)).toEqual(["new-up", "old-up"]);
	});

	test("sorts by updated date asc: oldest updated first", () => {
		const tasks = [
			makeTask({ id: "new-up", updatedAt: new Date("2026-01-05T00:00:00Z") }),
			makeTask({ id: "old-up", updatedAt: new Date("2026-01-01T00:00:00Z") }),
		];

		const sorted = sortKanbanTasks(tasks, "updated-asc");
		expect(sorted.map((t) => t.id)).toEqual(["old-up", "new-up"]);
	});

	test("sorts by title alphabetically asc and desc", () => {
		const tasks = [
			makeTask({ id: "b", title: "Beta" }),
			makeTask({ id: "a", title: "Alpha" }),
			makeTask({ id: "c", title: "Gamma" }),
		];

		expect(sortKanbanTasks(tasks, "title-asc").map((t) => t.id)).toEqual(["a", "b", "c"]);
		expect(sortKanbanTasks(tasks, "title-desc").map((t) => t.id)).toEqual(["c", "b", "a"]);
	});
});
