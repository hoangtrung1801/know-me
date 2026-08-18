import { test, expect } from "@playwright/test";
import { startServer, type TestServer } from "./helpers";

let server: TestServer;
test.beforeAll(async () => { server = await startServer(); });
test.afterAll(() => { server?.cleanup(); });

test("memos can be added, searched, edited, and deleted", async ({ page }) => {
	await page.goto(`${server.baseURL}/memos`);
	await page.getByLabel("New memo").fill("# Morning\n\nCoffee note");
	await page.getByRole("button", { name: "Add memo" }).click();
	await expect(page.getByRole("heading", { name: "Today" })).toBeVisible();
	await expect(page.getByRole("heading", { name: "Morning" })).toBeVisible();
	await page.getByLabel("Search memos").fill("coffee");
	await expect(page.getByRole("article").filter({ hasText: "Coffee note" })).toBeVisible();
	const card = page.getByRole("article").first();
	await card.getByRole("button", { name: "Edit memo" }).click();
	await card.getByLabel("Edit memo").fill("Edited **memo**");
	await card.getByRole("button", { name: "Save memo" }).click();
	await expect(card.getByText("Edited memo")).toBeVisible();
	await page.getByLabel("Search memos").fill("");
	await card.getByRole("button", { name: "Delete memo" }).click();
	await page.getByRole("button", { name: "Delete permanently" }).click();
	await expect(page.getByText("No memos yet")).toBeVisible();
});

test("memos can be filtered by hashtag", async ({ page }) => {
	await page.route("**/api/memos", (route) => route.fulfill({ json: [
		{ id: "memo-work", content: "Ship #work", createdAt: "2026-08-03T00:00:00Z", updatedAt: "2026-08-03T00:00:00Z" },
		{ id: "memo-home", content: "Clean #home", createdAt: "2026-08-03T00:00:00Z", updatedAt: "2026-08-03T00:00:00Z" },
		{ id: "memo-heading", content: "# Heading", createdAt: "2026-08-03T00:00:00Z", updatedAt: "2026-08-03T00:00:00Z" },
	] }));
	await page.goto(`${server.baseURL}/memos`);
	await page.getByRole("button", { name: "work" }).click();
	await expect(page.getByText("Ship #work")).toBeVisible();
	await expect(page.getByText("Clean #home")).not.toBeVisible();
	await expect(page.getByRole("button", { name: "Heading" })).not.toBeVisible();
	await page.getByRole("button", { name: "All tags" }).click();
	await expect(page.getByText("Clean #home")).toBeVisible();
});
