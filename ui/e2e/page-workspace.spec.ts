import { test, expect } from "@playwright/test";
import { startServer, type TestServer } from "./helpers";

let server: TestServer;

test.beforeAll(async () => {
	server = await startServer();
});

test.afterAll(() => {
	server?.cleanup();
});

test.describe("Persistent app pages", () => {
	test("keeps visited page controls alive while switching pages", async ({ page }) => {
		await page.goto(`${server.baseURL}/tasks`);
		await expect(page.getByRole("heading", { name: "Tasks" })).toBeVisible();

		const lifecycleFilter = page.locator("#task-lifecycle-filter");
		await lifecycleFilter.selectOption("active");

		await page.getByRole("link", { name: "Docs" }).click();
		await expect(page).toHaveURL(/\/docs/);
		await expect(page.locator("body")).toBeVisible();

		await page.getByRole("link", { name: "Tasks" }).click();
		await expect(page).toHaveURL(/\/tasks/);
		await expect(lifecycleFilter).toHaveValue("active");
	});

	test("restores safe UI state after a browser reload", async ({ page }) => {
		await page.goto(`${server.baseURL}/tasks`);
		await expect(page.getByRole("heading", { name: "Tasks" })).toBeVisible();
		await page.locator("#task-lifecycle-filter").selectOption("done");

		await page.reload();
		await expect(page.getByRole("heading", { name: "Tasks" })).toBeVisible();
		await expect(page.locator("#task-lifecycle-filter")).toHaveValue("done");
	});

	test("visits every primary destination without losing the app shell", async ({ page }) => {
		await page.goto(server.baseURL);
		for (const label of [
			"Dashboard",
			"Projects",
			"Kanban",
			"Tasks",
			"Docs",
			"Graph",
			"Memories",
			"Saved Links",
			"Memos",
			"System Decisions",
			"Audit Trail",
			"Settings",
		]) {
			const link = page.getByRole("link", { name: label }).first();
			await link.click();
			await expect(page.locator("body")).toBeVisible();
		}
	});
});
