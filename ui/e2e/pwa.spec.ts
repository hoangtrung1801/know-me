import { test, expect } from "@playwright/test";
import { startServer, type TestServer } from "./helpers";

let server: TestServer;

test.beforeAll(async () => {
	server = await startServer();
});

test.afterAll(() => {
	server?.cleanup();
});

test("serves install metadata and registers the offline shell", async ({ page }) => {
	const manifestResponse = await page.request.get(`${server.baseURL}/manifest.webmanifest`);
	expect(manifestResponse.ok()).toBe(true);
	const manifest = await manifestResponse.json();
	expect(manifest.name).toBe("Know-Me");
	expect(manifest.display).toBe("standalone");
	expect(manifest.icons).toEqual(expect.arrayContaining([
		expect.objectContaining({ sizes: "192x192" }),
		expect.objectContaining({ sizes: "512x512" }),
	]));

	const serviceWorkerResponse = await page.request.get(`${server.baseURL}/sw.js`);
	expect(serviceWorkerResponse.ok()).toBe(true);
	await page.goto(server.baseURL);
	await page.evaluate(async () => {
		await navigator.serviceWorker.ready;
	});
	await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
	const cachedShell = await page.evaluate(async () => Boolean(await caches.match("/index.html")));
	expect(cachedShell).toBe(true);

	const registration = await page.evaluate(async () => {
		const ready = await navigator.serviceWorker.ready;
		return Boolean(ready.active);
	});
	expect(registration).toBe(true);

	await page.context().setOffline(true);
	const offlineShell = await page.evaluate(async () => {
		const response = await fetch("/index.html");
		return { ok: response.ok, html: await response.text() };
	});
	expect(offlineShell.ok).toBe(true);
	expect(offlineShell.html).toContain("Know-Me");
});
