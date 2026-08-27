import { describe, expect, test } from "bun:test";
import {
	createPageWorkspaceState,
	pageIdFromPath,
	transitionPageWorkspace,
} from "./PageWorkspaceContext";

describe("page workspace lifecycle", () => {
	test("maps nested routes to stable primary page identities", () => {
		expect(pageIdFromPath("/")).toBe("dashboard");
		expect(pageIdFromPath("/docs/specs/overview")).toBe("docs");
		expect(pageIdFromPath("/tasks/task-123")).toBe("tasks");
		expect(pageIdFromPath("/chat/session-123")).toBe("chat");
		expect(pageIdFromPath("/unknown/path")).toBe("dashboard");
	});

	test("retains visited pages and increments activation on reactivation", () => {
		let state = createPageWorkspaceState("dashboard");

		state = transitionPageWorkspace(state, "docs");
		expect(state.activePage).toBe("docs");
		expect(state.visitedPages).toEqual(new Set(["dashboard", "docs"]));
		expect(state.activationIds.docs).toBe(0);

		state = transitionPageWorkspace(state, "tasks");
		state = transitionPageWorkspace(state, "docs");
		expect(state.visitedPages).toEqual(new Set(["dashboard", "docs", "tasks"]));
		expect(state.activationIds.docs).toBe(1);
		expect(state.activationIds.tasks).toBe(0);
});

	test("does not create a new activation when the current page is selected again", () => {
		const state = createPageWorkspaceState("docs");
		expect(transitionPageWorkspace(state, "docs")).toEqual(state);
	});
});
