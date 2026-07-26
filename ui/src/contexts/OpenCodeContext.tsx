import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { opencodeApi, type OpenCodeAuth, type OpenCodeProviderResponse, type OpenCodeStatus, type ProviderAuthAuthorization, type ProviderAuthMethod } from "../api/client";
import { useConfig } from "./ConfigContext";
import { useSSEEvent } from "./SSEContext";

export interface CustomProviderParams {
	id: string;
	name: string;
	baseURL: string;
	models: Record<string, { name: string }>;
	headers?: Record<string, string>;
	apiKey?: string;
}

interface OpenCodeContextType {
	status: OpenCodeStatus | null;
	statusLoading: boolean;
	providerResponse: OpenCodeProviderResponse | null;
	providersLoading: boolean;
	providersError: string | null;
	lastLoadedAt: string | null;
	providerAuthMethods: Record<string, ProviderAuthMethod[]> | null;
	refreshStatus: (options?: { silent?: boolean; fallback?: string }) => Promise<OpenCodeStatus>;
	refreshProviders: (options?: { silent?: boolean; fallback?: string }) => Promise<OpenCodeProviderResponse | null>;
	refreshAll: (options?: { silent?: boolean; fallback?: string }) => Promise<OpenCodeProviderResponse | null>;
	connectWithApiKey: (id: string, key: string) => Promise<void>;
	startOAuth: (id: string, method: number) => Promise<ProviderAuthAuthorization>;
	finishOAuth: (id: string, method: number, code?: string) => Promise<void>;
	disconnectProvider: (id: string) => Promise<void>;
	addCustomProvider: (params: CustomProviderParams) => Promise<void>;
}

const OpenCodeContext = createContext<OpenCodeContextType | undefined>(undefined);

function createFallbackStatus(message: string): OpenCodeStatus {
	return {
		configured: true,
		mode: "managed",
		state: "unavailable",
		available: false,
		ready: false,
		host: "",
		port: 0,
		cliAvailable: false,
		cliInstalled: false,
		error: message,
	};
}

function getErrorMessage(error: unknown, fallback: string): string {
	return error instanceof Error ? error.message || fallback : fallback;
}

