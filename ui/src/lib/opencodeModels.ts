import type { OpenCodeProviderResponse, OpenCodeStatus } from "../api/client";
import type {
	ModelRef,
	OpenCodeCatalogModel,
	OpenCodeCatalogProvider,
	OpenCodeCatalogState,
	OpenCodeModelSettings,
} from "../models/chat";

const MODEL_SETTINGS_VERSION = 1;

export function createModelRef(providerID: string, modelID: string, variant?: string | null): ModelRef {
	return {
		key: `${providerID}:${modelID}`,
		providerID,
		modelID,
		variant: variant ?? null,
	};
}

export function getModelKey(model?: Pick<ModelRef, "providerID" | "modelID"> | null): string {
	if (!model?.providerID || !model?.modelID) return "";
	return `${model.providerID}:${model.modelID}`;
}

export function parseModelKey(key: string): ModelRef | null {
	const [providerID, ...rest] = key.split(":");
	const modelID = rest.join(":");
	if (!providerID || !modelID) return null;
	return createModelRef(providerID, modelID);
}

export function normalizeOpenCodeModelSettings(
	settings?: OpenCodeModelSettings | null,
): OpenCodeModelSettings {
	return {
		version: settings?.version || MODEL_SETTINGS_VERSION,
		defaultModel: settings?.defaultModel ? { ...settings.defaultModel } : null,
		variantModels: { ...(settings?.variantModels || {}) },
		activeModels: [...new Set(settings?.activeModels || [])].sort(),
		hiddenProviders: [...(settings?.hiddenProviders || [])],
	};
}

export function parseOpenCodeDefault(payload?: Record<string, string>): ModelRef | null {
	if (!payload) return null;
	if (payload.providerID && payload.modelID) {
		return createModelRef(payload.providerID, payload.modelID);
	}
	const entries = Object.entries(payload);
	if (entries.length === 1) {
		const firstEntry = entries[0];
		if (!firstEntry) return null;
		const [providerID, modelID] = firstEntry;
		if (providerID && modelID) {
			return createModelRef(providerID, modelID);
		}
	}
	return null;
}

function compareModels(left: OpenCodeCatalogModel, right: OpenCodeCatalogModel): number {
	return left.modelName.localeCompare(right.modelName);
}

function compareProviders(left: OpenCodeCatalogProvider, right: OpenCodeCatalogProvider): number {
	return left.name.localeCompare(right.name);
}

function inferImageSupportFromModelId(
	model?: Pick<OpenCodeCatalogModel, "providerID" | "modelID"> | Pick<ModelRef, "providerID" | "modelID"> | null,
): boolean {
	if (!model?.providerID || !model?.modelID) return false;
	const providerID = model.providerID.toLowerCase();
	const modelID = model.modelID.toLowerCase();

	if (
		modelID.includes("embedding") ||
		modelID.includes("tts") ||
		modelID.includes("audio") ||
		modelID.includes("live")
	) {
		return false;
	}

	if (providerID.startsWith("google")) return true;
	if (providerID.startsWith("minimax")) return true;
	if (providerID === "openai") return modelID.startsWith("gpt-4") || modelID.startsWith("gpt-5");
	if (modelID.includes("image") || modelID.includes("vision")) return true;

	return false;
}

