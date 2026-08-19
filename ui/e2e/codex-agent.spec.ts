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
			installCommand: "npm install -g @agentclientprotocol/codex-acp",
			loginCommand: "codex login",
			docsUrl: "https://github.com/agentclientprotocol/codex-acp",
		},
	}));
	await page.goto(`${server.baseURL}/config`);
	await page.getByRole("button", { name: "AI", exact: true }).click();
	await expect(page.getByRole("heading", { name: "Codex", exact: true })).toBeVisible();
	await expect(page.getByText("codex-acp is not installed", { exact: true })).toBeVisible();
	await expect(page.getByText("npm install -g @agentclientprotocol/codex-acp", { exact: true })).toBeVisible();
});

test("runs the investigation and implementation review loop", async ({ page }) => {
	const output = server.cli('task create "Agent Loop Task" -d "Exercise the Codex workflow" --status in-progress');
	const taskId = output.match(/Created task\s+([a-z0-9]+)/i)?.[1] || "";
	expect(taskId).toBeTruthy();

	let phase: "idle" | "plan-review" | "code-review" | "fix-ready" | "interrupted" | "completed" = "idle";
	let resumePhase: "implementation" | undefined;
	let codexSessionId: string | undefined;
	let runNumber = 0;
	const runs: Array<Record<string, unknown>> = [];
	const reviewComments: Array<Record<string, unknown>> = [];
	let logReads = 0;
	let eventReady = false;
	let eventSent = false;

	const snapshot = () => ({
		workflow: {
			projectId: "test-project",
			taskId,
			phase,
			...(codexSessionId ? { codexSessionId } : {}),
			...(resumePhase ? { resumePhase } : {}),
			updatedAt: new Date().toISOString(),
		},
		runs,
		reviewComments,
		dirtyFiles: [],
		adapterState: "stopped",
		resumable: phase === "interrupted",
		interrupted: phase === "interrupted",
	});

	await page.route("**/api/codex/status", async (route) => {
		await route.fulfill({
			contentType: "application/json",
			body: JSON.stringify({
				installed: true,
				loggedIn: true,
				version: "codex-acp 0.1.0",
				loginCommand: "codex login",
				docsUrl: "https://github.com/agentclientprotocol/codex-acp",
			}),
		});
	});
	await page.route(`**/api/tasks/${taskId}/agent`, async (route) => {
		await route.fulfill({ contentType: "application/json", body: JSON.stringify(snapshot()) });
	});
	await page.route("**/api/events", async (route) => {
		const connected = `event: connected\ndata: ${JSON.stringify({ timestamp: Date.now() })}\n\n`;
		if (eventReady && !eventSent) {
			eventSent = true;
			await route.fulfill({
				status: 200,
				contentType: "text/event-stream",
				body: `${connected}event: agent:progress\ndata: ${JSON.stringify({ projectId: "test-project", taskId, runId: "run-1", message: "Live progress" })}\n\n`,
			});
			return;
		}
		await route.fulfill({ status: 200, contentType: "text/event-stream", body: connected });
	});
	await page.route(`**/api/tasks/${taskId}/agent/*`, async (route) => {
		const action = route.request().url().split("/").pop();
		const body = route.request().postDataJSON() as { comment?: string };
		if (action === "request-plan-changes" || action === "request-implementation-changes") {
			reviewComments.push({
				id: `comment-${reviewComments.length + 1}`,
				projectId: "test-project",
				taskId,
				stage: action === "request-plan-changes" ? "plan" : "implementation",
				body: body.comment,
				createdAt: new Date().toISOString(),
			});
		}
		if (action === "start-investigation") {
			phase = "plan-review";
			runs.push({ id: `run-${++runNumber}`, taskId, phase: "investigation", status: "succeeded", summary: "Plan ready" });
		} else if (action === "approve-plan") {
			phase = "code-review";
			runs.push({ id: `run-${++runNumber}`, taskId, phase: "implementation", status: "succeeded", summary: "Implementation ready" });
		} else if (action === "request-plan-changes") {
			phase = "idle";
		} else if (action === "request-implementation-changes") {
			phase = "fix-ready";
		} else if (action === "start-fix") {
			phase = "code-review";
			runs.push({ id: `run-${++runNumber}`, taskId, phase: "fix", status: "succeeded", summary: "Fix ready" });
		} else if (action === "resume") {
			phase = "code-review";
			resumePhase = undefined;
			runs.push({ id: `run-${++runNumber}`, taskId, phase: "implementation", status: "succeeded", summary: "Resumed implementation" });
		} else if (action === "approve-implementation") {
			phase = "completed";
		}
		await route.fulfill({ contentType: "application/json", body: JSON.stringify(snapshot()) });
	});
	await page.route(`**/api/tasks/${taskId}/agent/runs/*/log`, async (route) => {
		const content = logReads++ === 0 ? "initial log" : "updated log";
		await route.fulfill({ contentType: "application/json", body: JSON.stringify({ content }) });
	});

	await page.goto(`${server.baseURL}/kanban/${taskId}`);
	const panel = page.getByRole("region", { name: "Coding agent" });
	await expect(panel).toBeVisible();

	await panel.getByRole("button", { name: "Start investigation" }).click();
	await expect(panel.getByText("Plan review")).toBeVisible();
	await panel.locator("summary").getByText("View run log").click();
	await expect(panel.getByText("initial log", { exact: true })).toBeVisible();
	eventReady = true;
	await expect(panel.getByText("updated log", { exact: true })).toBeVisible();

	await panel.getByPlaceholder("Describe what Codex should change").fill("Include the existing parser in the plan");
	await panel.getByRole("button", { name: "Request changes" }).click();
	await expect(panel.getByText("Include the existing parser in the plan")).toBeVisible();
	await panel.getByRole("button", { name: "Start investigation" }).click();

	await panel.getByRole("button", { name: "Approve plan and implement" }).click();
	await expect(panel.getByText("Code review")).toBeVisible();

	await panel.getByPlaceholder("Describe what Codex should change").fill("Add a regression test for the parser");
	await panel.getByRole("button", { name: "Request changes" }).click();
	await expect(panel.getByText("Fix ready")).toBeVisible();
	await panel.getByRole("button", { name: "Start fix" }).click();
	await expect(panel.getByText("Code review")).toBeVisible();

	resumePhase = "implementation";
	codexSessionId = "session-1";
	phase = "interrupted";
	await page.reload();
	const resumedPanel = page.getByRole("region", { name: "Coding agent" });
	await expect(resumedPanel.getByText("Interrupted")).toBeVisible();
	await expect(resumedPanel.getByText("ACP session session-1", { exact: true })).toBeVisible();
	await resumedPanel.getByRole("button", { name: "Resume", exact: true }).click();
	await expect(resumedPanel.getByText("Code review")).toBeVisible();

	await resumedPanel.getByRole("button", { name: "Approve implementation" }).click();
	await expect(resumedPanel.getByText("Completed")).toBeVisible();
});
