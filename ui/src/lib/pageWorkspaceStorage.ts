export const PAGE_WORKSPACE_STORAGE_KEY = "knowns-page-workspace:v1";
export const PAGE_WORKSPACE_STORAGE_VERSION = 1 as const;

export const PAGE_IDS = [
	"chat",
	"dashboard",
	"projects",
	"kanban",
	"tasks",
	"docs",
	"graph",
	"memory",
	"links",
	"memos",
	"decisions",
	"audit",
	"imports",
	"config",
] as const;

export type PageId = (typeof PAGE_IDS)[number];

export interface PageRouteSnapshot {
	pathname: string;
	search: string;
	hash: string;
}

export interface PageWorkspaceSnapshot {
	version: typeof PAGE_WORKSPACE_STORAGE_VERSION;
	workspaceKey: string;
	savedAt: number;
	routes: Partial<Record<PageId, PageRouteSnapshot>>;
	pages: Partial<Record<PageId, Record<string, unknown>>>;
}

export interface WorkspaceIdentity {
	id?: string | null;
	name?: string | null;
	path?: string | null;
	projectPath?: string | null;
}

export function createEmptyPageWorkspaceSnapshot(workspaceKey: string): PageWorkspaceSnapshot {
	return {
		version: PAGE_WORKSPACE_STORAGE_VERSION,
		workspaceKey,
		savedAt: Date.now(),
		routes: {},
		pages: {},
	};
}

export function getPageWorkspaceKey(identity: WorkspaceIdentity | null | undefined): string {
	const id = identity?.id?.trim();
	if (id) return `id:${id}`;

	const path = (identity?.path || identity?.projectPath || "").trim();
	const name = (identity?.name || "").trim();
	if (path || name) return `workspace:${path}|${name}`;
	return "workspace:default";
}

export function isPageId(value: string): value is PageId {
	return (PAGE_IDS as readonly string[]).includes(value);
}

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

function sanitizeJsonValue(value: unknown, seen: Set<object>): JsonValue | undefined {
	if (value === null) return null;
	if (typeof value === "string" || typeof value === "boolean") return value;
	if (typeof value === "number") return Number.isFinite(value) ? value : null;
	if (value instanceof Date) return value.toISOString();
	if (typeof value !== "object") return undefined;
	if (seen.has(value)) return undefined;

	seen.add(value);
	try {
		if (Array.isArray(value)) {
			return value.map((entry) => sanitizeJsonValue(entry, seen) ?? null);
		}

		const output: Record<string, JsonValue> = {};
		for (const [key, entry] of Object.entries(value)) {
			const sanitized = sanitizeJsonValue(entry, seen);
			if (sanitized !== undefined) output[key] = sanitized;
		}
		return output;
	} finally {
		seen.delete(value);
	}
}

function sanitizeSnapshot(snapshot: PageWorkspaceSnapshot): PageWorkspaceSnapshot {
	const routes: Partial<Record<PageId, PageRouteSnapshot>> = {};
	for (const [page, route] of Object.entries(snapshot.routes || {})) {
		if (!isPageId(page) || !route || typeof route !== "object") continue;
		const pathname = typeof route.pathname === "string" ? route.pathname : "";
		if (!pathname) continue;
		routes[page] = {
			pathname,
			search: typeof route.search === "string" ? route.search : "",
			hash: typeof route.hash === "string" ? route.hash : "",
		};
	}

	const pages: Partial<Record<PageId, Record<string, unknown>>> = {};
	for (const [page, values] of Object.entries(snapshot.pages || {})) {
		if (!isPageId(page) || !values || typeof values !== "object" || Array.isArray(values)) continue;
		const sanitized = sanitizeJsonValue(values, new Set());
		if (sanitized && typeof sanitized === "object" && !Array.isArray(sanitized)) {
			pages[page] = sanitized as Record<string, unknown>;
		}
	}

	return {
		version: PAGE_WORKSPACE_STORAGE_VERSION,
		workspaceKey: typeof snapshot.workspaceKey === "string" ? snapshot.workspaceKey : "",
		savedAt: Number.isFinite(snapshot.savedAt) ? snapshot.savedAt : Date.now(),
		routes,
		pages,
	};
}