export function OpenCodeProvider({ children }: { children: ReactNode }) {
	const { config } = useConfig();
	const [status, setStatus] = useState<OpenCodeStatus | null>(null);
	const [statusLoading, setStatusLoading] = useState(false);
	const [providerResponse, setProviderResponse] = useState<OpenCodeProviderResponse | null>(null);
	const [providersLoading, setProvidersLoading] = useState(false);
	const [providersError, setProvidersError] = useState<string | null>(null);
	const [lastLoadedAt, setLastLoadedAt] = useState<string | null>(null);
	const [providerAuthMethods, setProviderAuthMethods] = useState<Record<string, ProviderAuthMethod[]> | null>(null);

	const refreshStatus = useCallback(async (options?: { silent?: boolean; fallback?: string }) => {
		setStatusLoading(true);
		try {
			const nextStatus = await opencodeApi.getStatus();
			setStatus(nextStatus);
			return nextStatus;
		} catch (error) {
			const message = getErrorMessage(error, options?.fallback || "Failed to reach OpenCode");
			const fallbackStatus = createFallbackStatus(message);
			setStatus(fallbackStatus);
			return fallbackStatus;
		} finally {
			setStatusLoading(false);
		}
	}, []);

	// When the server broadcasts a new runtime status after workspace switch,
	// update local state immediately without a round-trip API call.
	useSSEEvent("opencode:status", useCallback((data) => {
		setStatus(data as unknown as OpenCodeStatus);
	}, []));

	const refreshProviders = useCallback(async (options?: { silent?: boolean; fallback?: string }) => {
		setProvidersLoading(true);
		setProvidersError(null);
		try {
			const response = await opencodeApi.listProviders();
			setProviderResponse(response);
			setLastLoadedAt(new Date().toISOString());
			return response;
		} catch (error) {
			const message = getErrorMessage(error, options?.fallback || "Failed to load OpenCode providers");
			setProvidersError(message);
			setProviderResponse(null);
			return null;
		} finally {
			setProvidersLoading(false);
		}
	}, []);

	const refreshAll = useCallback(
		async (options?: { silent?: boolean; fallback?: string }) => {
			const nextStatus = await refreshStatus(options);
			if (!nextStatus.available) {
				setProviderResponse(null);
				setProvidersError(nextStatus.error || null);
				return null;
			}
			return refreshProviders(options);
		},
		[refreshProviders, refreshStatus],
	);

	const refreshProviderAuth = useCallback(async () => {
		try {
			const methods = await opencodeApi.getProviderAuth();
			setProviderAuthMethods(methods);
		} catch {
			// non-critical — auth methods are best-effort
		}
	}, []);

	const connectWithApiKey = useCallback(
		async (id: string, key: string) => {
			const auth: OpenCodeAuth = { type: "api", key };
			await opencodeApi.setAuth(id, auth);
			await refreshAll({ silent: true });
		},
		[refreshAll],
	);

	const startOAuth = useCallback(async (id: string, method: number) => {
		return opencodeApi.oauthAuthorize(id, method);
	}, []);

	const disconnectProvider = useCallback(
		async (id: string) => {
			await opencodeApi.deleteAuth(id);
			await opencodeApi.globalDispose();
			await refreshProviders({ silent: true });
		},
		[refreshProviders],
	);

	const finishOAuth = useCallback(
		async (id: string, method: number, code?: string) => {
			await opencodeApi.oauthCallback(id, method, code);
			await opencodeApi.globalDispose();
			await refreshAll({ silent: true });
		},
		[refreshAll],
	);

	const addCustomProvider = useCallback(
		async (params: CustomProviderParams) => {
			const providerConfig: Record<string, unknown> = {
				npm: "@ai-sdk/openai-compatible",
				name: params.name,
				options: {
					baseURL: params.baseURL,
					...(params.headers && Object.keys(params.headers).length > 0 ? { headers: params.headers } : {}),
				},
				models: params.models,
			};
			await opencodeApi.patchConfig({ provider: { [params.id]: providerConfig } });
			if (params.apiKey) {
				await opencodeApi.setAuth(params.id, { type: "api", key: params.apiKey });
			}
			await opencodeApi.globalDispose();
			await refreshAll({ silent: true });
			await refreshProviderAuth();
		},
		[refreshAll, refreshProviderAuth],
	);

	useEffect(() => {
		void refreshAll({ silent: true });
		void refreshProviderAuth();
	}, [config.opencodeServer, refreshAll, refreshProviderAuth]);

	// Poll every 15s while OpenCode is unavailable so the UI auto-recovers.
	useEffect(() => {
		if (status?.available !== false) return;
		const id = setInterval(() => {
			void refreshAll({ silent: true });
		}, 15_000);
		return () => clearInterval(id);
	}, [status?.available, refreshAll]);

	const value = useMemo(
		() => ({
			status,
			statusLoading,
			providerResponse,
			providersLoading,
			providersError,
			lastLoadedAt,
			providerAuthMethods,
			refreshStatus,
			refreshProviders,
			refreshAll,
			connectWithApiKey,
			startOAuth,
			finishOAuth,
			disconnectProvider,
			addCustomProvider,
		}),
		[
			lastLoadedAt,
			providerResponse,
			providersError,
			providersLoading,
			refreshAll,
			refreshProviders,
			refreshStatus,
			status,
			statusLoading,
			providerAuthMethods,
			connectWithApiKey,
			startOAuth,
			finishOAuth,
			disconnectProvider,
			addCustomProvider,
		],
	);

	return <OpenCodeContext.Provider value={value}>{children}</OpenCodeContext.Provider>;
}

export function useOpenCode() {
	const context = useContext(OpenCodeContext);
	if (!context) {
		throw new Error("useOpenCode must be used within an OpenCodeProvider");
	}
	return context;
}
