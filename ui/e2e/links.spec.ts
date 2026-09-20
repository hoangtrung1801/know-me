import { test, expect } from "@playwright/test";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { startServer, type TestServer } from "./helpers";

let server: TestServer;

test.beforeAll(async () => { server = await startServer(); });
test.afterAll(() => { server?.cleanup(); });

test("links can be added from the web app", async ({ page }) => {
	await page.goto(`${server.baseURL}/links`);
	await page.getByRole("button", { name: "Add Link" }).click();
	await page.getByLabel("URL").fill("https://example.com/new-link");
	await page.getByLabel("Note").fill("Keep this for the launch checklist");
	await page.getByRole("button", { name: "Save link" }).click();
	await expect(page.getByText("Keep this for the launch checklist")).toBeVisible();
	await expect(page.getByRole("link", { name: /example\.com\/new-link/ })).toBeVisible();
});

test("saved link cards can be edited with an imported image", async ({ page }) => {
	server.cli('link add "https://example.com/article" --json');
	const imageDir = mkdtempSync(join(tmpdir(), "knowns-link-e2e-"));
	const imagePath = join(imageDir, "pixel.png");
	writeFileSync(imagePath, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
	try {
		await page.goto(`${server.baseURL}/links`);
		await expect(page.getByRole("heading", { name: "Saved links" })).toBeVisible();
		await expect(page.getByText("example.com/article")).toBeVisible();
		await page.getByRole("article").filter({ hasText: "https://example.com/article" }).getByRole("button", { name: /Edit/ }).click();
		await page.getByLabel("Title").fill("Edited link");
		await page.getByLabel("Description").fill("Edited description");
		await page.getByLabel("Note").fill("Remember this reference");
		await page.getByLabel("Image").setInputFiles(imagePath);
		await page.getByRole("button", { name: "Save changes" }).click();
		await expect(page.getByText("Edited link")).toBeVisible();
		await expect(page.getByText("Remember this reference")).toBeVisible();
	} finally {
		rmSync(imageDir, { recursive: true, force: true });
	}
});

test("saved link cards show automatic tags", async ({ page }) => {
	await page.route("**/api/links", (route) => route.fulfill({ json: [{
		id: "link1", url: "https://example.com", title: "Example", description: "",
		tags: ["golang", "release"], createdAt: "2026-08-03T00:00:00Z", updatedAt: "2026-08-03T00:00:00Z",
	}] }));
	await page.goto(`${server.baseURL}/links`);
	await expect(page.getByRole("article").getByText("golang", { exact: true })).toBeVisible();
	await expect(page.getByRole("article").getByText("release", { exact: true })).toBeVisible();
});

test("saved link cards open a detail dialog", async ({ page }) => {
	await page.route("**/api/links", (route) => route.fulfill({ json: [{
		id: "link1",
		url: "https://example.com/reference",
		title: "Reference article",
		description: "A useful reference for the launch plan.",
		note: "Review before launch",
		image: "",
		tags: ["planning"],
		createdAt: "2026-08-03T00:00:00Z",
		updatedAt: "2026-08-03T00:00:00Z",
	}] }));
	await page.goto(`${server.baseURL}/links`);

	const card = page.getByRole("article").filter({ hasText: "Reference article" });
	await card.getByRole("heading", { name: "Reference article" }).click();

	const dialog = page.getByRole("dialog");
	await expect(dialog).toBeVisible();
	await expect(dialog.getByRole("heading", { name: "Reference article" })).toBeVisible();
	await expect(dialog.getByText("A useful reference for the launch plan.")).toBeVisible();
	await expect(dialog.getByText("Review before launch")).toBeVisible();
	await expect(dialog.getByText("planning", { exact: true })).toBeVisible();
	await expect(dialog.getByRole("link", { name: /Open link/ })).toHaveAttribute("href", "https://example.com/reference");
});

test("saved links can be filtered by tag", async ({ page }) => {
	await page.route("**/api/links", (route) => route.fulfill({ json: [
		{ id: "link1", url: "https://example.com/go", title: "Go release", description: "", tags: ["golang", "release"], createdAt: "2026-08-03T00:00:00Z", updatedAt: "2026-08-03T00:00:00Z" },
		{ id: "link2", url: "https://example.com/design", title: "Design notes", description: "", tags: ["design"], createdAt: "2026-08-03T00:00:00Z", updatedAt: "2026-08-03T00:00:00Z" },
	] }));
	await page.goto(`${server.baseURL}/links`);
	await page.getByRole("button", { name: "golang" }).click();
	await expect(page.getByText("Go release")).toBeVisible();
	await expect(page.getByText("Design notes")).not.toBeVisible();
	await page.getByRole("button", { name: "All tags" }).click();
	await expect(page.getByText("Design notes")).toBeVisible();
});

test("saved links can be searched by title and url", async ({ page }) => {
	await page.route("**/api/links", (route) => route.fulfill({ json: [
		{ id: "link1", url: "https://golang.org/doc/devel", title: "Go release notes", description: "", tags: ["golang"], createdAt: "2026-08-03T00:00:00Z", updatedAt: "2026-08-03T00:00:00Z" },
		{ id: "link2", url: "https://example.com/design-tokens", title: "Design tokens", description: "", tags: ["design"], createdAt: "2026-08-03T00:00:00Z", updatedAt: "2026-08-03T00:00:00Z" },
		{ id: "link3", url: "https://github.com/hoangtrung1801/know-me", title: "", description: "", tags: ["workspace"], createdAt: "2026-08-03T00:00:00Z", updatedAt: "2026-08-03T00:00:00Z" },
	] }));
	await page.goto(`${server.baseURL}/links`);

	const searchInput = page.getByLabel("Search links");
	await expect(searchInput).toBeVisible();

	// Search by title
	await searchInput.fill("release");
	await expect(page.getByText("Go release notes")).toBeVisible();
	await expect(page.getByText("Design tokens")).not.toBeVisible();
	await expect(page.getByText("github.com/hoangtrung1801/know-me")).not.toBeVisible();

	// Search by URL
	await searchInput.fill("design-tokens");
	await expect(page.getByText("Design tokens")).toBeVisible();
	await expect(page.getByText("Go release notes")).not.toBeVisible();

	// Search by URL for link without title
	await searchInput.fill("github.com");
	await expect(page.getByRole("heading", { name: /github\.com/ })).toBeVisible();
	await expect(page.getByText("Design tokens")).not.toBeVisible();

	// Clear search via clear button
	await page.getByLabel("Clear search").click();
	await expect(searchInput).toHaveValue("");
	await expect(page.getByText("Go release notes")).toBeVisible();
	await expect(page.getByText("Design tokens")).toBeVisible();
	await expect(page.getByRole("heading", { name: /github\.com/ })).toBeVisible();

	// No match empty state
	await searchInput.fill("nonexistent");
	await expect(page.getByText("No links match your search.")).toBeVisible();
	await page.locator(".border-dashed").getByRole("button", { name: "Clear search" }).click();
	await expect(page.getByText("Go release notes")).toBeVisible();
});
