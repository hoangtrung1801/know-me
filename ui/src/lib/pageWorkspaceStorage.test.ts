import { describe, expect, test } from "bun:test";
import {
	PAGE_WORKSPACE_STORAGE_KEY,
	createEmptyPageWorkspaceSnapshot,
	decodePageWorkspaceSnapshot,
	encodePageWorkspaceSnapshot,
	readPageWorkspaceSnapshot,
	writePageWorkspaceSnapshot,
} from "./pageWorkspaceStorage";

function createMemoryStorage(): Storage {
	const values = new Map<string, string>();
	return {
		get length() {
			return values.size;
		},
		clear: () => values.clear(),
		getItem: (key) => values.get(key) ?? null,
		key: (index) => [...values.keys()][index] ?? null,
		removeItem: (key) => values.delete(key),
		setItem: (key, value) => values.set(key, value),
	};
}

describe("page workspace storage", () => {
	test("round trips safe routes and page UI state", () => {
		const snapshot = createEmptyPageWorkspaceSnapshot("workspace-a");
		snapshot.routes.docs = {
			pathname: "/docs/specs/overview",
			search: "?L=12",
			hash: "#intro",
		};
		snapshot.pages.tasks = { filters: { lifecycle: "active" } };

		const decoded = decodePageWorkspaceSnapshot(
			encodePageWorkspaceSnapshot(snapshot),
			"workspace-a",
		);

		expect(decoded).toEqual(snapshot);
	});

	test("rejects malformed, unsupported, and cross-workspace snapshots", () => {
		expect(decodePageWorkspaceSnapshot("not-json", "workspace-a")).toBeNull();
		expect(
			decodePageWorkspaceSnapshot(
				JSON.stringify({ version: 99, workspaceKey: "workspace-a" }),
				"workspace-a",
			),
		).toBeNull();
		expect(
			decodePageWorkspaceSnapshot(
				JSON.stringify({ version: 1, workspaceKey: "workspace-b" }),
				"workspace-a",
			),
		).toBeNull();
	});

	test("reads and writes the versioned session storage key", () => {
		const storage = createMemoryStorage();
		const snapshot = createEmptyPageWorkspaceSnapshot("workspace-a");

		expect(readPageWorkspaceSnapshot("workspace-a", storage)).toEqual(snapshot);
		expect(writePageWorkspaceSnapshot(snapshot, storage)).toBe(true);
		expect(storage.getItem(PAGE_WORKSPACE_STORAGE_KEY)).not.toBeNull();
		expect(readPageWorkspaceSnapshot("workspace-a", storage)).toEqual(snapshot);
	});

	test("fails safely when storage access throws", () => {
		const throwingStorage = {
			getItem: () => { throw new Error("blocked"); },
			setItem: () => { throw new Error("blocked"); },
		} as unknown as Storage;

		expect(readPageWorkspaceSnapshot("workspace-a", throwingStorage)).toEqual(
			createEmptyPageWorkspaceSnapshot("workspace-a"),
		);
		expect(
			writePageWorkspaceSnapshot(
				createEmptyPageWorkspaceSnapshot("workspace-a"),
				throwingStorage,
			),
		).toBe(false);
	});
});
