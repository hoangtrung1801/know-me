import { type KeyboardEvent, useEffect, useState, useRef, useCallback } from "react";
import {
	Settings,
	Check,
	Plus,
	Trash2,
	Columns3,
	User,
	Clock,
	Tag,
	Palette,
	Eye,
	Terminal,
	Bot,
	Loader2,
	AlertCircle,
	CheckCircle2,
	Monitor,
	Activity,
	Search,
	Wrench,
	Shield,
	Archive,
	type LucideIcon,
} from "lucide-react";
import { ScrollArea } from "../components/ui/ScrollArea";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Switch } from "../components/ui/switch";
import { Separator } from "../components/ui/separator";
import { Label } from "../components/ui/label";
import { Badge } from "../components/ui/badge";
import { useConfig, type Config, type ConfigPatch } from "../contexts/ConfigContext";
import { useAuth } from "../contexts/AuthContext";
import { useOpenCode } from "../contexts/OpenCodeContext";
import { useOpenCodeModelManager } from "../hooks/useOpencodeModelManager";
import { usePageLifecycle, usePersistentPageState } from "../contexts/PageWorkspaceContext";
import { OpenCodeModelManager } from "../components/organisms/OpenCodeModelManager";
import { toast } from "../components/ui/sonner";
import { saveUserPreferences, getRuntimeServices, linkClassifierApi, codexAgentApi, type RuntimeService } from "../api/client";
import type { CodexStatus } from "../models/agent";

const DEFAULT_STATUSES = ["todo", "in-progress", "in-review", "done", "blocked", "on-hold", "urgent"];
const COLOR_OPTIONS = ["gray", "blue", "green", "yellow", "red", "purple", "orange", "pink", "cyan", "indigo"];

function statusVariant(status?: string): "default" | "secondary" | "destructive" | "outline" {
	switch (status) {
		case "running":
		case "ready":
		case "installed":
			return "default";
		case "crashed":
		case "error":
			return "destructive";
		case "starting":
		case "indexing":
		case "degraded":
			return "secondary";
		default:
			return "outline";
	}
}

// ── Category definitions ──────────────────────────────────────────

type Category = "general" | "tasks" | "board" | "search" | "ai" | "runtime" | "security" | "advanced";

interface CategoryDef {
	id: Category;
	label: string;
	icon: LucideIcon;
	description: string;
}

const ALL_CATEGORIES: CategoryDef[] = [
	{ id: "general", label: "General", icon: Settings, description: "Project name, defaults, and preferences" },
	{ id: "tasks", label: "Task lifecycle", icon: Archive, description: "Retrieval, retention, and automatic archival" },
	{ id: "board", label: "Board", icon: Columns3, description: "Kanban statuses, colors, and visible columns" },
	{ id: "search", label: "Search", icon: Search, description: "Search configuration" },
	{ id: "ai", label: "AI", icon: Bot, description: "Codex task workflows and OpenCode Chat UI" },
	{ id: "runtime", label: "Runtime", icon: Monitor, description: "Runtime services and sub-processes" },
	{ id: "security", label: "Security", icon: Shield, description: "Password protection" },
	{ id: "advanced", label: "Advanced", icon: Wrench, description: "Git tracking, server, platforms, and JSON" },
];

// ── Auto-save hook ────────────────────────────────────────────────

function mergeConfigPatch(base: ConfigPatch, patch: ConfigPatch): ConfigPatch {
	return {
		...base,
		...patch,
		...(base.taskLifecycle || patch.taskLifecycle
			? { taskLifecycle: { ...(base.taskLifecycle || {}), ...(patch.taskLifecycle || {}) } }
			: {}),
	};
}

function applyConfigPatch(base: Config, patch: ConfigPatch): Config {
	const { taskLifecycle, ...flatPatch } = patch;
	return {
		...base,
		...flatPatch,
		...(taskLifecycle
			? { taskLifecycle: { ...(base.taskLifecycle || {}), ...taskLifecycle } as NonNullable<Config["taskLifecycle"]> }
			: {}),
	};
}

function useAutoSave(updateConfig: (c: ConfigPatch) => Promise<void>) {
	const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const pendingPatchRef = useRef<ConfigPatch>({});

	const save = useCallback(
		(patch: ConfigPatch) => {
			pendingPatchRef.current = mergeConfigPatch(pendingPatchRef.current, patch);
			if (timerRef.current) clearTimeout(timerRef.current);
			timerRef.current = setTimeout(async () => {
				const patchToSave = pendingPatchRef.current;
				pendingPatchRef.current = {};
				try {
					await updateConfig(patchToSave);
					toast.success("Saved", { duration: 1500, position: "bottom-right" });
				} catch (error) {
					toast.error(error instanceof Error ? error.message : "Failed to save settings", { position: "bottom-right" });
				}
			}, 600);
		},
		[updateConfig],
	);

	useEffect(() => {
		return () => {
			if (timerRef.current) clearTimeout(timerRef.current);
		};
	}, []);

	return save;
}

function editableConfig(config: Config): Config {
	const {
		capabilities: _readOnlyCapabilities,
		localONNX: _readOnlyLocalONNX,
		id: _readOnlyID,
		createdAt: _readOnlyCreatedAt,
		opencodeInstalled: _readOnlyOpenCodeInstalled,
		...editable
	} = config;
	return editable;
}

function effectiveSemanticProvider(config: Config): string {
	const configured = config.semanticSearch?.provider;
	if (config.localONNX?.supported === false && (!configured || configured === "local")) {
		return "ollama";
	}
	return configured || "local";
}

// ── Section header component ──────────────────────────────────────

