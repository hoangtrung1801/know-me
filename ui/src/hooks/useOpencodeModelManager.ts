import { useCallback, useMemo } from "react";

import type { OpenCodeProviderResponse, OpenCodeStatus } from "../api/client";
import type { OpenCodeModelSettings } from "../models/chat";
import {
	canSelectCatalogModel,
	getCatalogModelByKey,
	normalizeOpenCodeCatalog,
	normalizeOpenCodeModelSettings,
} from "../lib/opencodeModels";
import { toast } from "../components/ui/sonner";

interface UseOpenCodeModelManagerOptions {
	settings?: OpenCodeModelSettings | null;
	providerResponse: OpenCodeProviderResponse | null;
	status?: OpenCodeStatus | null;
	lastLoadedAt?: string | null;
	onChange: (nextSettings: OpenCodeModelSettings) => void | Promise<void>;
}

export function useOpenCodeModelManager({
	settings,
	providerResponse,
	status,
	lastLoadedAt,
	onChange,
}: UseOpenCodeModelManagerOptions) {
	const modelSettings = useMemo(() => normalizeOpenCodeModelSettings(settings), [settings]);
	const modelCatalog = useMemo(
		() =>
			normalizeOpenCodeCatalog(providerResponse, modelSettings, {
				status,
				error: status?.available ? undefined : status?.error,
				lastLoadedAt: lastLoadedAt || undefined,
			}),
		[lastLoadedAt, modelSettings, providerResponse, status],
	);

	const buildConfiguredModelMap = useCallback(() => {
		const existingKeys = modelSettings.activeModels || [];
		return new Set(existingKeys);
	}, [modelSettings.activeModels]);

	const buildSettingsPayload = useCallback(
		(
			activeModels: Set<string>,
			defaultModel: OpenCodeModelSettings["defaultModel"],
			variantModels?: Record<string, string>,
		) => {
			const nextActiveModels = [...activeModels].sort();
			return {
				version: modelSettings.version,
				defaultModel: defaultModel ?? null,
				variantModels: variantModels !== undefined ? variantModels : { ...(modelSettings.variantModels || {}) },
				activeModels: nextActiveModels,
			} satisfies OpenCodeModelSettings;
		},
		[modelSettings.version, modelSettings.variantModels],
	);

	const updateModelPref = useCallback(
		(modelKey: string, patch: { enabled?: boolean; pinned?: boolean }) => {
			const current = buildConfiguredModelMap();
			if (patch.enabled === false) {
				current.delete(modelKey);
			} else if (patch.enabled === true) {
				current.add(modelKey);
			}
			const nextSettings = buildSettingsPayload(current, modelSettings.defaultModel ?? null);
			if (patch.enabled === false && modelSettings.defaultModel?.key === modelKey) {
				nextSettings.defaultModel = null;
				toast.info("Default model cleared because it is no longer available.");
			}
			void onChange(nextSettings);
		},
		[buildConfiguredModelMap, buildSettingsPayload, modelSettings, onChange],
	);

	const toggleProviderHidden = useCallback(
		(providerID: string, hidden: boolean, modelKeys?: string[]) => {
			const current = buildConfiguredModelMap();
			let defaultCleared = false;

			if (modelKeys && modelKeys.length > 0) {
				modelKeys.forEach((modelKey) => {
					if (hidden) {
						current.delete(modelKey);
					} else {
						current.add(modelKey);
					}
					if (hidden && modelSettings.defaultModel?.key === modelKey) {
						defaultCleared = true;
					}
				});
			}

			if (defaultCleared) {
				toast.info("Default model cleared because it is no longer enabled.");
			}

			void onChange(buildSettingsPayload(current, defaultCleared ? null : modelSettings.defaultModel ?? null));
		},
		[buildConfiguredModelMap, buildSettingsPayload, modelSettings, onChange],
	);

	const setDefaultModel = useCallback(
		(modelKey: string | null) => {
			if (!modelKey) {
				void onChange(buildSettingsPayload(buildConfiguredModelMap(), null));
				return;
			}
			const selected = getCatalogModelByKey(modelCatalog, modelKey);
			if (!canSelectCatalogModel(selected)) {
				toast.error("Only enabled models from connected providers can be set as default.");
				return;
			}
			const current = buildConfiguredModelMap();
			current.add(modelKey);
			void onChange(
				buildSettingsPayload(
					current,
					selected
						? {
							key: selected.key,
							providerID: selected.providerID,
							modelID: selected.modelID,
						}
						: null,
				),
			);
		},
		[buildConfiguredModelMap, buildSettingsPayload, modelCatalog, onChange],
	);

	const setDefaultVariant = useCallback(
		(modelKey: string, variant: string | null) => {
			const nextVariantModels = { ...(modelSettings.variantModels || {}) };
			if (variant) {
				nextVariantModels[modelKey] = variant;
			} else {
				delete nextVariantModels[modelKey];
			}
			void onChange(buildSettingsPayload(buildConfiguredModelMap(), modelSettings.defaultModel ?? null, nextVariantModels));
		},
		[buildConfiguredModelMap, buildSettingsPayload, modelSettings, onChange],
	);

	return {
		modelSettings,
		modelCatalog,
		updateModelPref,
		toggleProviderHidden,
		setDefaultModel,
		setDefaultVariant,
	};
}