export function normalizeOpenCodeCatalog(
	response: OpenCodeProviderResponse | null,
	settings?: OpenCodeModelSettings | null,
	options?: {
		status?: OpenCodeStatus | null;
		error?: string;
		lastLoadedAt?: string;
	},
): OpenCodeCatalogState {
	const normalizedSettings = normalizeOpenCodeModelSettings(settings);
	const configuredModelKeys = new Set(normalizedSettings.activeModels || []);
	const hasConfiguredModels = configuredModelKeys.size > 0;
	const connectedSet = new Set(response?.connected || []);
	const connectedKnown = Array.isArray(response?.connected);
	const apiDefault = parseOpenCodeDefault(response?.default);
	const models: OpenCodeCatalogModel[] = [];
	const providers: OpenCodeCatalogProvider[] = [];
	const seenKeys = new Set<string>();

	for (const provider of response?.all || []) {
		const providerModels: OpenCodeCatalogModel[] = [];
		const connected = connectedKnown ? connectedSet.has(provider.id) : true;
		for (const model of Object.values(provider.models || {})) {
			const ref = createModelRef(provider.id, model.id);
			const enabled = hasConfiguredModels ? configuredModelKeys.has(ref.key) : false;
			const catalogModel: OpenCodeCatalogModel = {
				key: ref.key,
				providerID: provider.id,
				providerName: provider.name,
				modelID: model.id,
				modelName: model.name,
				connected,
				apiDefault: apiDefault?.key === ref.key,
				enabled,
				pinned: false,
				hiddenByProvider: false,
				selectable: enabled && connected,
				supportsImageInput:
					typeof model.capabilities?.input?.image === "boolean"
						? model.capabilities.input.image
						: inferImageSupportFromModelId(ref),
				variants: model.variants,
			};
			providerModels.push(catalogModel);
			models.push(catalogModel);
			seenKeys.add(ref.key);
		}
		providerModels.sort(compareModels);
		providers.push({
			id: provider.id,
			name: provider.name,
			connected,
			hidden: false,
			models: providerModels,
		});
	}

	providers.sort(compareProviders);

	const staleModels: OpenCodeCatalogModel[] = (normalizedSettings.activeModels || [])
		.filter((key) => !seenKeys.has(key))
		.map((key) => {
			const ref = parseModelKey(key);
			return {
				key,
				providerID: ref?.providerID || "unknown",
				providerName: ref?.providerID || "Unavailable",
				modelID: ref?.modelID || key,
				modelName: ref?.modelID || key,
				connected: false,
				apiDefault: false,
				enabled: true,
				pinned: false,
				hiddenByProvider: false,
				selectable: false,
				stale: true,
			};
		})
		.sort(compareModels);

	const projectDefault = normalizedSettings.defaultModel || null;
	const availableModels = models;
	const selectableProjectDefault =
		projectDefault && availableModels.some((model) => model.key === projectDefault.key && model.selectable)
			? projectDefault
			: null;
	const selectableApiDefault =
		apiDefault && availableModels.some((model) => model.key === apiDefault.key && model.selectable) ? apiDefault : null;
	const firstSelectable = availableModels.find((model) => model.selectable);
	const firstEnabledConnected = availableModels.find((model) => model.enabled && model.connected && !model.hiddenByProvider);
	const firstEnabled = availableModels.find((model) => model.enabled && !model.hiddenByProvider);
	const resolvedDefault =
		selectableProjectDefault ||
		selectableApiDefault ||
		(firstSelectable ? createModelRef(firstSelectable.providerID, firstSelectable.modelID) : null) ||
		(firstEnabledConnected ? createModelRef(firstEnabledConnected.providerID, firstEnabledConnected.modelID) : null) ||
		(firstEnabled ? createModelRef(firstEnabled.providerID, firstEnabled.modelID) : null);

	return {
		status: options?.error ? "error" : response ? "ready" : options?.status ? (options.status.available ? "loading" : "idle") : "idle",
		providers,
		models: [...models].sort(compareModels),
		staleModels,
		apiDefault,
		projectDefault,
		effectiveDefault: resolvedDefault,
		error: options?.error,
		lastLoadedAt: options?.lastLoadedAt,
	};
}

export function getCatalogModelByKey(catalog: OpenCodeCatalogState, key?: string | null): OpenCodeCatalogModel | undefined {
	if (!key) return undefined;
	return [...catalog.models, ...catalog.staleModels].find((model) => model.key === key);
}

export function getModelRefLabel(model?: ModelRef | null, catalog?: OpenCodeCatalogState | null): string {
	if (!model) return "Auto";
	const catalogModel = catalog ? getCatalogModelByKey(catalog, model.key) : undefined;
	if (catalogModel) {
		return catalogModel.providerName ? `${catalogModel.modelName} · ${catalogModel.providerName}` : catalogModel.modelName;
	}
	return model.providerID ? `${model.modelID} · ${model.providerID}` : model.modelID;
}

export function buildAutoModelLabel(catalog: OpenCodeCatalogState): string {
	if (catalog.effectiveDefault) {
		return `Auto (${getModelRefLabel(catalog.effectiveDefault, catalog)})`;
	}
	return "Auto";
}

export function getPickerModels(catalog: OpenCodeCatalogState): OpenCodeCatalogProvider[] {
	return catalog.providers
		.map((provider) => ({
			...provider,
			models: provider.models.filter((model) => model.enabled && !model.hiddenByProvider && model.connected),
		}))
		.filter((provider) => provider.models.length > 0);
}

export function canSelectCatalogModel(model?: OpenCodeCatalogModel | null): boolean {
	return Boolean(model && model.enabled && model.connected && !model.hiddenByProvider && !model.stale);
}

export function supportsImageInputForModel(
	model?:
		| Pick<OpenCodeCatalogModel, "providerID" | "modelID" | "supportsImageInput">
		| Pick<ModelRef, "providerID" | "modelID">
		| null,
): boolean {
	if (typeof model?.supportsImageInput === "boolean") {
		return model.supportsImageInput;
	}
	return inferImageSupportFromModelId(model);
}
