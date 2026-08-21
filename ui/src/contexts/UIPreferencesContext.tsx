import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

const STORAGE_KEY = "knowns-ui-preferences";
const MIN_CODEX_RAIL_WIDTH = 320;
const MAX_CODEX_RAIL_WIDTH = 560;

export interface UIPreferences {
	taskDetailLayout: "maximized" | "minimized";
	taskCreateLayout: "maximized" | "minimized";
	taskCodexRailWidth: number;
}

const DEFAULT_PREFERENCES: UIPreferences = {
	taskDetailLayout: "maximized",
	taskCreateLayout: "maximized",
	taskCodexRailWidth: 384,
};

interface UIPreferencesContextType {
	preferences: UIPreferences;
	setPreference: <K extends keyof UIPreferences>(key: K, value: UIPreferences[K]) => void;
	toggleTaskDetailLayout: () => void;
	toggleTaskCreateLayout: () => void;
}

const UIPreferencesContext = createContext<UIPreferencesContextType | undefined>(undefined);

function loadPreferences(): UIPreferences {
	try {
		const saved = localStorage.getItem(STORAGE_KEY);
		if (saved) {
			const parsed = JSON.parse(saved) as Partial<UIPreferences>;
			const width = Number(parsed.taskCodexRailWidth);
			return {
				...DEFAULT_PREFERENCES,
				...parsed,
				taskCodexRailWidth: Number.isFinite(width)
					? Math.min(MAX_CODEX_RAIL_WIDTH, Math.max(MIN_CODEX_RAIL_WIDTH, Math.round(width)))
					: DEFAULT_PREFERENCES.taskCodexRailWidth,
			};
		}
	} catch {
		// Ignore parse errors
	}
	return DEFAULT_PREFERENCES;
}

function savePreferences(preferences: UIPreferences): void {
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
	} catch {
		// Ignore storage errors
	}
}

export function UIPreferencesProvider({ children }: { children: ReactNode }) {
	const [preferences, setPreferences] = useState<UIPreferences>(loadPreferences);

	const setPreference = useCallback(<K extends keyof UIPreferences>(key: K, value: UIPreferences[K]) => {
		setPreferences((prev) => {
			const next = key === "taskCodexRailWidth"
				? { ...prev, taskCodexRailWidth: Math.min(MAX_CODEX_RAIL_WIDTH, Math.max(MIN_CODEX_RAIL_WIDTH, Math.round(Number(value)))) }
				: { ...prev, [key]: value };
			savePreferences(next);
			return next;
		});
	}, []);

	const toggleTaskDetailLayout = useCallback(() => {
		setPreferences((prev) => {
			const next = {
				...prev,
				taskDetailLayout: prev.taskDetailLayout === "maximized" ? "minimized" : "maximized",
			} as UIPreferences;
			savePreferences(next);
			return next;
		});
	}, []);

	const toggleTaskCreateLayout = useCallback(() => {
		setPreferences((prev) => {
			const next = {
				...prev,
				taskCreateLayout: prev.taskCreateLayout === "maximized" ? "minimized" : "maximized",
			} as UIPreferences;
			savePreferences(next);
			return next;
		});
	}, []);

	return (
		<UIPreferencesContext.Provider
			value={{
				preferences,
				setPreference,
				toggleTaskDetailLayout,
				toggleTaskCreateLayout,
			}}
		>
			{children}
		</UIPreferencesContext.Provider>
	);
}

export function useUIPreferences() {
	const context = useContext(UIPreferencesContext);
	if (context === undefined) {
		throw new Error("useUIPreferences must be used within a UIPreferencesProvider");
	}
	return context;
}