function SectionHeader({ icon: Icon, title, description }: { icon: LucideIcon; title: string; description: string }) {
	return (
		<div className="mb-5">
			<div className="flex items-center gap-2.5 mb-1">
				<Icon className="w-[18px] h-[18px] text-muted-foreground" />
				<h3 className="text-sm font-semibold">{title}</h3>
			</div>
			<p className="text-xs text-muted-foreground ml-[30px]">{description}</p>
		</div>
	);
}

// ── Field row component ───────────────────────────────────────────

function FieldRow({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
	return (
		<div className="flex flex-col items-stretch gap-2 py-3 lg:flex-row lg:items-start lg:gap-4">
			<div className="w-full shrink-0 lg:w-44 lg:pt-2">
				<div className="text-sm font-medium">{label}</div>
				{hint && <div className="text-xs text-muted-foreground mt-0.5">{hint}</div>}
			</div>
			<div className="w-full min-w-0 flex-1">{children}</div>
		</div>
	);
}

function LinkClassifierSettings() {
	const [apiBase, setAPIBase] = useState("");
	const [apiKey, setAPIKey] = useState("");
	const [model, setModel] = useState("");
	const [busy, setBusy] = useState(false);
	const [result, setResult] = useState<{ success: boolean; error?: string } | null>(null);

	useEffect(() => {
		void linkClassifierApi.get().then((settings) => {
			setAPIBase(settings.apiBase);
			setModel(settings.model);
		}).catch(() => {});
	}, []);

	const test = async () => {
		setBusy(true);
		setResult(null);
		try {
			setResult(await linkClassifierApi.test({ apiBase: apiBase.trim(), apiKey: apiKey.trim(), model: model.trim() }));
		} catch (err) {
			setResult({ success: false, error: err instanceof Error ? err.message : "Request failed" });
		} finally {
			setBusy(false);
		}
	};

	const save = async () => {
		setBusy(true);
		try {
			const saved = await linkClassifierApi.save({ apiBase: apiBase.trim(), apiKey: apiKey.trim(), model: model.trim() });
			setAPIBase(saved.apiBase);
			setModel(saved.model);
			setAPIKey("");
			toast.success("Link classifier settings saved");
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Failed to save link classifier settings");
		} finally {
			setBusy(false);
		}
	};

	return <>
		<FieldRow label="API base URL"><Input aria-label="Link classifier API base URL" value={apiBase} onChange={(e) => setAPIBase(e.target.value)} placeholder="https://api.example/v1" /></FieldRow>
		<FieldRow label="API key" hint="Leave blank to keep the saved key"><Input aria-label="Link classifier API key" type="password" value={apiKey} onChange={(e) => setAPIKey(e.target.value)} placeholder="Bearer token" /></FieldRow>
		<FieldRow label="Model"><Input aria-label="Link classifier model" value={model} onChange={(e) => setModel(e.target.value)} placeholder="gpt-4o-mini" /></FieldRow>
		<div className="ml-[calc(11rem+1rem)] flex flex-wrap gap-2">
			<Button variant="outline" size="sm" onClick={() => void test()} disabled={busy || !apiBase.trim() || !model.trim()}>{busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}Test</Button>
			<Button size="sm" onClick={() => void save()} disabled={busy || !apiBase.trim() || !model.trim()}>Save</Button>
		</div>
		{result && <div className={`ml-[calc(11rem+1rem)] mt-2 rounded-md border px-3 py-2 text-sm ${result.success ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-destructive/30 bg-destructive/10 text-destructive"}`}>{result.success ? "Classifier connected." : result.error}</div>}
	</>;
}

// ── Main component ────────────────────────────────────────────────

export default function ConfigPage() {
	const { config: globalConfig, loading, updateConfig, refetch, chatUIEnabled } = useConfig();
	const { activationId, isActive, isHydrated } = usePageLifecycle("config");
	const [config, setConfig] = useState<Config>({});
	const semanticProvider = effectiveSemanticProvider(config);
	const [activeCategory, setActiveCategory] = usePersistentPageState<Category>("config", "activeCategory", "general", {
		encode: (value) => value,
		decode: (value) => ALL_CATEGORIES.some((category) => category.id === value) ? value as Category : undefined,
	});
	const [initialized, setInitialized] = useState(false);
	const [saving, setSaving] = useState(false);
	const [jsonText, setJsonText] = useState("");
	const [jsonError, setJsonError] = useState<string | null>(null);
	const [newStatus, setNewStatus] = usePersistentPageState("config", "newStatus", "");
	const { status: openCodeStatus, statusLoading: openCodeStatusLoading, providerResponse, providersLoading, lastLoadedAt, refreshAll } =
		useOpenCode();
	const [codexStatus, setCodexStatus] = useState<CodexStatus | null>(null);
	const [codexStatusLoading, setCodexStatusLoading] = useState(true);
	const [codexStatusError, setCodexStatusError] = useState<string | null>(null);
	const isActiveRef = useRef(isActive);
	isActiveRef.current = isActive;
	const loadCodexStatus = useCallback(async () => {
		if (!isActiveRef.current) return;
		setCodexStatusLoading(true);
		setCodexStatusError(null);
		try {
			const status = await codexAgentApi.status();
			if (isActiveRef.current) setCodexStatus(status);
		} catch (error) {
			if (isActiveRef.current) setCodexStatusError(error instanceof Error ? error.message : "Could not check Codex status");
		} finally {
			if (isActiveRef.current) setCodexStatusLoading(false);
		}
	}, []);

	useEffect(() => {
		if (!isHydrated || !isActiveRef.current) return;
		void loadCodexStatus();
	}, [activationId, isHydrated, loadCodexStatus]);

	const autoSave = useAutoSave(updateConfig);

	// Keep the local draft aligned with the latest effective server config.
	// Validation failures trigger a GET rollback in ConfigContext, which flows here.
	useEffect(() => {
		if (!loading) {
			setConfig(globalConfig);
			setJsonText(JSON.stringify(editableConfig(globalConfig), null, 2));
			if (!initialized) setInitialized(true);
		}
	}, [globalConfig, loading, initialized]);

	useEffect(() => {
		if (initialized) {
			void refreshAll({ silent: true });
		}
	}, [initialized, refreshAll]);

	useEffect(() => {
		if (!isHydrated || !isActiveRef.current || activationId === 0) return;
		void refetch();
		void refreshAll({ silent: true });
	}, [activationId, isHydrated, refetch, refreshAll]);

	// Update helper — updates local state + triggers auto-save
	const update = useCallback(
		(patch: ConfigPatch) => {
			setConfig((prev) => applyConfigPatch(prev, patch));
			autoSave(patch);
		},
		[autoSave],
	);

	const handleAddStatus = () => {
		if (!newStatus.trim()) return;
		const statusKey = newStatus.toLowerCase().replace(/\s+/g, "-");
		const currentStatuses = config.statuses || DEFAULT_STATUSES;
		if (currentStatuses.includes(statusKey)) {
			toast.error("Status already exists");
			return;
		}
		update({
			statuses: [...currentStatuses, statusKey],
			statusColors: { ...(config.statusColors || {}), [statusKey]: "gray" },
		});
		setNewStatus("");
	};

	const handleRemoveStatus = (status: string) => {
		const currentStatuses = config.statuses || DEFAULT_STATUSES;
		const newColors = { ...(config.statusColors || {}) };
		delete newColors[status];
		update({
			statuses: currentStatuses.filter((s) => s !== status),
			statusColors: newColors,
			visibleColumns: (config.visibleColumns || []).filter((c) => c !== status),
		});
	};

	const handleJsonSave = async () => {
		setSaving(true);
		try {
			const parsed = editableConfig(JSON.parse(jsonText) as Config);
			setConfig((current) => ({ ...current, ...parsed }));
			setJsonText(JSON.stringify(parsed, null, 2));
			setJsonError(null);
			await updateConfig(parsed);
			toast.success("Saved", { duration: 1500, position: "bottom-right" });
		} catch (e) {
			if (e instanceof SyntaxError) {
				setJsonError("Invalid JSON syntax");
			} else {
				toast.error(e instanceof Error ? e.message : "Failed to save");
			}
		} finally {
			setSaving(false);
		}
	};

	const updateOpenCodeServer = useCallback(
		(patch: NonNullable<Config["opencodeServer"]>) => {
			update({
				opencodeServer: {
					...(config.opencodeServer || {}),
					...patch,
				},
			});
		},
		[config.opencodeServer, update],
	);

	const { modelCatalog, updateModelPref, toggleProviderHidden, setDefaultModel } = useOpenCodeModelManager({
		settings: config.opencodeModels,
		providerResponse,
		status: openCodeStatus,
		lastLoadedAt,
		onChange: async (nextSettings) => {
			await saveUserPreferences({ opencodeModels: nextSettings });
			update({ opencodeModels: nextSettings });
		},
	});

	// Runtime services state
	const [services, setServices] = useState<RuntimeService[]>([]);
	const [servicesLoading, setServicesLoading] = useState(true);


	const loadRuntimeServices = useCallback(async () => {
		if (!isActiveRef.current) return;
		try {
			setServicesLoading(true);
			const data = await getRuntimeServices();
			if (isActiveRef.current) setServices(data.services);
		} catch {
			if (isActiveRef.current) setServices([]);
		} finally {
			if (isActiveRef.current) setServicesLoading(false);
		}
	}, []);

	useEffect(() => {
		if (!isHydrated || !isActiveRef.current) return;
		if (activeCategory === "runtime") {
			void loadRuntimeServices();
		}
	}, [activationId, activeCategory, isHydrated, loadRuntimeServices]);


	const statuses = config.statuses || DEFAULT_STATUSES;
	const statusColors = config.statusColors || {};

	// ── Filter categories based on chatUI visibility ──────────────

	const categories = ALL_CATEGORIES.filter((cat) => cat.id !== "ai" || chatUIEnabled);
	useEffect(() => {
		if (!categories.some((category) => category.id === activeCategory)) setActiveCategory("general");
	}, [activeCategory, chatUIEnabled]);
	const handleCategoryKeyDown = (
		event: KeyboardEvent<HTMLButtonElement>,
		categoryIndex: number,
	) => {
		let nextIndex: number | null = null;
		if (event.key === "ArrowRight") nextIndex = (categoryIndex + 1) % categories.length;
		if (event.key === "ArrowLeft") nextIndex = (categoryIndex - 1 + categories.length) % categories.length;
		if (event.key === "Home") nextIndex = 0;
		if (event.key === "End") nextIndex = categories.length - 1;
		if (nextIndex === null) return;

		const nextCategory = categories[nextIndex];
		if (!nextCategory) return;
		event.preventDefault();
		setActiveCategory(nextCategory.id);
		requestAnimationFrame(() => {
			document.getElementById(`settings-tab-${nextCategory.id}`)?.focus();
		});
	};

	// ── Render category content ───────────────────────────────────

	const renderGeneral = () => (
		<div>
			<SectionHeader icon={Settings} title="Project" description="Basic project information" />

			<FieldRow label="Project name" hint="Display name for your project">
				<Input
					value={config.name || ""}
					onChange={(e) => update({ name: e.target.value })}
					placeholder="My Project"
				/>
			</FieldRow>

			<FieldRow label="Workspace path" hint="Local project directory where background coding agents (OMP) execute">
				<Input
					value={config.workspacePath || ""}
					onChange={(e) => update({ workspacePath: e.target.value })}
					placeholder="/path/to/project"
				/>
			</FieldRow>

			<Separator className="my-1" />

			<SectionHeader icon={User} title="Defaults" description="Default values for new tasks" />

			<FieldRow label="Assignee" hint="Default assignee for new tasks">
				<Input
					value={config.defaultAssignee || ""}
					onChange={(e) => update({ defaultAssignee: e.target.value })}
					placeholder="@username"
				/>
			</FieldRow>

			<FieldRow label="Priority">
				<select
					value={config.defaultPriority || "medium"}
					onChange={(e) => update({ defaultPriority: e.target.value as Config["defaultPriority"] })}
					className="w-full px-3 py-2 rounded-md border bg-input text-sm focus:outline-none focus:ring-2 focus:ring-ring"
				>
					<option value="low">Low</option>
					<option value="medium">Medium</option>
					<option value="high">High</option>
				</select>
			</FieldRow>

			<FieldRow label="Labels" hint="Comma-separated">
				<Input
					value={config.defaultLabels?.join(", ") || ""}
					onChange={(e) =>
						update({
							defaultLabels: e.target.value
								.split(",")
								.map((l) => l.trim())
								.filter(Boolean),
						})
					}
					placeholder="frontend, backend, ui"
				/>
			</FieldRow>

			<Separator className="my-1" />

			<SectionHeader icon={Clock} title="Preferences" description="Display and editor settings" />

			<FieldRow label="Time format">
				<select
					value={config.timeFormat || "24h"}
					onChange={(e) => update({ timeFormat: e.target.value as Config["timeFormat"] })}
					className="w-full px-3 py-2 rounded-md border bg-input text-sm focus:outline-none focus:ring-2 focus:ring-ring"
				>
					<option value="12h">12-hour (AM/PM)</option>
					<option value="24h">24-hour</option>
				</select>
			</FieldRow>

			<FieldRow label="Editor" hint="CLI editor command">
				<Input
					value={config.editor || ""}
					onChange={(e) => update({ editor: e.target.value })}
					placeholder="code, vim, nano"
				/>
			</FieldRow>

			<Separator className="my-1" />
			<SectionHeader icon={Bot} title="Link classification" description="Automatically tag new saved links with an OpenAI-compatible model" />
			<LinkClassifierSettings />
		</div>
	);

	const renderBoard = () => (
		<div>
			<SectionHeader icon={Tag} title="Task Statuses" description="Define statuses and their colors for the Kanban board" />

			<div className="space-y-1.5 mb-4">
				{statuses.map((status) => (
					<div key={status} className="flex items-center gap-3 px-3 py-2 rounded-md bg-accent/50 hover:bg-accent transition-colors">
						<Palette className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
						<span className="flex-1 font-mono text-sm">{status}</span>
						<select
							value={statusColors[status] || "gray"}
							onChange={(e) => update({ statusColors: { ...(config.statusColors || {}), [status]: e.target.value } })}
							className="px-2 py-1 rounded border bg-input text-xs focus:outline-none focus:ring-2 focus:ring-ring"
						>
							{COLOR_OPTIONS.map((color) => (
								<option key={color} value={color}>{color}</option>
							))}
						</select>
						<button
							type="button"
							onClick={() => handleRemoveStatus(status)}
							className="p-1 text-muted-foreground hover:text-destructive rounded transition-colors"
						>
							<Trash2 className="w-3.5 h-3.5" />
						</button>
					</div>
				))}
			</div>

			<div className="flex gap-2 mb-6">
				<Input
					value={newStatus}
					onChange={(e) => setNewStatus(e.target.value)}
					placeholder="new-status"
					className="flex-1"
					onKeyDown={(e) => e.key === "Enter" && handleAddStatus()}
				/>
				<Button size="sm" onClick={handleAddStatus} variant="outline">
					<Plus className="w-4 h-4 mr-1" />
					Add
				</Button>
			</div>

			<Separator className="my-4" />

			<SectionHeader icon={Eye} title="Visible Columns" description="Choose which columns appear on the Kanban board" />

			<div className="space-y-1">
				{statuses.map((column) => {
					const isVisible = config.visibleColumns?.includes(column) ?? true;
					const label = column
						.split("-")
						.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
						.join(" ");

					return (
						<div
							key={column}
							className="flex items-center justify-between px-3 py-2.5 rounded-md hover:bg-accent/50 transition-colors"
						>
							<span className="text-sm">{label}</span>
							<Switch
								checked={isVisible}
								onCheckedChange={(checked) => {
									const current = config.visibleColumns || statuses;
									const updated = checked
										? [...current, column]
										: current.filter((c) => c !== column);
									update({ visibleColumns: updated });
								}}
							/>
						</div>
					);
				})}
			</div>
		</div>
	);

	const renderTaskLifecycle = () => {
		const lifecycle = config.taskLifecycle || {
			excludeDoneFromDefaultRetrieval: true,
			autoArchive: true,
			archiveAfter: "30d",
			purgeAfter: null,
		};
		const updateLifecycle = (patch: Partial<NonNullable<Config["taskLifecycle"]>>) => {
			update({ taskLifecycle: patch });
		};

		return (
			<div data-testid="task-lifecycle-settings">
				<SectionHeader
					icon={Archive}
					title="Task lifecycle"
					description="Keep completed and archived work out of default AI context while preserving it for explicit historical access"
				/>

				<FieldRow label="Exclude done from AI retrieval" hint="Human task views still show done Tasks by default">
					<Switch
						aria-label="Exclude done Tasks from default AI retrieval"
						checked={lifecycle.excludeDoneFromDefaultRetrieval}
						onCheckedChange={(checked) => updateLifecycle({ excludeDoneFromDefaultRetrieval: checked })}
					/>
				</FieldRow>

				<FieldRow label="Auto-archive" hint="When disabled, completed Tasks remain in the done lifecycle state">
					<Switch
						aria-label="Enable automatic Task archival"
						checked={lifecycle.autoArchive}
						onCheckedChange={(checked) => updateLifecycle({ autoArchive: checked })}
					/>
				</FieldRow>

				<FieldRow label="Archive after" hint="Backend duration, for example 0d, 30d, or 720h">
					<div className="space-y-1.5">
						<Input
							aria-label="Archive completed Tasks after"
							value={lifecycle.archiveAfter}
							onChange={(event) => updateLifecycle({ archiveAfter: event.target.value })}
							disabled={!lifecycle.autoArchive}
							placeholder="30d"
						/>
						<p className="text-xs text-muted-foreground">
							Zero means archive immediately after all backend eligibility checks pass; turning Auto-archive off disables the sweep.
						</p>
					</div>
				</FieldRow>

				<FieldRow label="Automatic purge" hint="Archived Task content is retained until an explicit guarded hard-delete">
					<div className="rounded-md border bg-muted/30 px-3 py-2 text-sm text-muted-foreground" data-testid="task-purge-disabled">
						Disabled ({lifecycle.purgeAfter === null ? "project default" : lifecycle.purgeAfter})
					</div>
				</FieldRow>
			</div>
		);
	};

	const renderSearch = () => (
		<div>
			<SectionHeader icon={Search} title="Search" description="Configure search settings" />

			<FieldRow label="Enabled">
				<Switch
					checked={config.semanticSearch?.enabled ?? false}
					onCheckedChange={(checked) => {
						const current = config.semanticSearch || {};
						update({ semanticSearch: { ...current, enabled: checked, provider: semanticProvider } });
					}}
				/>
			</FieldRow>

			<FieldRow label="Model" hint="Model identifier">
				<Input
					value={config.semanticSearch?.model || ""}
					onChange={(e) => update({ semanticSearch: { ...(config.semanticSearch || {}), model: e.target.value } })}
					placeholder="e.g. gte-small"
				/>
			</FieldRow>

			<FieldRow label="Dimensions" hint="Embedding vector size">
				<Input
					type="number"
					value={config.semanticSearch?.dimensions ?? 384}
					onChange={(e) => update({ semanticSearch: { ...(config.semanticSearch || {}), provider: semanticProvider, dimensions: parseInt(e.target.value, 10) || 384 } })}
				/>
			</FieldRow>

			<FieldRow label="Max Tokens" hint="Maximum tokens per chunk">
				<Input
					type="number"
					value={config.semanticSearch?.maxTokens ?? 512}
					onChange={(e) => update({ semanticSearch: { ...(config.semanticSearch || {}), provider: semanticProvider, maxTokens: parseInt(e.target.value, 10) || 512 } })}
				/>
			</FieldRow>
		</div>
	);


	const renderAI = () => {
		const codexCommand = codexStatus?.installed ? codexStatus.loginCommand : codexStatus?.installCommand;
		const codexTone = codexStatusLoading
			? "border-border bg-muted/40 text-muted-foreground"
			: codexStatus?.installed && codexStatus.loggedIn
				? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300"
				: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300";
		const statusTone = openCodeStatusLoading
			? "border-border bg-muted/40 text-muted-foreground"
			: openCodeStatus?.available
				? "border-emerald-200 bg-emerald-50 text-emerald-700"
				: "border-amber-200 bg-amber-50 text-amber-700";

		return (
			<div>
				<SectionHeader icon={Bot} title="Oh My Pi (OMP)" description="Local ACP background coding agent used by task workflows" />

				<FieldRow label="Connection" hint="Know-Me detects omp via ACP but never installs it or changes credentials automatically">
					<div className="space-y-3">
						<div className={`flex items-start gap-2 rounded-md border px-3 py-2 text-sm ${codexTone}`} aria-live="polite">
							{codexStatusLoading ? (
								<Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin" />
							) : codexStatus?.installed && codexStatus.loggedIn ? (
								<CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
							) : (
								<AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
							)}
							<div className="min-w-0">
								<div className="font-medium">
									{codexStatusLoading
										? "Checking Oh My Pi..."
										: codexStatus?.installed
											? codexStatus.loggedIn ? "Oh My Pi connected" : "Oh My Pi needs sign-in"
											: "omp executable is not installed"}
								</div>
								{codexStatus?.version && <div className="mt-1 text-xs opacity-80">{codexStatus.version}</div>}
								{codexStatusError && <div className="mt-1 text-xs text-destructive">{codexStatusError}</div>}
							</div>
						</div>
						{codexCommand && (
							<div className="flex items-start gap-2 rounded-md bg-muted/50 px-3 py-2">
								<code className="min-w-0 flex-1 break-all text-xs">{codexCommand}</code>
								<Button
									variant="ghost"
									size="icon"
									className="shrink-0"
									aria-label="Copy Codex ACP setup command"
									onClick={() => void navigator.clipboard.writeText(codexCommand)}
								>
									<Copy className="h-4 w-4" />
								</Button>
							</div>
						)}
						<div className="flex flex-wrap items-center gap-2">
							<Button variant="outline" size="sm" onClick={() => void loadCodexStatus()} disabled={codexStatusLoading}>
								{codexStatusLoading ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-1 h-4 w-4" />}
								Refresh status
							</Button>
							{codexStatus?.docsUrl && (
								<a className="text-sm text-primary underline-offset-4 hover:underline" href={codexStatus.docsUrl} target="_blank" rel="noreferrer">
									Setup guide
								</a>
							)}
						</div>
					</div>
				</FieldRow>

				<Separator className="my-4" />
				<SectionHeader icon={Bot} title="OpenCode" description="Configure the OpenCode server used by Chat UI" />

				<FieldRow label="Connection" hint="Chat UI is blocked when OpenCode is unavailable">
					<div className="space-y-3">
						<div className={`flex items-start gap-2 rounded-md border px-3 py-2 text-sm ${statusTone}`}>
							{openCodeStatusLoading ? (
								<Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin" />
							) : openCodeStatus?.available ? (
								<CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
							) : (
								<AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
							)}
							<div className="min-w-0">
								<div className="font-medium">
									{openCodeStatusLoading
										? "Checking OpenCode..."
										: openCodeStatus?.available
											? `Connected to ${openCodeStatus.host}:${openCodeStatus.port}`
											: openCodeStatus?.error || "OpenCode is unavailable."}
								</div>
								{!openCodeStatusLoading && !openCodeStatus?.cliAvailable && (
									<div className="mt-1 text-xs opacity-80">
										`opencode` CLI was not found, so auto-start is unavailable.
									</div>
								)}
							</div>
						</div>
						<Button variant="outline" size="sm" onClick={() => void refreshAll()} disabled={openCodeStatusLoading || providersLoading}>
							{openCodeStatusLoading || providersLoading ? "Checking..." : "Refresh status"}
						</Button>
					</div>
				</FieldRow>

				<FieldRow label="Password" hint="Optional basic auth password">
					<Input
						type="password"
						value={config.opencodeServer?.password || ""}
						onChange={(e) => updateOpenCodeServer({ password: e.target.value })}
						placeholder="Leave empty if OpenCode has no password"
					/>
				</FieldRow>

				<Separator className="my-4" />

				<SectionHeader
					icon={Bot}
					title="Model Manager"
					description="Enable models, choose the project default, and control what appears in the chat picker"
				/>

				<FieldRow label="Catalog" hint="Live provider/model catalog from OpenCode">
					<OpenCodeModelManager
						catalog={modelCatalog}
						lastLoadedAt={lastLoadedAt}
						onSetDefaultModel={setDefaultModel}
						onUpdateModelPref={updateModelPref}
						onToggleProviderHidden={toggleProviderHidden}
						showProviderVisibility
					/>
				</FieldRow>
			</div>
		);
	};


		const statusDotClass = (status: RuntimeService["status"]) => {
			switch (status) {
				case "running":
					return "bg-emerald-500";
			case "error":
				return "bg-red-500";
			default:
				return "bg-gray-400";
			}
		};

		const runtimeDetailValue = (service: RuntimeService, key: string) => {
			const value = service.details?.[key];
			if (value === undefined || value === null || value === "") return "";
			return String(value);
		};

		const runtimeServiceDetails = (service: RuntimeService) => {
			const items: Array<{ key: string; label: string; title?: string; destructive?: boolean }> = [];
			const add = (key: string, label: string, options: { title?: string; destructive?: boolean } = {}) => {
				const value = runtimeDetailValue(service, key);
				if (value) items.push({ key, label: `${label}=${value}`, ...options });
			};
			add("provider", "provider");
			add("model", "model");
			add("dimensions", "dims");
			add("runtime_loaded", "loaded");
			add("active_sessions", "sessions");
			const consumers = runtimeDetailValue(service, "consumers");
			if (consumers) {
				const count = consumers.split(",").filter((item) => item.trim()).length;
				items.push({ key: "consumers", label: `consumers=${count}`, title: consumers });
			}
			add("running_jobs", "jobs");
			add("queued_jobs", "queued");
			add("idle_unload_after", "idle");
			if (runtimeDetailValue(service, "degraded") === "true") {
				items.push({ key: "degraded", label: "degraded", destructive: true });
			}
			const error = runtimeDetailValue(service, "last_error") || runtimeDetailValue(service, "error");
			if (error) items.push({ key: "error", label: `error=${error}`, title: error, destructive: true });
			const log = runtimeDetailValue(service, "runtime_log");
			if (log) items.push({ key: "runtime_log", label: `log=${log}`, title: log });
			return items;
		};

		const renderRuntime = () => (
			<div>
				<SectionHeader icon={Monitor} title="Runtime Services" description="Managed sub-processes for this project" />

			<FieldRow label="Services" hint="Live process status from runtime">
				<div className="space-y-3">
					<div className="flex justify-end">
						<Button variant="outline" size="sm" onClick={() => void loadRuntimeServices()} disabled={servicesLoading}>
							{servicesLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
							Refresh
						</Button>
					</div>

					{servicesLoading ? (
						<div className="flex items-center justify-center py-6 rounded-lg border bg-muted/20">
							<Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
						</div>
					) : services.length === 0 ? (
						<div className="py-6 text-center border rounded-lg bg-muted/20">
							<Activity className="w-8 h-8 mx-auto text-muted-foreground" />
							<p className="mt-2 text-sm text-muted-foreground">No runtime services reported</p>
						</div>
					) : (
						<div className="space-y-2">
								{services.map((service) => {
									const running = service.status === "running";
									const disabled = service.status === "disabled" || !service.enabledInConfig;
									const details = runtimeServiceDetails(service);
									return (
										<div key={`${service.type}-${service.name}`} className="rounded-lg border bg-card p-3">
											<div className="flex items-start justify-between gap-3">
											<div className="flex items-start gap-3 min-w-0">
												<span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${statusDotClass(service.status)}`} />
												<div className="min-w-0">
													<div className="flex flex-wrap items-center gap-2">
														<span className="text-sm font-medium truncate">{service.name}</span>
														<span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground capitalize">{service.status}</span>
														{disabled && <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">disabled</span>}
													</div>
													<div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
														{running && service.pid ? <span>pid={service.pid}</span> : null}
															{running && service.port ? <span>:{service.port}</span> : null}
															{running && service.uptime ? <span>uptime={service.uptime}</span> : null}
														</div>
														{details.length > 0 && (
															<div className="mt-2 flex flex-wrap gap-1.5">
																{details.map((item) => (
																	<span
																		key={item.key}
																		title={item.title || item.label}
																		className={`max-w-full truncate rounded-md border px-2 py-0.5 text-xs ${
																			item.destructive
																				? "border-destructive/40 bg-destructive/10 text-destructive"
																				: "border-border bg-muted/40 text-muted-foreground"
																		}`}
																	>
																		{item.label}
																	</span>
																))}
															</div>
														)}
														{disabled && (
															<div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
																<PowerOff className="h-3.5 w-3.5" />
															Enable via settings or config set to start this service.
														</div>
													)}
												</div>
											</div>
											{running ? <Power className="h-4 w-4 text-emerald-600" /> : <PowerOff className="h-4 w-4 text-muted-foreground" />}
										</div>
									</div>
								);
							})}
						</div>
					)}
				</div>
			</FieldRow>

			<Separator className="my-4" />

			<SectionHeader icon={Monitor} title="Memory Limits" description="Control runtime memory process queue sizing" />

			<FieldRow label="Mode">
				<select
					value={config.runtimeMemory?.mode || "auto"}
					onChange={(e) =>
						update({ runtimeMemory: { ...(config.runtimeMemory || {}), mode: e.target.value } })
					}
					className="w-full px-3 py-2 rounded-md border bg-input text-sm focus:outline-none focus:ring-2 focus:ring-ring"
				>
					<option value="off">Off</option>
					<option value="auto">Auto</option>
					<option value="manual">Manual</option>
					<option value="debug">Debug</option>
				</select>
			</FieldRow>

			<FieldRow label="Max Items" hint="Maximum queued items (0 = unlimited)">
				<Input
					type="number"
					value={config.runtimeMemory?.maxItems ?? 0}
					onChange={(e) =>
						update({ runtimeMemory: { ...(config.runtimeMemory || {}), maxItems: parseInt(e.target.value, 10) || 0 } })
					}
				/>
			</FieldRow>

			<FieldRow label="Max Bytes" hint="Maximum memory in bytes (0 = unlimited)">
				<Input
					type="number"
					value={config.runtimeMemory?.maxBytes ?? 0}
					onChange={(e) =>
						update({ runtimeMemory: { ...(config.runtimeMemory || {}), maxBytes: parseInt(e.target.value, 10) || 0 } })
					}
				/>
			</FieldRow>
		</div>
	);

	const PLATFORM_OPTIONS = [
		{ id: "claude-code", label: "Claude Code" },
		{ id: "opencode", label: "OpenCode" },
		{ id: "gemini", label: "Gemini" },
		{ id: "copilot", label: "Copilot" },
		{ id: "agents", label: "Agents" },
	];


	// ── Security state ────────────────────────────────────────────────
	const { isProtected, setPassword: authSetPassword, removePassword: authRemovePassword } = useAuth();
	const [newPassword, setNewPassword] = useState("");
	const [securityLoading, setSecurityLoading] = useState(false);

	const handleSetPassword = async () => {
		if (!newPassword) return;
		setSecurityLoading(true);
		try {
			await authSetPassword(newPassword);
			setNewPassword("");
			toast.success("Password protection enabled");
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Failed to set password");
		} finally {
			setSecurityLoading(false);
		}
	};

	const handleRemovePassword = async () => {
		setSecurityLoading(true);
		try {
			await authRemovePassword();
			toast.success("Password protection disabled");
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Failed to remove password");
		} finally {
			setSecurityLoading(false);
		}
	};

	const renderSecurity = () => (
		<div>
			<SectionHeader icon={Shield} title="Password Protection" description="Protect WebUI access with a password (in-memory, not persisted)" />

			<FieldRow label="Status">
				<div className="flex items-center gap-3">
					<div className={`w-2.5 h-2.5 rounded-full ${isProtected ? "bg-green-500" : "bg-yellow-500"}`} />
					<span className="text-sm">{isProtected ? "Protected" : "Unprotected"}</span>
					{!isProtected && tunnelStatus.running && (
						<span className="text-xs text-destructive">(tunnel active without password)</span>
					)}
				</div>
			</FieldRow>

			{isProtected ? (
				<FieldRow label="Action">
					<Button variant="outline" onClick={handleRemovePassword} disabled={securityLoading}>
						{securityLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <PowerOff className="w-4 h-4 mr-2" />}
						Remove Password
					</Button>
				</FieldRow>
			) : (
				<FieldRow label="Set Password">
					<div className="flex items-center gap-2">
						<Input
							type="password"
							value={newPassword}
							onChange={(e) => setNewPassword(e.target.value)}
							placeholder="Enter password"
							onKeyDown={(e) => { if (e.key === "Enter") handleSetPassword(); }}
						/>
						<Button onClick={handleSetPassword} disabled={securityLoading || !newPassword}>
							{securityLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Check className="w-4 h-4 mr-2" />}
							Set
						</Button>
					</div>
				</FieldRow>
			)}
		</div>
	);

	const renderAdvanced = () => (
		<div>
			<SectionHeader icon={Wrench} title="Git Tracking" description="Control how the .know-me directory interacts with git" />

			<FieldRow label="Mode">
				<select
					value={config.gitTrackingMode || "none"}
					onChange={(e) => update({ gitTrackingMode: e.target.value })}
					className="w-full px-3 py-2 rounded-md border bg-input text-sm focus:outline-none focus:ring-2 focus:ring-ring"
				>
					<option value="git-tracked">Git Tracked</option>
					<option value="git-ignored">Git Ignored</option>
					<option value="none">None</option>
				</select>
			</FieldRow>

			<Separator className="my-1" />

			<SectionHeader icon={Settings} title="Server" description="Network configuration" />

			<FieldRow label="Server Port" hint="Port for the Know-Me server">
				<Input
					type="number"
					value={config.serverPort ?? 0}
					onChange={(e) => update({ serverPort: parseInt(e.target.value, 10) || 0 })}
				/>
			</FieldRow>

			<Separator className="my-1" />

			<SectionHeader icon={Settings} title="Platforms" description="Select which AI platforms are active" />

			<FieldRow label="Enabled platforms">
				<div className="space-y-2">
					{PLATFORM_OPTIONS.map((platform) => {
						const checked = (config.platforms || []).includes(platform.id);
						return (
							<div key={platform.id} className="flex items-center gap-3">
								<Switch
									checked={checked}
									onCheckedChange={(c) => {
										const current = config.platforms || [];
										const updated = c
											? [...current, platform.id]
											: current.filter((p) => p !== platform.id);
										update({ platforms: updated });
									}}
								/>
								<Label className="text-sm cursor-pointer">{platform.label}</Label>
							</div>
						);
					})}
				</div>
			</FieldRow>

			<Separator className="my-1" />

			<SectionHeader icon={Settings} title="Chat UI" description="Enable or disable the chat interface" />

			<FieldRow label="Enable Chat UI">
				<Switch
					checked={config.enableChatUI ?? true}
					onCheckedChange={(checked) => update({ enableChatUI: checked })}
				/>
			</FieldRow>

			<Separator className="my-4" />

			<SectionHeader icon={Terminal} title="JSON Editor" description="Raw config.json editing" />

			<div className="space-y-4">
				<div>
					<label className="block text-sm font-medium mb-2 flex items-center gap-2">
						<Terminal className="w-4 h-4 text-muted-foreground" />
						config.json
					</label>
					<textarea
						value={jsonText}
						onChange={(e) => {
							setJsonText(e.target.value);
							setJsonError(null);
						}}
						className="w-full h-[calc(100vh-480px)] min-h-[300px] px-4 py-3 rounded-lg border bg-input font-mono text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
						spellCheck={false}
					/>
					{jsonError && <p className="mt-2 text-sm text-destructive">{jsonError}</p>}
				</div>
				<Button onClick={handleJsonSave} disabled={saving}>
					<Check className="w-4 h-4 mr-2" />
					{saving ? "Saving..." : "Save"}
				</Button>
			</div>
		</div>
	);


	const contentByCategory: Record<Category, () => React.ReactNode> = {
		general: renderGeneral,
		tasks: renderTaskLifecycle,
		board: renderBoard,
		search: renderSearch,
		ai: renderAI,
		runtime: renderRuntime,
		security: renderSecurity,
		advanced: renderAdvanced,
	};

	// ── Main layout ───────────────────────────────────────────────
	if (loading) {
		return (
			<div className="p-6 flex items-center justify-center h-64">
				<div className="text-lg text-muted-foreground">Loading configuration...</div>
			</div>
		);
	}

	return (
		<div className="flex h-full min-w-0 flex-col overflow-hidden">
			{/* Top bar */}
			<div className="flex shrink-0 items-center justify-between gap-3 border-b px-4 py-4 md:px-6">
				<h1 className="text-lg font-semibold">Settings</h1>
				<Badge variant="outline" className="max-w-[60vw] truncate text-xs md:max-w-80">
					{config.name || "Unknown"}
				</Badge>
			</div>

			<div className="flex min-h-0 min-w-0 flex-1 flex-col md:flex-row">
				{/* Sidebar (desktop) */}
				<nav className="w-52 shrink-0 border-r bg-accent/30 p-3 hidden md:block">
					<div className="space-y-0.5">
						{categories.map((cat) => {
							const Icon = cat.icon;
							const isActive = activeCategory === cat.id;
							return (
								<button
									key={cat.id}
									type="button"
									aria-current={isActive ? "page" : undefined}
									onClick={() => setActiveCategory(cat.id)}
									className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors text-left ${
										isActive
											? "bg-accent font-medium"
											: "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
									}`}
								>
									<Icon className="w-4 h-4 shrink-0" />
									{cat.label}
								</button>
							);
						})}
					</div>
				</nav>

				{/* Mobile tabs */}
				<div
					role="tablist"
					aria-label="Settings categories"
					className="flex w-full min-w-0 shrink-0 gap-1 overflow-x-auto overscroll-x-contain border-b px-4 pt-2 md:hidden"
				>
					{categories.map((cat, categoryIndex) => {
						const Icon = cat.icon;
						const isActive = activeCategory === cat.id;
						return (
							<button
								id={`settings-tab-${cat.id}`}
								key={cat.id}
								type="button"
								role="tab"
								aria-selected={isActive}
								aria-controls="settings-panel"
								tabIndex={isActive ? 0 : -1}
								onClick={(event) => {
									setActiveCategory(cat.id);
									event.currentTarget.scrollIntoView({
										block: "nearest",
										inline: "nearest",
									});
								}}
								onKeyDown={(event) => handleCategoryKeyDown(event, categoryIndex)}
								className={`flex min-h-11 min-w-11 shrink-0 scroll-mx-4 items-center gap-1.5 whitespace-nowrap rounded-t-md px-3 py-2.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring ${
									isActive
										? "bg-background border border-b-0 text-foreground"
										: "text-muted-foreground hover:text-foreground"
								}`}
							>
								<Icon className="w-3.5 h-3.5" />
								{cat.label}
							</button>
						);
					})}
				</div>

				{/* Content */}
				<ScrollArea className="min-h-0 min-w-0 w-full flex-1">
					<div
						id="settings-panel"
						role="tabpanel"
						aria-label={`${categories.find((category) => category.id === activeCategory)?.label || "Active"} settings`}
						className="w-full max-w-2xl p-4 md:p-6"
					>
						{contentByCategory[activeCategory]()}
					</div>
				</ScrollArea>
			</div>

		</div>
	);
}
