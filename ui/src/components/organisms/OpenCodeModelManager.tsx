import { useMemo, useState } from "react";
import { Plus, Search, Star } from "lucide-react";

import type { OpenCodeCatalogModel, OpenCodeCatalogState } from "../../models/chat";
import { getModelRefLabel } from "../../lib/opencodeModels";
import { cn } from "../../lib/utils";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Switch } from "../ui/switch";
import { ProviderConnectDialog } from "./ProviderManagement/ProviderConnectDialog";

interface OpenCodeModelManagerProps {
	catalog: OpenCodeCatalogState;
	lastLoadedAt?: string | null;
	onSetDefaultModel: (modelKey: string | null) => void;
	onUpdateModelPref: (modelKey: string, patch: { enabled?: boolean; pinned?: boolean }) => void;
	onToggleProviderHidden?: (providerID: string, hidden: boolean, modelKeys?: string[]) => void;
	showProviderVisibility?: boolean;
	compact?: boolean;
}

export function OpenCodeModelManager({
	catalog,
	lastLoadedAt,
	onSetDefaultModel,
	onUpdateModelPref,
	onToggleProviderHidden,
	showProviderVisibility = false,
	compact = false,
}: OpenCodeModelManagerProps) {
	const [query, setQuery] = useState("");

	const connectedProviders = useMemo(() => {
		return catalog.providers.filter((provider) => provider.connected || provider.models.some((model) => model.connected));
	}, [catalog.providers]);

	const filteredProviders = useMemo(() => {
		const normalized = query.trim().toLowerCase();
		if (!normalized) return connectedProviders;
		return connectedProviders
			.map((provider) => ({
				...provider,
				models: provider.models.filter(
					(model) =>
						model.modelName.toLowerCase().includes(normalized) ||
						provider.name.toLowerCase().includes(normalized) ||
						model.key.toLowerCase().includes(normalized),
				),
			}))
			.filter((provider) => provider.models.length > 0 || provider.name.toLowerCase().includes(normalized));
	}, [connectedProviders, query]);

	const connectedModels = catalog.models.filter((model) => model.connected).length;
	const activeProviders = connectedProviders.filter((provider) => provider.models.every((model) => model.enabled)).length;
	const heightClass = compact ? "max-h-[calc(80vh-180px)]" : "max-h-[620px]";
	const [connectOpen, setConnectOpen] = useState(false);

	const handleProviderToggle = (providerID: string, hidden: boolean, modelKeys: string[]) => {
		onToggleProviderHidden?.(providerID, hidden, modelKeys);
	};

	return (
		<div className="space-y-4">
			<div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
				{!compact && (
					<>
						<Badge variant="outline">{connectedProviders.length} providers</Badge>
						<Badge variant="outline">{connectedModels} models</Badge>
						<Badge variant="outline">{activeProviders} active</Badge>
						{catalog.effectiveDefault && (
							<Badge variant="outline">Default: {getModelRefLabel(catalog.effectiveDefault, catalog)}</Badge>
						)}
						{lastLoadedAt && <span>Updated {new Date(lastLoadedAt).toLocaleTimeString()}</span>}
					</>
				)}
				<Button
					variant="outline"
					size="sm"
					className="ml-auto h-7 gap-1.5 rounded-lg px-2.5 text-xs"
					onClick={() => setConnectOpen(true)}
				>
					<Plus className="h-3.5 w-3.5" />
					Connect provider
				</Button>
			</div>
			<ProviderConnectDialog open={connectOpen} onClose={() => setConnectOpen(false)} />

			{!compact && catalog.projectDefault && !catalog.models.some((model) => model.key === catalog.projectDefault?.key) && (
				<div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
					Project default `{catalog.projectDefault.key}` is unavailable. Chat falls back to the next connected enabled model.
				</div>
			)}

			<div className="relative">
				<Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
				<Input
					value={query}
					onChange={(event) => setQuery(event.target.value)}
					placeholder="Search providers or models"
					className={cn(
						"h-12 pl-9",
						compact ? "rounded-2xl border-border/50 bg-muted/30" : "rounded-xl border-border/60 bg-muted/20",
					)}
				/>
			</div>

			<div className={cn("overflow-y-auto pr-3", heightClass)}>
				<div className={cn(compact ? "space-y-6" : "space-y-4")}>
					{filteredProviders.length === 0 ? (
						<div className="rounded-xl border border-dashed px-4 py-6 text-sm text-muted-foreground">
							No connected providers or models match this search.
						</div>
					) : (
						filteredProviders.map((provider) => (
							<div
								key={provider.id}
								className={cn(
									compact ? "" : "rounded-2xl border border-border/70 bg-muted/10 p-4",
								)}
							>
								<div className="flex flex-wrap items-start justify-between gap-4">
									<div className="min-w-0">
										<div className={cn("font-medium", compact ? "text-[15px] text-foreground/80" : "text-sm font-semibold")}>
											{provider.name}
										</div>
										{!compact && (
											<div className="mt-1 text-xs text-muted-foreground">
												{provider.models.length} connected model{provider.models.length !== 1 ? "s" : ""}
											</div>
										)}
									</div>
									{showProviderVisibility && onToggleProviderHidden && (
										<div className={cn(
											"flex items-center px-1 py-1",
											compact ? "" : "rounded-lg",
										)}>
											<Switch
												checked={provider.models.every((model) => model.enabled)}
												aria-label={`${provider.name} visibility`}
												onCheckedChange={(checked) =>
													handleProviderToggle(
														provider.id,
														!checked,
														provider.models.map((model) => model.key),
													)
												}
											/>
										</div>
									)}
								</div>
								<div className={cn(compact ? "mt-3 space-y-4 pl-0" : "mt-4 space-y-3")}>
									{provider.models.map((model) => {
										const isDefault = catalog.projectDefault?.key === model.key;
										const canDefault = model.connected && model.enabled;
										return (
											<ModelRow
												key={model.key}
												model={model}
												isDefault={isDefault}
												canDefault={canDefault}
												onSetDefaultModel={onSetDefaultModel}
												onUpdateModelPref={onUpdateModelPref}
												compact={compact}
											/>
										);
									})}
								</div>
							</div>
						))
					)}

					{!compact && catalog.staleModels.length > 0 && (
						<div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4 text-sm text-amber-900">
							<div className="mb-2 font-medium">Unavailable models in config</div>
							<div className="space-y-2 text-xs">
								{catalog.staleModels.map((model) => (
									<div key={model.key} className="flex items-center justify-between gap-3 rounded-xl border border-amber-200/80 bg-white/70 px-3 py-2">
										<div>
											<div className="font-medium">{model.modelName}</div>
											<div className="text-amber-800/80">{model.key}</div>
										</div>
										<Button variant="outline" size="sm" className="h-8" onClick={() => onUpdateModelPref(model.key, { enabled: false, pinned: false })}>
											Disable
										</Button>
									</div>
								))}
							</div>
						</div>
					)}
				</div>
			</div>
		</div>
	);
}

