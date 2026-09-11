import {
	LayoutDashboard,
	LayoutGrid,
	ListTodo,
	FileText,
	MessageSquare,
	Settings,
	Search,
	Github,
	ExternalLink,
	ArrowRightLeft,
	Network,
	Brain,
	Link2,
	ScrollText,
	Activity,
		FolderOpen,
	NotebookPen,
} from "lucide-react";
import { Link } from "@tanstack/react-router";
import logoImage from "../../public/logo.png";
import {
	Sidebar,
	SidebarContent,
	SidebarGroup,
	SidebarGroupContent,
	SidebarHeader,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	SidebarRail,
	SidebarFooter,
	useSidebar,
} from "@/ui/components/ui/sidebar";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/ui/components/ui/tooltip";
import { useIsMobile } from "@/ui/hooks/useMobile";
import { useConfig } from "@/ui/contexts/ConfigContext";
import { usePageNavigation, type PageId } from "@/ui/contexts/PageWorkspaceContext";

interface AppSidebarProps {
	currentPage: string;
	onSearchClick: () => void;
	onWorkspacePickerClick: () => void;
	serverVersion?: string;
}

const topNavItems = [
	{
		id: "chat",
		label: "AI Chat",
		icon: MessageSquare,
		to: "/chat",
	},
	{
		id: "dashboard",
		label: "Dashboard",
		icon: LayoutDashboard,
		to: "/",
	},
	{
		id: "projects",
		label: "Projects",
		icon: FolderOpen,
		to: "/projects",
	},
	{
		id: "kanban",
		label: "Kanban",
		icon: LayoutGrid,
		to: "/kanban",
	},
	{
		id: "tasks",
		label: "Tasks",
		icon: ListTodo,
		to: "/tasks",
	},
	{
		id: "docs",
		label: "Docs",
		icon: FileText,
		to: "/docs",
	},
	{
		id: "graph",
		label: "Graph",
		icon: Network,
		to: "/graph",
	},
	{
		id: "memory",
		label: "Memories",
		icon: Brain,
		to: "/memory",
	},
	{
		id: "links",
		label: "Saved Links",
		icon: Link2,
		to: "/links",
	},
	{
		id: "memos",
		label: "Memos",
		icon: NotebookPen,
		to: "/memos",
	},
	{
		id: "decisions",
		label: "System Decisions",
		icon: ScrollText,
		to: "/decisions",
	},
	{
		id: "audit",
		label: "Audit Trail",
		icon: Activity,
		to: "/audit",
	},
];

