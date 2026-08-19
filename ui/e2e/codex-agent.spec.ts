import { test, expect } from "@playwright/test";
import { startServer, type TestServer } from "./helpers";

let server: TestServer;

test.beforeAll(async () => {
	server = await startServer();
});

test.afterAll(() => {
	server?.cleanup();
});

test("guides setup when Codex is missing", async ({ page }) => {
	await page.route("**/api/codex/status", (route) => route.fulfill({
		json: {
			installed: false,
			loggedIn: false,
			installCommand: "curl -fsSL https://chatgpt.com/codex/install.sh | sh",
			loginCommand: "codex",
			docsUrl: "https://developers.openai.com/codex/cli",
		},
	}));
	await page.goto(`${server.baseURL}/config`);
	await page.getByRole("button", { name: "AI", exact: true }).click();
	await expect(page.getByRole("heading", { name: "Codex", exact: true })).toBeVisible();
	await expect(page.getByText("Codex is not installed", { exact: true })).toBeVisible();
	await expect(page.getByText("curl -fsSL", { exact: false })).toBeVisible();
});

