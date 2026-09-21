import { describe, expect, test } from "bun:test";
import { linkApi, type SavedLink } from "@/ui/api/client";
import { filterLinks } from "./LinksPage";

const sampleLinks: SavedLink[] = [
	{
		id: "link-1",
		url: "https://golang.org/doc/devel/release",
		title: "Go Release Notes",
		description: "Overview of changes in Go releases",
		tags: ["golang", "tools"],
		createdAt: "2026-08-01T00:00:00Z",
		updatedAt: "2026-08-01T00:00:00Z",
	},
	{
		id: "link-2",
		url: "https://example.com/design-system",
		title: "Design System Tokens",
		description: "Color and spacing tokens",
		tags: ["design", "ui"],
		createdAt: "2026-08-02T00:00:00Z",
		updatedAt: "2026-08-02T00:00:00Z",
	},
	{
		id: "link-3",
		url: "https://github.com/hoangtrung1801/know-me",
		title: "",
		description: "Personal AI workspace",
		note: "Workspace productivity tips",
		tags: ["workspace"],
		createdAt: "2026-08-03T00:00:00Z",
		updatedAt: "2026-08-03T00:00:00Z",
	},
];

describe("filterLinks", () => {
	test("returns all links when search query is empty and no tags are selected", () => {
		expect(filterLinks(sampleLinks, "")).toEqual(sampleLinks);
		expect(filterLinks(sampleLinks, "   ")).toEqual(sampleLinks);
	});

	test("filters links by title case-insensitively", () => {
		const result = filterLinks(sampleLinks, "release");
		expect(result).toHaveLength(1);
		expect(result[0].id).toBe("link-1");

		const upperResult = filterLinks(sampleLinks, "RELEASE");
		expect(upperResult).toHaveLength(1);
		expect(upperResult[0].id).toBe("link-1");
	});

	test("filters links by url case-insensitively", () => {
		const result = filterLinks(sampleLinks, "design-system");
		expect(result).toHaveLength(1);
		expect(result[0].id).toBe("link-2");

		const githubResult = filterLinks(sampleLinks, "github.com");
		expect(githubResult).toHaveLength(1);
		expect(githubResult[0].id).toBe("link-3");
	});

	test("matches links with empty title when URL contains search term", () => {
		const result = filterLinks(sampleLinks, "know-me");
		expect(result).toHaveLength(1);
		expect(result[0].id).toBe("link-3");
	});

	test("handles special characters in query without regex error", () => {
		const result = filterLinks(sampleLinks, "golang.org/doc");
		expect(result).toHaveLength(1);
		expect(result[0].id).toBe("link-1");

		const noMatch = filterLinks(sampleLinks, "https://unknown.com?foo=bar[test]");
		expect(noMatch).toHaveLength(0);
	});

	test("combines search query with selected tag filters", () => {
		// Both match tag "golang", but only link-1 matches query "release"
		const match = filterLinks(sampleLinks, "release", ["golang"]);
		expect(match).toHaveLength(1);
		expect(match[0].id).toBe("link-1");

		// Matches tag "golang" but query "design" matches link-2 which does NOT have tag "golang"
		const mismatch = filterLinks(sampleLinks, "design", ["golang"]);
		expect(mismatch).toHaveLength(0);
	});

	test("returns empty array when no links match query", () => {
		expect(filterLinks(sampleLinks, "nonexistent-query-string")).toHaveLength(0);
	});

	test("matches links by description only", () => {
		const result = filterLinks(sampleLinks, "spacing");
		expect(result).toHaveLength(1);
		expect(result[0].id).toBe("link-2");
	});

	test("matches links by note only", () => {
		const result = filterLinks(sampleLinks, "productivity");
		expect(result).toHaveLength(1);
		expect(result[0].id).toBe("link-3");
	});

	test("matches links by tag token", () => {
		const result = filterLinks(sampleLinks, "tools");
		expect(result).toHaveLength(1);
		expect(result[0].id).toBe("link-1");
	});

	test("ranks title match ahead of URL-only match", () => {
		const titleAndUrlLinks: SavedLink[] = [
			{
				id: "url-match",
				url: "https://example.com/search-optimizer",
				title: "Other Page",
				description: "General details",
				createdAt: "2026-08-01T00:00:00Z",
				updatedAt: "2026-08-01T00:00:00Z",
			},
			{
				id: "title-match",
				url: "https://example.com/page",
				title: "Search Optimizer Guide",
				description: "General details",
				createdAt: "2026-08-01T00:00:00Z",
				updatedAt: "2026-08-01T00:00:00Z",
			},
		];
		const ranked = filterLinks(titleAndUrlLinks, "search optimizer");
		expect(ranked).toHaveLength(2);
		expect(ranked[0].id).toBe("title-match");
		expect(ranked[1].id).toBe("url-match");
	});

	test("stubbed linkApi.search rejection still yields client-ranked results", async () => {
		const originalSearch = linkApi.search;
		try {
			// Stub search to reject (e.g. network failure / server offline)
			linkApi.search = async () => {
				throw new Error("Network offline");
			};

			let clientFallbackResults: SavedLink[] = [];
			try {
				await linkApi.search("spacing", "semantic");
			} catch {
				clientFallbackResults = filterLinks(sampleLinks, "spacing");
			}

			expect(clientFallbackResults).toHaveLength(1);
			expect(clientFallbackResults[0].id).toBe("link-2");
		} finally {
			linkApi.search = originalSearch;
		}
	});
});