export function AppSidebar({
	currentPage,
	onSearchClick,
	onWorkspacePickerClick,
	serverVersion,
}: AppSidebarProps) {
	const { state } = useSidebar();
	const isMobile = useIsMobile();
	const isExpanded = state === "expanded";
	const { config, chatUIEnabled } = useConfig();
	const { navigateToPage } = usePageNavigation();
	const visibleNavItems = topNavItems.filter(
		(item) => item.id !== "chat" || chatUIEnabled
	);
	const dockItems = [
		...visibleNavItems,
		{ id: "config", label: "Settings", icon: Settings, to: "/config" },
	];
	const handlePageNavigation = (event: React.MouseEvent<HTMLAnchorElement>, pageId: string) => {
		if (
			event.defaultPrevented ||
			event.button !== 0 ||
			event.metaKey ||
			event.ctrlKey ||
			event.shiftKey ||
			event.altKey
		) return;
		event.preventDefault();
		navigateToPage(pageId as PageId);
	};

	if (!isMobile) {
		return (
			<nav
				aria-label="Main navigation"
				data-navigation-dock
				className="fixed bottom-4 left-1/2 z-50 flex max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-1 overflow-x-auto rounded-2xl bg-popover p-2 shadow-[var(--shadow-popover)]"
			>
				{dockItems.map((item) => {
					const isActive = currentPage === item.id;
					return (
						<Tooltip key={item.id}>
							<TooltipTrigger asChild>
								<Link
									to={item.to}
									onClick={(event) => handlePageNavigation(event, item.id)}
									aria-label={item.label}
									aria-current={isActive ? "page" : undefined}
									className={`flex size-11 shrink-0 items-center justify-center rounded-xl outline-none transition-[background-color,color,transform] duration-200 ease-out focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background active:bg-accent ${isActive ? "bg-accent text-accent-foreground hover:bg-accent" : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"}`}
								>
									<item.icon className="size-5" strokeWidth={1.75} />
								</Link>
							</TooltipTrigger>
							<TooltipContent side="top">{item.label}</TooltipContent>
						</Tooltip>
					);
				})}
			</nav>
		);
	}

	return (
		<Sidebar collapsible="icon" variant="floating">
			{/* Header: Logo + Project Name + Version */}
			<SidebarHeader>
				<SidebarMenu>
					<SidebarMenuItem>
						<div className="flex w-full items-center gap-2 rounded-md p-2 text-left">
								<img
									src={logoImage}
									alt="Know-Me"
									className="size-8 rounded-lg object-contain"
								/>
								<div className="grid flex-1 text-left text-sm leading-tight">
									<span className="truncate font-semibold">
										{config.name || "Know-Me"}
									</span>
								</div>
								{isExpanded && (
									<button
										type="button"
										onClick={onWorkspacePickerClick}
										className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
										title="Switch workspace"
									>
										<ArrowRightLeft className="h-4 w-4" />
									</button>
								)}
						</div>
					</SidebarMenuItem>
				</SidebarMenu>

				{/* Search Button */}
				{isExpanded && (
					<div className="px-2 pb-2">
						<button
							type="button"
							onClick={onSearchClick}
							className="flex w-full items-center gap-2 rounded-md bg-sidebar-accent/60 px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
						>
							<Search className="h-4 w-4" />
							<span>Search...</span>
							<kbd className="ml-auto pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground opacity-100">
								<span className="text-xs">⌘</span>K
							</kbd>
						</button>
					</div>
				)}
			</SidebarHeader>

			<SidebarContent>
				{/* Top Navigation */}
				<SidebarGroup>
					<SidebarGroupContent>
						<SidebarMenu>
							{visibleNavItems.map((item) => {
								const isActive = currentPage === item.id;
								return (
									<SidebarMenuItem key={item.id}>
										<SidebarMenuButton
											asChild
											isActive={isActive}
											tooltip={item.label}
										>
											<Link to={item.to} aria-current={isActive ? "page" : undefined} onClick={(event) => handlePageNavigation(event, item.id)}>
												<item.icon />
												<span>{item.label}</span>
											</Link>
										</SidebarMenuButton>
									</SidebarMenuItem>
								);
							})}
						</SidebarMenu>
					</SidebarGroupContent>
				</SidebarGroup>

			</SidebarContent>

			<SidebarFooter>
				<SidebarMenu>
					<SidebarMenuItem>
						<SidebarMenuButton
							asChild
							isActive={currentPage === "config"}
							tooltip="Settings"
						>
							<Link to="/config" onClick={(event) => handlePageNavigation(event, "config")}>
								<Settings />
								<span>Settings</span>
							</Link>
						</SidebarMenuButton>
					</SidebarMenuItem>
				</SidebarMenu>

				{/* GitHub + Version */}
				{isExpanded && (
					<div className="px-3 py-2 text-xs text-sidebar-foreground/50">
						<div className="flex items-center justify-between">
							<a
								href="https://github.com/hoangtrung1801/know-me"
								target="_blank"
								rel="noopener noreferrer"
								className="hover:text-sidebar-foreground transition-colors flex items-center gap-1"
							>
								<Github className="w-3 h-3" />
								GitHub
								<ExternalLink className="w-2.5 h-2.5" />
							</a>
							<a
								href="https://github.com/hoangtrung1801/know-me/releases"
								target="_blank"
								rel="noopener noreferrer"
								className="font-mono hover:text-sidebar-foreground transition-colors truncate max-w-[120px]"
								title={serverVersion || import.meta.env.APP_VERSION}
							>
								{serverVersion || import.meta.env.APP_VERSION}
							</a>
						</div>
					</div>
				)}
			</SidebarFooter>

			<SidebarRail />
		</Sidebar>
	);
}
