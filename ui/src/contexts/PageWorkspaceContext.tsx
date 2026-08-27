import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
	type Dispatch,
	type ReactNode,
	type SetStateAction,
} from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useConfig } from "./ConfigContext";
import {
	createEmptyPageWorkspaceSnapshot,
	getPageWorkspaceKey,
	PAGE_IDS,
	readPageWorkspaceSnapshot,
	writePageWorkspaceSnapshot,
	type PageId,
	type PageRouteSnapshot,
	type PageWorkspaceSnapshot,
} from "../lib/pageWorkspaceStorage";

export { PAGE_IDS };
export type { PageId };

export const PAGE_BASE_ROUTES: Record<PageId, string> = {
	chat: "/chat",
	dashboard: "/",
	projects: "/projects",
	kanban: "/kanban",
	tasks: "/tasks",
	docs: "/docs",
	graph: "/graph",
	memory: "/memory",
	links: "/links",
	memos: "/memos",
	decisions: "/decisions",
	audit: "/audit",
	imports: "/imports",
	config: "/config",
};

const PAGE_PREFIXES: Array<[string, PageId]> = [
	["/dashboard", "dashboard"],
	["/projects", "projects"],
	["/kanban", "kanban"],
	["/tasks", "tasks"],
	["/docs", "docs"],
	["/imports", "imports"],
	["/graph", "graph"],
	["/memory", "memory"],
	["/links", "links"],
	["/memos", "memos"],
	["/decisions", "decisions"],
	["/audit", "audit"],
	["/chat", "chat"],
	["/config", "config"],
];

export function pageIdFromPath(pathname: string): PageId {
	if (pathname === "/" || pathname === "") return "dashboard";
	return PAGE_PREFIXES.find(([prefix]) => pathname === prefix || pathname.startsWith(`${prefix}/`))?.[1] || "dashboard";
}

export interface PageWorkspaceLifecycleState {
	activePage: PageId;
	visitedPages: ReadonlySet<PageId>;
	activationIds: Partial<Record<PageId, number>>;
}

export function createPageWorkspaceState(activePage: PageId): PageWorkspaceLifecycleState {
	return {
		activePage,
		visitedPages: new Set([activePage]),
		activationIds: { [activePage]: 0 },
	};
}

export function transitionPageWorkspace(
	state: PageWorkspaceLifecycleState,
	nextPage: PageId,
): PageWorkspaceLifecycleState {
	if (state.activePage === nextPage) return state;
	const visitedPages = new Set(state.visitedPages);
	const wasVisited = visitedPages.has(nextPage);
	visitedPages.add(nextPage);
	return {
		activePage: nextPage,
		visitedPages,
		activationIds: {
			...state.activationIds,
			[nextPage]: (state.activationIds[nextPage] || 0) + (wasVisited ? 1 : 0),
		},
	};
}

export interface PageStateCodec<T> {
	encode: (value: T) => unknown;
	decode: (value: unknown) => T | undefined;
}

export interface PageLifecycle {
	isActive: boolean;
	activationId: number;
	isHydrated: boolean;
}

interface PageWorkspaceContextValue {
	activePage: PageId;
	visitedPages: ReadonlySet<PageId>;
	activationIds: Partial<Record<PageId, number>>;
	isHydrated: boolean;
	hydrationRevision: number;
	workspaceKey: string;
	getPageState: (pageId: PageId, stateKey: string) => unknown;
	setPageState: (pageId: PageId, stateKey: string, value: unknown) => void;
	getRememberedRoute: (pageId: PageId) => PageRouteSnapshot | undefined;
	navigateToPage: (pageId: PageId) => void;
}

const PageWorkspaceContext = createContext<PageWorkspaceContextValue | null>(null);

function emptySnapshot(workspaceKey: string): PageWorkspaceSnapshot {
	return createEmptyPageWorkspaceSnapshot(workspaceKey);
}

function routeFromLocation(location: { pathname: string; searchStr?: string; hash?: string }): PageRouteSnapshot {
	return {
		pathname: location.pathname,
		search: location.searchStr || "",
		hash: location.hash || "",
	};
}

function currentBrowserRoute(fallback: { pathname: string; searchStr?: string; hash?: string }): PageRouteSnapshot {
	if (typeof window === "undefined") return routeFromLocation(fallback);
	return {
		pathname: window.location.pathname || fallback.pathname,
		search: window.location.search || fallback.searchStr || "",
		hash: window.location.hash || fallback.hash || "",
	};
}

function parseSearch(search: string): Record<string, string> | undefined {
	const raw = search.startsWith("?") ? search.slice(1) : search;
	if (!raw) return undefined;
	const values: Record<string, string> = {};
	new URLSearchParams(raw).forEach((value, key) => {
		values[key] = value;
	});
	return values;
}

function stripHash(hash: string): string | undefined {
	if (!hash) return undefined;
	return hash.startsWith("#") ? hash.slice(1) : hash;
}

