import { expect, test, type Page } from "@playwright/test";
import { startServer, type TestServer } from "./helpers";

let server: TestServer;

async function cssVar(page: Page, name: string) {
	return page.locator("html").evaluate(
		(element, token) => getComputedStyle(element).getPropertyValue(token).trim(),
		name,
	);
}

function luminance(hex: string) {
	const channels = [1, 3, 5]
		.map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255)
		.map((value) => (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4));
	return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!;
}

function contrast(foreground: string, background: string) {
	const [lighter, darker] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
	return (lighter! + 0.05) / (darker! + 0.05);
}

test.beforeAll(async () => {
	server = await startServer();
	server.cli('task create "Quiet Paper Task" -d "Visual contract" --priority high');
	server.cli('doc create "Quiet Paper Doc" -d "Visual contract" -t "design"');
	server.cli('memo add "Quiet Paper memo"');
});

test.afterAll(() => server?.cleanup());

test("uses the approved light and dark theme tokens", async ({ page }) => {
	await page.goto(server.baseURL);
	await page.evaluate(() => localStorage.removeItem("theme"));
	await page.reload();
	expect(await cssVar(page, "--background")).toBe("#fbfaf8");
	expect(await cssVar(page, "--foreground")).toBe("#37352f");
	expect(await cssVar(page, "--sidebar")).toBe("#f7f6f3");
	expect(await cssVar(page, "--border")).toBe("#e7e4df");

	await page.getByRole("switch", { name: "Switch to dark mode" }).click();
	await expect(page.locator("html")).toHaveClass(/dark/);
	expect(await cssVar(page, "--background")).toBe("#191918");
	expect(await cssVar(page, "--foreground")).toBe("#e9e8e6");
	expect(await cssVar(page, "--sidebar")).toBe("#20201f");
	expect(await cssVar(page, "--border")).toBe("#373532");
	expect(contrast("#78736b", "#fbfaf8")).toBeGreaterThanOrEqual(4.5);
	expect(contrast("#aaa59d", "#191918")).toBeGreaterThanOrEqual(4.5);
});

test("uses Newsreader and Roboto typography across the app", async ({ page }) => {
  await page.goto(server.baseURL);
  await expect(page.locator("body")).toHaveCSS("font-family", /Roboto/);
  await expect(page.getByRole("heading", { name: "Dashboard" })).toHaveCSS("font-family", /Newsreader/);
});

test("shared buttons and inputs are flat", async ({ page }) => {
	await page.goto(`${server.baseURL}/tasks`);
	await expect(page.getByRole("button", { name: "New", exact: true }).first()).toHaveCSS("box-shadow", "none");
  await expect(page.locator("select").first()).toHaveCSS("box-shadow", "none");
});

test("uses a compact sidebar and exposes page width semantics", async ({ page }) => {
  await page.goto(`${server.baseURL}/tasks`);
  const sidebar = page.locator('[data-sidebar="sidebar"]:visible').first().locator("..");
  await expect(sidebar).toHaveCSS("width", "224px");
  await expect(page.locator('[data-page-header][data-page-size="full"]')).toBeVisible();
  await expect(page.locator('[data-page-size="full"]').last()).toHaveCSS("max-width", "none");
  await page.getByRole("main").getByRole("button", { name: "Toggle Sidebar" }).click();
  await expect(sidebar).toHaveCSS("width", "48px");
});

test("uses the reading rhythm for docs and memos", async ({ page }) => {
  await page.goto(`${server.baseURL}/docs`);
  await page.getByText("Quiet Paper Doc").first().click();
  await expect(page.locator('[data-document-surface="doc"]')).toHaveCSS("max-width", "880px");
  await page.goto(`${server.baseURL}/memos`);
  await expect(page.locator('[data-page-header][data-page-size="reading"]')).toBeVisible();
  await expect(page.locator('[data-document-surface="memos"]')).toHaveCSS("max-width", "880px");
  await expect(page.getByText("Quiet Paper memo")).toBeVisible();
});

test("keeps task detail content in the document reading column", async ({ page }) => {
  await page.goto(`${server.baseURL}/kanban`);
  await page.getByText("Quiet Paper Task").first().click();
  await expect(page.locator('[data-document-surface="task-detail"]')).toHaveCSS("max-width", "880px");
});

test("uses full-width surfaces for database pages", async ({ page }) => {
  for (const path of ["/tasks", "/kanban", "/projects", "/audit", "/links"]) {
    await page.goto(`${server.baseURL}${path}`);
    await expect(page.locator('[data-page-header][data-page-size="full"]')).toBeVisible();
    await expect(page.locator('[data-page-size="full"]').last()).toHaveCSS("max-width", "none");
  }
});

test("keeps analytical panels flat and quiet", async ({ page }) => {
  await page.goto(server.baseURL);
  const throughput = page.getByRole("heading", { name: "Throughput" }).locator("xpath=ancestor::section[1]");
  await expect(throughput).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await expect(throughput).toHaveCSS("box-shadow", "none");
  await expect(throughput).toHaveCSS("border-radius", "8px");
});

for (const width of [375, 768, 1024, 1440]) {
  test(`has no horizontal page overflow at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    for (const path of ["/", "/tasks", "/docs", "/graph", "/memory", "/decisions", "/config", "/chat"]) {
      await page.goto(`${server.baseURL}${path}`);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
    }
  });
}
