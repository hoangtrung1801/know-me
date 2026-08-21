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
	const chatId = "chat-1";
	const chatMessages: Array<Record<string, unknown>> = [];

	const snapshot = () => ({
		workflow: {
			projectId: "test-project",
			taskId,
			phase,
			...(codexSessionId ? { codexSessionId } : {}),
			chatSessionId: chatId,
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
	const chatSession = () => ({
		id: chatId,
		sessionId: codexSessionId || "",
		title: "Agent Loop Task",
		agentType: "codex",
		status: "idle",
		taskId,
		projectId: "test-project",
		createdAt: new Date().toISOString(),
		updatedAt: new Date().toISOString(),
		messages: chatMessages,
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
	await page.route(`**/api/chats/${chatId}`, async (route) => {
		await route.fulfill({ contentType: "application/json", body: JSON.stringify(chatSession()) });
	});
	await page.route(`**/api/chats/${chatId}/send`, async (route) => {
		const body = route.request().postDataJSON() as { content: string };
		chatMessages.push({ id: `user-${chatMessages.length + 1}`, role: "user", content: body.content, model: "codex", createdAt: new Date().toISOString(), phase: "chat" });
		await route.fulfill({ status: 202, contentType: "application/json", body: JSON.stringify({ accepted: true }) });
	});
	await page.route("**/api/events", async (route) => {
		const connected = `event: connected\ndata: ${JSON.stringify({ timestamp: Date.now() })}\n\n`;
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
			phase = "plan-review";
			runs.push({ id: `run-${++runNumber}`, taskId, phase: "investigation", status: "succeeded", summary: "Revised plan ready" });
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
	await page.goto(`${server.baseURL}/kanban/${taskId}`);
	const panel = page.getByRole("region", { name: "Coding agent" });
	await expect(panel).toBeVisible();

	await panel.getByRole("button", { name: "Start investigation" }).click();
	await expect(panel.getByRole("button", { name: "Approve plan and implement" })).toBeVisible();
	await expect(panel.getByText(/Latest run/)).toHaveCount(0);

	await panel.getByPlaceholder("Describe what Codex should change").fill("Include the existing parser in the plan");
	await panel.getByRole("button", { name: "Request changes" }).click();
	await expect(panel.getByText("Include the existing parser in the plan")).toBeVisible();
	await expect(panel.getByRole("button", { name: "Approve plan and implement" })).toBeVisible();

	await panel.getByRole("button", { name: "Approve plan and implement" }).click();
	await expect(panel.getByRole("button", { name: "Approve implementation" })).toBeVisible();

	await panel.getByPlaceholder("Describe what Codex should change").fill("Add a regression test for the parser");
	await panel.getByRole("button", { name: "Request changes" }).click();
	await expect(panel.getByRole("button", { name: "Start fix" })).toBeVisible();
	await panel.getByRole("button", { name: "Start fix" }).click();
	await expect(panel.getByRole("button", { name: "Approve implementation" })).toBeVisible();

	resumePhase = "implementation";
	codexSessionId = "session-1";
	phase = "interrupted";
	await page.reload();
	const resumedPanel = page.getByRole("region", { name: "Coding agent" });
	await expect(resumedPanel.getByRole("button", { name: "Resume", exact: true })).toBeVisible();
	await resumedPanel.getByRole("button", { name: "Resume", exact: true }).click();
	await expect(resumedPanel.getByRole("button", { name: "Approve implementation" })).toBeVisible();

	await resumedPanel.getByRole("button", { name: "Approve implementation" }).click();
	await expect(resumedPanel.getByRole("button", { name: "Approve implementation" })).toHaveCount(0);
});

test("keeps task chat in the resizable rail and uses tabs in a smaller sheet", async ({ page }) => {
	const output = server.cli('task create "Codex Chat Layout Task" -d "Exercise the persistent chat layout" --status in-progress');
	const taskId = output.match(/Created task\s+([a-z0-9]+)/i)?.[1] || "";
	expect(taskId).toBeTruthy();

	const chatId = "chat-layout";
	const session = {
		id: chatId,
		sessionId: "session-layout",
		title: "Codex Chat Layout Task",
		agentType: "codex",
		status: "idle",
		taskId,
		projectId: "test-project",
		createdAt: new Date().toISOString(),
		updatedAt: new Date().toISOString(),
		messages: [{
			id: "message-layout",
			role: "assistant",
			content: "The persistent task conversation is available.",
			model: "codex",
			createdAt: new Date().toISOString(),
			phase: "chat",
		}, {
			id: "message-empty",
			role: "user",
			content: "",
			model: "codex",
			createdAt: new Date().toISOString(),
			phase: "chat",
		}, {
			id: "message-empty-assistant",
			role: "assistant",
			content: "",
			model: "codex",
			createdAt: new Date().toISOString(),
			phase: "chat",
		}],
	};

	await page.route("**/api/codex/status", (route) => route.fulfill({
		json: { installed: true, loggedIn: true, version: "codex-acp 0.1.0", loginCommand: "codex login", docsUrl: "https://github.com/agentclientprotocol/codex-acp" },
	}));
	await page.route(`**/api/tasks/${taskId}/agent`, (route) => route.fulfill({
		json: {
			workflow: { projectId: "test-project", taskId, phase: "idle", chatSessionId: chatId, updatedAt: new Date().toISOString() },
			runs: [],
			reviewComments: [],
			dirtyFiles: [],
			adapterState: "stopped",
			resumable: false,
			interrupted: false,
		},
	}));
	await page.route(`**/api/chats/${chatId}`, (route) => route.fulfill({ json: session }));
	await page.route("**/api/events", (route) => route.fulfill({
		status: 200,
		contentType: "text/event-stream",
		body: `event: connected\ndata: ${JSON.stringify({ timestamp: Date.now() })}\n\n`,
	}));

	await page.goto(`${server.baseURL}/kanban/${taskId}`);
	const rail = page.getByTestId("task-codex-rail");
	await expect(rail).toBeVisible();
	await expect(page.getByText("The persistent task conversation is available.", { exact: true })).toBeVisible();
	await expect(page.locator("#chat-message-message-empty")).toBeVisible();
	await expect(page.locator("#chat-message-message-empty-assistant")).toBeVisible();
	await expect(page.getByText("Adapter stopped", { exact: true })).toHaveCount(0);
	await expect.poll(async () => (await page.getByTestId("task-codex-chat").locator("> .relative").boundingBox())?.height ?? 0).toBeGreaterThan(0);
	await expect.poll(async () => (await page.getByTestId("task-codex-chat").locator("div.absolute.inset-0.overflow-y-auto").boundingBox())?.height ?? 0).toBeGreaterThan(0);
	const resizeHandle = page.getByRole("button", { name: "Resize Codex panel" });
	await expect(resizeHandle).toHaveAttribute("aria-valuenow", "384");
	await resizeHandle.press("ArrowLeft");
	await expect(resizeHandle).toHaveAttribute("aria-valuenow", "400");

	await page.setViewportSize({ width: 700, height: 900 });
	await expect(page.getByRole("tab", { name: "Codex" })).toBeVisible();
	await expect(rail).toHaveCount(0);
	await page.getByRole("tab", { name: "Codex" }).click();
	await expect(page.getByRole("region", { name: "Coding agent" })).toBeVisible();
	await expect(page.getByText("The persistent task conversation is available.", { exact: true })).toBeVisible();
	await expect.poll(async () => (await page.getByTestId("task-codex-chat").locator("> .relative").boundingBox())?.height ?? 0).toBeGreaterThan(0);
	await expect.poll(async () => (await page.getByTestId("task-codex-chat").locator("div.absolute.inset-0.overflow-y-auto").boundingBox())?.height ?? 0).toBeGreaterThan(0);
});

test("shows the user turn and streamed ACP reply in task chat", async ({ page }) => {
	const output = server.cli('task create "Codex Chat Transcript Task" -d "Exercise the ACP transcript" --status in-progress');
	const taskId = output.match(/Created task\s+([a-z0-9]+)/i)?.[1] || "";
	expect(taskId).toBeTruthy();

	const chatId = "chat-transcript";
	const now = () => new Date().toISOString();
	const chatMessages: Array<Record<string, unknown>> = [];
	let chatStatus = "idle";
	let pendingEvents: Array<{ type: string; data: Record<string, unknown> }> = [];
	let releaseEvents: (() => void) | null = null;

	const chatSession = () => ({
		id: chatId,
		sessionId: "acp-session-transcript",
		title: "Codex Chat Transcript Task",
		agentType: "codex",
		status: chatStatus,
		taskId,
		projectId: "test-project",
		createdAt: now(),
		updatedAt: now(),
		messages: chatMessages,
	});

	await page.route("**/api/codex/status", (route) => route.fulfill({
		json: { installed: true, loggedIn: true, version: "codex-acp 0.1.0", loginCommand: "codex login", docsUrl: "https://github.com/agentclientprotocol/codex-acp" },
	}));
	await page.route(`**/api/tasks/${taskId}/agent`, (route) => route.fulfill({
		json: {
			workflow: { projectId: "test-project", taskId, phase: "idle", chatSessionId: chatId, updatedAt: now() },
			runs: [],
			reviewComments: [],
			dirtyFiles: [],
			adapterState: "stopped",
			resumable: false,
			interrupted: false,
		},
	}));
	await page.route(`**/api/chats/${chatId}`, (route) => route.fulfill({ json: chatSession() }));
	await page.route(`**/api/chats/${chatId}/send`, async (route) => {
		const body = route.request().postDataJSON() as { content: string };
		const assistant = {
			id: "assistant-1",
			role: "assistant",
			content: "",
			model: "codex",
			createdAt: now(),
			phase: "chat",
		};
		chatMessages.push(
			{ id: "user-1", role: "user", content: body.content, model: "codex", createdAt: now(), phase: "chat" },
			assistant,
		);
		chatStatus = "streaming";
		const streamingSession = { ...chatSession(), messages: chatMessages.map((message) => ({ ...message })) };
		assistant.content = "ACP assistant response";
		chatStatus = "idle";
		pendingEvents = [
			{ type: "chats:updated", data: { session: streamingSession } },
			{ type: "chats:message", data: { chatId, message: { ...assistant } } },
			{ type: "chats:updated", data: { session: chatSession() } },
		];
		releaseEvents?.();
		await route.fulfill({ status: 202, json: { accepted: true } });
	});
	await page.route("**/api/events", async (route) => {
		if (pendingEvents.length === 0) {
			await new Promise<void>((resolve) => {
				releaseEvents = resolve;
			});
		}
		const events = pendingEvents;
		pendingEvents = [];
		releaseEvents = null;
		const connected = `event: connected\ndata: ${JSON.stringify({ timestamp: Date.now() })}\n\n`;
		const body = events.map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`).join("");
		await route.fulfill({ status: 200, contentType: "text/event-stream", body: connected + body });
	});

	await page.goto(`${server.baseURL}/kanban/${taskId}`);
	const panel = page.getByRole("region", { name: "Coding agent" });
	await expect(panel).toBeVisible();
	await panel.getByLabel("Message Codex about this task").fill("Please inspect the task");
	await panel.getByRole("button", { name: "Send message" }).click();

	await expect(panel.locator("#chat-message-user-1").getByText("Please inspect the task", { exact: true })).toBeVisible();
	await expect(panel.getByText("ACP assistant response", { exact: true })).toBeVisible();
	await expect(panel.locator('[data-chat-bubble="user"]')).toHaveCount(1);
	await expect(panel.locator('[data-chat-bubble="assistant"]')).toHaveCount(1);
	await page.reload();
	const reloadedPanel = page.getByRole("region", { name: "Coding agent" });
	await expect(reloadedPanel.locator("#chat-message-user-1").getByText("Please inspect the task", { exact: true })).toBeVisible();
	await expect(reloadedPanel.getByText("ACP assistant response", { exact: true })).toBeVisible();
});

test("keeps ACP events that race the initial chat load", async ({ page }) => {
	const output = server.cli('task create "Codex Chat Race Task" -d "Exercise the chat load race" --status in-progress');
	const taskId = output.match(/Created task\s+([a-z0-9]+)/i)?.[1] || "";
	expect(taskId).toBeTruthy();

	const chatId = "chat-race";
	const now = () => new Date().toISOString();
	let sessionRequested = false;
	let eventsSent = false;
	let releaseEvents: (() => void) | null = null;
	const eventsReady = new Promise<void>((resolve) => {
		releaseEvents = resolve;
	});
	let releaseSession: (() => void) | null = null;
	const sessionReady = new Promise<void>((resolve) => {
		releaseSession = resolve;
	});
	const assistant = { id: "assistant-race", role: "assistant", content: "", model: "codex", createdAt: now(), phase: "chat" };
	const staleSession = () => ({
		id: chatId,
		sessionId: "acp-session-race",
		title: "Codex Chat Race Task",
		agentType: "codex",
		status: "idle",
		taskId,
		projectId: "test-project",
		createdAt: now(),
		updatedAt: now(),
		messages: [],
	});

	await page.route("**/api/codex/status", (route) => route.fulfill({
		json: { installed: true, loggedIn: true, version: "codex-acp 0.1.0", loginCommand: "codex login", docsUrl: "https://github.com/agentclientprotocol/codex-acp" },
	}));
	await page.route(`**/api/tasks/${taskId}/agent`, (route) => route.fulfill({
		json: {
			workflow: { projectId: "test-project", taskId, phase: "idle", chatSessionId: chatId, updatedAt: now() },
			runs: [],
			reviewComments: [],
			dirtyFiles: [],
			adapterState: "stopped",
			resumable: false,
			interrupted: false,
		},
	}));
	await page.route(`**/api/chats/${chatId}`, async (route) => {
		sessionRequested = true;
		await sessionReady;
		await route.fulfill({ json: staleSession() });
	});
	await page.route("**/api/events", async (route) => {
		while (!sessionRequested) await new Promise((resolve) => setTimeout(resolve, 10));
		await eventsReady;
		const session = { ...staleSession(), status: "streaming", messages: [assistant] };
		const connected = `event: connected\ndata: ${JSON.stringify({ timestamp: Date.now() })}\n\n`;
		const body = [
			["chats:updated", { session }],
			["chats:message", { chatId, message: { ...assistant, content: "Raced ACP response" } }],
		].map(([type, data]) => `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`).join("");
		eventsSent = true;
		await route.fulfill({ status: 200, contentType: "text/event-stream", body: connected + body });
	});

	await page.goto(`${server.baseURL}/kanban/${taskId}`);
	const panel = page.getByRole("region", { name: "Coding agent" });
	await expect(panel).toBeVisible();
	await expect.poll(() => sessionRequested).toBe(true);
	await page.waitForTimeout(250);
	releaseEvents?.();
	await expect.poll(() => eventsSent).toBe(true);
	await expect(panel.getByText("Raced ACP response", { exact: true })).toBeVisible();
	releaseSession?.();
	await expect(panel.getByText("Raced ACP response", { exact: true })).toBeVisible();
});

test("merges a chat message received before the task chat id", async ({ page }) => {
	const output = server.cli('task create "Codex Chat Id Task" -d "Exercise the chat id race" --status in-progress');
	const taskId = output.match(/Created task\s+([a-z0-9]+)/i)?.[1] || "";
	expect(taskId).toBeTruthy();

	const chatId = "chat-id-race";
	const now = () => new Date().toISOString();
	let includeChatId = false;
	let releaseEvents: (() => void) | null = null;
	const eventsReady = new Promise<void>((resolve) => {
		releaseEvents = resolve;
	});
	const assistant = { id: "assistant-id-race", role: "assistant", content: "", model: "codex", createdAt: now(), phase: "chat" };
	const session = {
		id: chatId,
		sessionId: "acp-session-id-race",
		title: "Codex Chat Id Task",
		agentType: "codex",
		status: "idle",
		taskId,
		projectId: "test-project",
		createdAt: now(),
		updatedAt: now(),
		messages: [assistant],
	};

	await page.route("**/api/codex/status", (route) => route.fulfill({
		json: { installed: true, loggedIn: true, version: "codex-acp 0.1.0", loginCommand: "codex login", docsUrl: "https://github.com/agentclientprotocol/codex-acp" },
	}));
	await page.route(`**/api/tasks/${taskId}/agent`, (route) => route.fulfill({
		json: {
			workflow: { projectId: "test-project", taskId, phase: "idle", ...(includeChatId ? { chatSessionId: chatId } : {}), updatedAt: now() },
			runs: [],
			reviewComments: [],
			dirtyFiles: [],
			adapterState: "stopped",
			resumable: false,
			interrupted: false,
		},
	}));
	await page.route(`**/api/chats/${chatId}`, (route) => route.fulfill({ json: { ...session, messages: [] } }));
	await page.route("**/api/events", async (route) => {
		await eventsReady;
		const connected = `event: connected\ndata: ${JSON.stringify({ timestamp: Date.now() })}\n\n`;
		const body = [
			["chats:message", { chatId, message: { ...assistant, content: "Message before chat id" } }],
			["chats:updated", { session }],
		].map(([type, data]) => `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`).join("");
		await route.fulfill({ status: 200, contentType: "text/event-stream", body: connected + body });
	});

	await page.goto(`${server.baseURL}/kanban/${taskId}`);
	const panel = page.getByRole("region", { name: "Coding agent" });
	await expect(panel).toBeVisible();
	await page.waitForTimeout(250);
	releaseEvents?.();
	await expect(panel.getByText("Message before chat id", { exact: true })).toBeVisible();

	includeChatId = true;
	await panel.getByRole("button", { name: "Refresh" }).click();
	await expect(panel.getByText("Message before chat id", { exact: true })).toBeVisible();
});