export function PageWorkspaceProvider({ children }: { children: ReactNode }) {
	const { config, loading: configLoading } = useConfig();
	const navigate = useNavigate();
	const location = useRouterState({ select: (state) => state.location });
	const activePage = pageIdFromPath(location.pathname);
	const workspaceKey = getPageWorkspaceKey({ id: config.id, name: config.name });
	const [isHydrated, setIsHydrated] = useState(false);
	const [hydrationRevision, setHydrationRevision] = useState(0);
	const [snapshot, setSnapshot] = useState<PageWorkspaceSnapshot>(() => emptySnapshot(workspaceKey));
	const snapshotRef = useRef(snapshot);
	const [lifecycleState, setLifecycleState] = useState(() => createPageWorkspaceState(activePage));
	const previousActivePageRef = useRef(activePage);
	const writeTimerRef = useRef<number | null>(null);

	const commitSnapshot = useCallback((update: (current: PageWorkspaceSnapshot) => PageWorkspaceSnapshot) => {
		const next = update(snapshotRef.current);
		snapshotRef.current = next;
		setSnapshot(next);
	}, []);

	useEffect(() => {
		if (configLoading) {
			setIsHydrated(false);
			return;
		}
		setIsHydrated(false);
		const restored = readPageWorkspaceSnapshot(workspaceKey);
		snapshotRef.current = restored;
		setSnapshot(restored);
		setHydrationRevision((current) => current + 1);
		setIsHydrated(true);
	}, [configLoading, workspaceKey]);

	useEffect(() => {
		if (previousActivePageRef.current === activePage) return;
		previousActivePageRef.current = activePage;
		setLifecycleState((current) => transitionPageWorkspace(current, activePage));
	}, [activePage]);

	useEffect(() => {
		if (!isHydrated) return;
		const page = pageIdFromPath(location.pathname);
		const route = currentBrowserRoute(location);
		commitSnapshot((current) => {
			const previous = current.routes[page];
			if (previous?.pathname === route.pathname && previous.search === route.search && previous.hash === route.hash) {
				return current;
			}
			return {
				...current,
				savedAt: Date.now(),
				routes: { ...current.routes, [page]: route },
			};
		});
	}, [commitSnapshot, isHydrated, location.hash, location.pathname, location.searchStr]);

	useEffect(() => {
		if (!isHydrated) return;
		if (writeTimerRef.current !== null) window.clearTimeout(writeTimerRef.current);
		writeTimerRef.current = window.setTimeout(() => {
			if (snapshotRef.current.workspaceKey === workspaceKey) {
				writePageWorkspaceSnapshot(snapshotRef.current);
			}
			writeTimerRef.current = null;
		}, 250);
		return () => {
			if (writeTimerRef.current !== null) {
				window.clearTimeout(writeTimerRef.current);
				writeTimerRef.current = null;
			}
		};
	}, [isHydrated, snapshot, workspaceKey]);

	useEffect(() => {
		if (!isHydrated) return;
		const flushSnapshot = () => {
			if (writeTimerRef.current !== null) {
				window.clearTimeout(writeTimerRef.current);
				writeTimerRef.current = null;
			}
			if (snapshotRef.current.workspaceKey === workspaceKey) {
				writePageWorkspaceSnapshot(snapshotRef.current);
			}
		};
		window.addEventListener("pagehide", flushSnapshot);
		return () => window.removeEventListener("pagehide", flushSnapshot);
	}, [isHydrated, workspaceKey]);

	const getPageState = useCallback((pageId: PageId, stateKey: string) => {
		return snapshotRef.current.pages[pageId]?.[stateKey];
	}, []);

	const setPageState = useCallback((pageId: PageId, stateKey: string, value: unknown) => {
		try {
			JSON.stringify(value);
		} catch {
			return;
		}
		commitSnapshot((current) => ({
			...current,
			savedAt: Date.now(),
			pages: {
				...current.pages,
				[pageId]: { ...(current.pages[pageId] || {}), [stateKey]: value },
			},
		}));
	}, [commitSnapshot]);

	const getRememberedRoute = useCallback((pageId: PageId) => snapshotRef.current.routes[pageId], []);

	const navigateToPage = useCallback((pageId: PageId) => {
		if (pageId === activePage) return;

		// Capture the outgoing nested route synchronously. The debounced snapshot
		// write may not have run before the router commits the next location.
		const currentRoute = currentBrowserRoute(location);
		const previousRoute = snapshotRef.current.routes[activePage];
		if (
			!previousRoute ||
			previousRoute.pathname !== currentRoute.pathname ||
			previousRoute.search !== currentRoute.search ||
			previousRoute.hash !== currentRoute.hash
		) {
			const nextSnapshot = {
				...snapshotRef.current,
				savedAt: Date.now(),
				routes: { ...snapshotRef.current.routes, [activePage]: currentRoute },
			};
			snapshotRef.current = nextSnapshot;
			setSnapshot(nextSnapshot);
		}

		const route = snapshotRef.current.routes[pageId];
		const target = route || { pathname: PAGE_BASE_ROUTES[pageId], search: "", hash: "" };
		navigate({
			to: target.pathname as never,
			search: parseSearch(target.search) as never,
			hash: stripHash(target.hash) as never,
		});
	}, [
		activePage,
		location.hash,
		location.pathname,
		location.searchStr,
		navigate,
	]);

	const value = useMemo<PageWorkspaceContextValue>(() => ({
		activePage,
		visitedPages: lifecycleState.visitedPages,
		activationIds: lifecycleState.activationIds,
		isHydrated,
		hydrationRevision,
		workspaceKey,
		getPageState,
		setPageState,
		getRememberedRoute,
		navigateToPage,
	}), [
		activePage,
		getPageState,
		getRememberedRoute,
		hydrationRevision,
		isHydrated,
		lifecycleState.activationIds,
		lifecycleState.visitedPages,
		navigateToPage,
		setPageState,
		workspaceKey,
	]);

	return <PageWorkspaceContext.Provider value={value}>{children}</PageWorkspaceContext.Provider>;
}

