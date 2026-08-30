import { test, expect } from "@playwright/test";
import { startServer, type TestServer } from "./helpers";

let server: TestServer;

test.beforeAll(async () => {
	server = await startServer();
});

test.afterAll(() => {
	server?.cleanup();
});

test.describe("Documentation Page", () => {
	test("shows docs page with file manager", async ({ page }) => {
		await test.step("Navigate to docs page", async () => {
			await page.goto(`${server.baseURL}/docs`);
		});

		await test.step("Docs page loads", async () => {
			await expect(page.locator("body")).toBeVisible();
		});
	});

	test("displays documents created via CLI", async ({ page }) => {
		await test.step("Create a doc via CLI", async () => {
			server.cli('doc create "Test Guide" -d "A test guide document" -t "guide"');
		});

		await test.step("Navigate to docs page", async () => {
			await page.goto(`${server.baseURL}/docs`);
		});

		await test.step("Document appears in file manager", async () => {
			await expect(page.getByText("Test Guide").first()).toBeVisible();
		});
	});

	test("opens document for viewing", async ({ page }) => {
		await test.step("Create a doc with content via CLI", async () => {
			server.cli('doc create "View Doc" -d "Doc with content" -t "test"');
			try {
				server.cli('doc edit "view-doc" -c "## Hello World\n\nThis is test content."');
			} catch {
				// path may differ
				server.cli('doc edit "View Doc" -c "## Hello World\n\nThis is test content."');
			}
		});

		await test.step("Navigate to docs page", async () => {
			await page.goto(`${server.baseURL}/docs`);
		});

		await test.step("Click on the document", async () => {
			await page.getByText("View Doc").first().click();
		});

		await test.step("Document content is displayed", async () => {
			await expect(page.getByRole("heading", { name: "Hello World" })).toBeVisible();
		});
	});

	test("shows multiple docs in file tree", async ({ page }) => {
		await test.step("Create multiple docs via CLI", async () => {
			server.cli('doc create "API Reference" -d "API docs" -t "api"');
			server.cli('doc create "Setup Guide" -d "Setup instructions" -t "guide"');
		});

		await test.step("Navigate to docs page", async () => {
			await page.goto(`${server.baseURL}/docs`);
		});

		await test.step("All docs are listed", async () => {
			await expect(page.getByText("API Reference")).toBeVisible();
			await expect(page.getByText("Setup Guide")).toBeVisible();
		});
	});
	test("sorts documents by most recently edited", async ({ page }) => {
		server.cli('doc create "Zeta Edited Doc" -d "Edited later"');
		server.cli('doc create "Alpha Older Doc" -d "Created later but not edited"');
		await page.waitForTimeout(1100);
		server.cli('doc edit "zeta-edited-doc" -c "# Updated content"');

		await page.goto(`${server.baseURL}/docs`);
		await expect(page.getByPlaceholder("Search docs, paths, tags...")).toBeVisible();

		const rows = page.locator("[data-docs-entries] > div > button");
		const titles = await rows.allTextContents();
		const editedIndex = titles.findIndex((text) => text.includes("Zeta Edited Doc"));
		const olderIndex = titles.findIndex((text) => text.includes("Alpha Older Doc"));

		expect(editedIndex).toBeGreaterThanOrEqual(0);
		expect(olderIndex).toBeGreaterThanOrEqual(0);
		expect(editedIndex).toBeLessThan(olderIndex);
	});
});
