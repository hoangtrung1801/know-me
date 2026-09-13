import { createBrowserHistory, createRootRoute, createRoute, createRouter } from "@tanstack/react-router";
import AppShell from "./AppShell";
import { DocsProvider } from "./contexts/DocsContext";
import { PageWorkspaceProvider } from "./contexts/PageWorkspaceContext";

const EmptyRoute = () => null;

const rootRoute = createRootRoute({
	component: () => (
		<PageWorkspaceProvider>
			<DocsProvider>
				<AppShell />
			</DocsProvider>
		</PageWorkspaceProvider>
	),
});

const dashboardRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/",
	component: EmptyRoute,
});

const projectsRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/projects",
	component: EmptyRoute,
});

const kanbanRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/kanban",
	component: EmptyRoute,
});

const kanbanTaskRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/kanban/$taskId",
	component: EmptyRoute,
});

const tasksRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/tasks",
	component: EmptyRoute,
});

const taskDetailRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/tasks/$taskId",
	component: EmptyRoute,
});

const docsRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/docs",
	component: EmptyRoute,
});

const docsPathRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/docs/$",
	component: EmptyRoute,
});


const chatRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/chat",
	component: EmptyRoute,
});

const chatSessionRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/chat/$sessionId",
	component: EmptyRoute,
});


const linksRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/links",
	component: EmptyRoute,
});

const memosRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/memos",
	component: EmptyRoute,
});


const auditRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/audit",
	component: EmptyRoute,
});

const configRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/config",
	component: EmptyRoute,
});

const fallbackRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/$",
	component: EmptyRoute,
});

const routeTree = rootRoute.addChildren([
	dashboardRoute,
	projectsRoute,
	kanbanRoute,
	kanbanTaskRoute,
	tasksRoute,
	taskDetailRoute,
	docsRoute,
	docsPathRoute,
	linksRoute,
	memosRoute,
	auditRoute,
	chatRoute,
	chatSessionRoute,
	configRoute,
	fallbackRoute,
]);

export const router = createRouter({
	routeTree,
	history: createBrowserHistory(),
});

declare module "@tanstack/react-router" {
	interface Register {
		router: typeof router;
	}
}