function usePageWorkspaceContext(): PageWorkspaceContextValue {
	const context = useContext(PageWorkspaceContext);
	if (!context) throw new Error("PageWorkspace hooks must be used within PageWorkspaceProvider");
	return context;
}

export function usePageLifecycle(pageId: PageId): PageLifecycle {
	const { activePage, activationIds, isHydrated } = usePageWorkspaceContext();
	return {
		isActive: activePage === pageId,
		activationId: activationIds[pageId] || 0,
		isHydrated,
	};
}

const identityCodec: PageStateCodec<unknown> = {
	encode: (value) => value,
	decode: (value) => value,
};

function restorePageState<T>(stored: unknown, initialValue: T, codec: PageStateCodec<T>): T {
	if (stored === undefined) return initialValue;
	try {
		return codec.decode(stored) ?? initialValue;
	} catch {
		return initialValue;
	}
}

export function usePersistentPageState<T>(
	pageId: PageId,
	stateKey: string,
	initialValue: T,
	codec?: PageStateCodec<T>,
): [T, Dispatch<SetStateAction<T>>] {
	const { hydrationRevision, isHydrated, getPageState, setPageState } = usePageWorkspaceContext();
	const activeCodec = (codec || identityCodec) as PageStateCodec<T>;
	const codecRef = useRef(activeCodec);
	codecRef.current = activeCodec;
	const [value, setValue] = useState<T>(() =>
		isHydrated
			? restorePageState(getPageState(pageId, stateKey), initialValue, activeCodec)
			: initialValue,
	);
	const [hasHydratedValue, setHasHydratedValue] = useState(isHydrated);
	const valueRef = useRef(initialValue);
	const initialValueRef = useRef(initialValue);
	const hydratedRevisionRef = useRef<number | null>(isHydrated ? hydrationRevision : null);
	const skipPersistRef = useRef(isHydrated);
	valueRef.current = value;
	initialValueRef.current = initialValue;

	useEffect(() => {
		if (!isHydrated) {
			hydratedRevisionRef.current = null;
			skipPersistRef.current = false;
			setHasHydratedValue(false);
			return;
		}
		const stored = getPageState(pageId, stateKey);
		const restored = restorePageState(stored, initialValueRef.current, codecRef.current);
		skipPersistRef.current = true;
		hydratedRevisionRef.current = hydrationRevision;
		valueRef.current = restored;
		setValue(restored);
		setHasHydratedValue(true);
	}, [getPageState, hydrationRevision, isHydrated, pageId, stateKey]);

	useEffect(() => {
		if (
			!isHydrated ||
			!hasHydratedValue ||
			hydratedRevisionRef.current !== hydrationRevision
		) return;
		if (skipPersistRef.current) {
			skipPersistRef.current = false;
			return;
		}
		try {
			setPageState(pageId, stateKey, codecRef.current.encode(value));
		} catch {
			// A page-specific codec must not make the page unusable.
		}
	}, [hasHydratedValue, hydrationRevision, isHydrated, pageId, setPageState, stateKey, value]);

	const setPersistentValue = useCallback<Dispatch<SetStateAction<T>>>((nextValueOrUpdater) => {
		const nextValue = typeof nextValueOrUpdater === "function"
			? (nextValueOrUpdater as (current: T) => T)(valueRef.current)
			: nextValueOrUpdater;
		valueRef.current = nextValue;
		setValue(nextValue);
		if (!isHydrated || !hasHydratedValue || hydratedRevisionRef.current !== hydrationRevision) return;
		try {
			setPageState(pageId, stateKey, codecRef.current.encode(nextValue));
			skipPersistRef.current = true;
		} catch {
			// A page-specific codec must not make the page unusable.
		}
	}, [hasHydratedValue, hydrationRevision, isHydrated, pageId, setPageState, stateKey]);

	return [value, setPersistentValue];
}

export function usePageNavigation() {
	const { navigateToPage, getRememberedRoute } = usePageWorkspaceContext();
	return { navigateToPage, getRememberedRoute };
}

export function usePageWorkspace() {
	const { activePage, visitedPages, isHydrated, workspaceKey } = usePageWorkspaceContext();
	return { activePage, visitedPages, isHydrated, workspaceKey };
}
