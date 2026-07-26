import { useEffect, useMemo, useRef, useState } from "react";
import { getRuntimePs, type RuntimeStatusResponse } from "@/ui/api/client";

export function useRuntimeMonitor() {
	const [data, setData] = useState<RuntimeStatusResponse | null>(null);
	const [isLoading, setIsLoading] = useState(true);
	const inFlight = useRef(false);

	useEffect(() => {
		let cancelled = false;

		const load = async () => {
			if (inFlight.current) return;
			inFlight.current = true;
			try {
				const next = await getRuntimePs();
				if (!cancelled) {
					setData(next);
				}
			} catch (error) {
				console.error("Failed to load runtime monitor:", error);
			} finally {
				inFlight.current = false;
				if (!cancelled) {
					setIsLoading(false);
				}
			}
		};

		void load();
		const interval = window.setInterval(load, 3000);

		return () => {
			cancelled = true;
			window.clearInterval(interval);
		};
	}, []);

	const totalActive = useMemo(
		() => data?.projects?.reduce((total, project) => total + (project.running?.length ?? 0) + (project.queued?.length ?? 0), 0) ?? 0,
		[data],
	);

	return { data, isLoading, totalActive };
}
