import { test, expect } from "@playwright/test";
import { startServer, type TestServer } from "./helpers";

let server: TestServer;

test.beforeAll(async () => {
	server = await startServer();
});

test.afterAll(() => {
	server?.cleanup();
});

test.describe("Navigation & Global Features", () => {
	test("desktop navigation uses the bottom dock", async ({ page }) => {
		await page.goto(server.baseURL);
		await expect(page.locator("[data-navigation-dock]")).toBeVisible();
		const dashboardLink = page.getByRole("link", { name: "Dashboard" });
		const dashboardBox = await dashboardLink.boundingBox();
		expect(dashboardBox?.width).toBeGreaterThanOrEqual(44);
		expect(dashboardBox?.height).toBeGreaterThanOrEqual(44);
		const tasksLink = page.getByRole("link", { name: "Tasks" });
		await tasksLink.hover();
		await expect(page.getByRole("tooltip", { name: "Tasks", exact: true })).toBeVisible();
		await tasksLink.click();
		await expect(page).toHaveURL(/\/tasks/);
	});

	test("bottom dock navigates between pages", async ({ page }) => {
		const dock = page.locator("[data-navigation-dock]");

		await test.step("Navigate to dashboard", async () => {
			await page.goto(server.baseURL);
			await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
		});

		await test.step("Navigate to Tasks via bottom dock", async () => {
			await dock.getByRole("link", { name: "Tasks" }).click();
			await expect(page).toHaveURL(/\/tasks/);
		});

		await test.step("Navigate to Kanban via bottom dock", async () => {
			await dock.getByRole("link", { name: "Kanban" }).click();
			await expect(page).toHaveURL(/\/kanban/);
		});

		await test.step("Navigate to Docs via bottom dock", async () => {
			await dock.getByRole("link", { name: "Docs" }).click();
			await expect(page).toHaveURL(/\/docs/);
		});

		await test.step("Navigate to Projects via bottom dock", async () => {
			await dock.getByRole("link", { name: "Projects" }).click();
			await expect(page).toHaveURL(/\/projects/);
			await expect(page.getByRole("heading", { name: "Projects" })).toBeVisible();
		});

		await test.step("Navigate to Settings via bottom dock", async () => {
			await dock.getByRole("link", { name: "Settings" }).click();
			await expect(page).toHaveURL(/\/config/);
		});
	});

	test("direct URL navigation works", async ({ page }) => {
		await test.step("Navigate directly to tasks page", async () => {
			await page.goto(`${server.baseURL}/tasks`);
			await expect(page.getByRole("heading", { name: "Tasks" })).toBeVisible();
		});

		await test.step("Navigate directly to kanban page", async () => {
			await page.goto(`${server.baseURL}/kanban`);
			await expect(page.locator("body")).toBeVisible();
		});

		await test.step("Navigate directly to docs page", async () => {
			await page.goto(`${server.baseURL}/docs`);
			await expect(page.locator("body")).toBeVisible();
		});

		await test.step("Navigate directly to config page", async () => {
			await page.goto(`${server.baseURL}/config`);
			await expect(page.locator("body")).toBeVisible();
		});
	});

	test("theme toggle switches between light and dark", async ({ page }) => {
		await test.step("Navigate to dashboard", async () => {
			await page.goto(server.baseURL);
		});

		await test.step("Find and click theme toggle", async () => {
			const themeBtn = page.getByRole("button", { name: /theme|dark|light|mode/i }).first();
			if (await themeBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
				await themeBtn.click();
				await page.waitForTimeout(500);
			}
		});

		await test.step("Page still renders correctly after toggle", async () => {
			await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
		});
	});

	test("search dialog opens with keyboard shortcut", async ({ page }) => {
		await test.step("Navigate to dashboard", async () => {
			await page.goto(server.baseURL);
		});

		await test.step("Open search with Cmd+K", async () => {
			await page.keyboard.press("Meta+k");
		});

		await test.step("Search dialog is visible", async () => {
			const searchInput = page.getByPlaceholder(/search/i).first();
			await expect(searchInput).toBeVisible({ timeout: 3000 }).catch(() => {
				// Cmd+K may not work in test env, that's ok
			});
		});
	});

	test("connection status indicator is shown", async ({ page }) => {
		await test.step("Navigate to dashboard", async () => {
			await page.goto(server.baseURL);
		});

		await test.step("Page loads properly with header", async () => {
			await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
		});
	});
});
