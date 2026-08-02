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
	await page.getByRole("button", { name: "Save link" }).click();
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
		await page.getByLabel("Image").setInputFiles(imagePath);
		await page.getByRole("button", { name: "Save changes" }).click();
		await expect(page.getByText("Edited link")).toBeVisible();
	} finally {
		rmSync(imageDir, { recursive: true, force: true });
	}
});