function ModelRow({
	model,
	isDefault,
	canDefault,
	onSetDefaultModel,
	onUpdateModelPref,
	compact = false,
}: {
	model: OpenCodeCatalogModel;
	isDefault: boolean;
	canDefault: boolean;
	onSetDefaultModel: (modelKey: string | null) => void;
	onUpdateModelPref: (modelKey: string, patch: { enabled?: boolean; pinned?: boolean }) => void;
	compact?: boolean;
}) {
	const isVisible = model.enabled;

	return (
		<div
			className={cn(
				"transition-colors",
				compact ? "py-0.5" : "rounded-xl border border-border/60 bg-background/80 p-3",
				isDefault && "border-primary/30 bg-primary/5",
			)}
		>
			<div className={cn("grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-start", compact && "gap-2")}>
				<div className="min-w-0 flex-1">
					<div className="flex flex-wrap items-center gap-2 text-sm font-medium">
						<span className="truncate">{model.modelName}</span>
						{!compact && model.apiDefault && <Badge variant="outline">API default</Badge>}
						{!compact && <Badge variant="outline">{model.connected ? "Connected" : "Offline"}</Badge>}
					</div>
					{!compact && <div className="mt-1 truncate text-xs text-muted-foreground">{model.key}</div>}
				</div>
				<div className="flex flex-wrap items-center gap-2 md:justify-end">
					<Button
						variant="ghost"
						size="icon"
						className={cn(
							compact ? "h-8 w-8 rounded-full" : "h-9 w-9 rounded-full",
							isDefault ? "text-amber-500 hover:text-amber-600" : "text-muted-foreground hover:text-foreground",
						)}
						onClick={() => onSetDefaultModel(isDefault ? null : model.key)}
						disabled={!canDefault && !isDefault}
						title={isDefault ? "Unset default model" : "Set as default model"}
						aria-label={isDefault ? `Unset ${model.modelName} as default model` : `Set ${model.modelName} as default model`}
					>
						<Star className={cn("h-4 w-4", isDefault && "fill-current")} />
					</Button>
					<div className={cn(
						"flex items-center px-1 py-1",
						compact ? "" : "rounded-lg",
					)}>
						<Switch
							checked={isVisible}
							aria-label={`${model.modelName} visibility`}
							onCheckedChange={(checked) => onUpdateModelPref(model.key, { enabled: checked })}
						/>
					</div>
				</div>
			</div>
		</div>
	);
}
