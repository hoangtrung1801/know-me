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