export function encodePageWorkspaceSnapshot(snapshot: PageWorkspaceSnapshot): string {
	return JSON.stringify(sanitizeSnapshot(snapshot));
}

function parseRoute(value: unknown): PageRouteSnapshot | null {
	if (!value || typeof value !== "object" || Array.isArray(value)) return null;
	const route = value as Record<string, unknown>;
	if (typeof route.pathname !== "string" || route.pathname.length === 0) return null;
	return {
		pathname: route.pathname,
		search: typeof route.search === "string" ? route.search : "",
		hash: typeof route.hash === "string" ? route.hash : "",
	};
}

function parsePages(value: unknown): Partial<Record<PageId, Record<string, unknown>>> {
	if (!value || typeof value !== "object" || Array.isArray(value)) return {};
	const pages: Partial<Record<PageId, Record<string, unknown>>> = {};
	for (const [page, rawValues] of Object.entries(value)) {
		if (!isPageId(page) || !rawValues || typeof rawValues !== "object" || Array.isArray(rawValues)) continue;
		const sanitized = sanitizeJsonValue(rawValues, new Set());
		if (sanitized && typeof sanitized === "object" && !Array.isArray(sanitized)) {
			pages[page] = sanitized as Record<string, unknown>;
		}
	}
	return pages;
}

export function decodePageWorkspaceSnapshot(raw: string | null, expectedWorkspaceKey?: string): PageWorkspaceSnapshot | null {
	if (!raw) return null;
	try {
		const parsed: unknown = JSON.parse(raw);
		if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
		const value = parsed as Record<string, unknown>;
		if (value.version !== PAGE_WORKSPACE_STORAGE_VERSION || typeof value.workspaceKey !== "string") return null;
		if (expectedWorkspaceKey !== undefined && value.workspaceKey !== expectedWorkspaceKey) return null;
		const savedAt = typeof value.savedAt === "number" && Number.isFinite(value.savedAt) ? value.savedAt : Date.now();
		const routes: Partial<Record<PageId, PageRouteSnapshot>> = {};
		if (value.routes && typeof value.routes === "object" && !Array.isArray(value.routes)) {
			for (const [page, rawRoute] of Object.entries(value.routes)) {
				if (isPageId(page)) {
					const route = parseRoute(rawRoute);
					if (route) routes[page] = route;
				}
			}
		}
		return {
			version: PAGE_WORKSPACE_STORAGE_VERSION,
			workspaceKey: value.workspaceKey,
			savedAt,
			routes,
			pages: parsePages(value.pages),
		};
	} catch {
		return null;
	}
}

function getSessionStorage(): Storage | null {
	try {
		return typeof window === "undefined" ? null : window.sessionStorage;
	} catch {
		return null;
	}
}

export function readPageWorkspaceSnapshot(workspaceKey: string, storage: Storage | null = getSessionStorage()): PageWorkspaceSnapshot {
	const empty = createEmptyPageWorkspaceSnapshot(workspaceKey);
	if (!storage) return empty;
	try {
		return decodePageWorkspaceSnapshot(storage.getItem(PAGE_WORKSPACE_STORAGE_KEY), workspaceKey) || empty;
	} catch {
		return empty;
	}
}

export function writePageWorkspaceSnapshot(snapshot: PageWorkspaceSnapshot, storage: Storage | null = getSessionStorage()): boolean {
	if (!storage) return false;
	try {
		storage.setItem(PAGE_WORKSPACE_STORAGE_KEY, encodePageWorkspaceSnapshot(snapshot));
		return true;
	} catch {
		return false;
	}
}

export function clearPageWorkspaceSnapshot(storage: Storage | null = getSessionStorage()): boolean {
	if (!storage) return false;
	try {
		storage.removeItem(PAGE_WORKSPACE_STORAGE_KEY);
		return true;
	} catch {
		return false;
	}
}
