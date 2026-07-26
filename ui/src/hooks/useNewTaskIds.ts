import { useEffect, useRef, useState } from "react";
import type { Task } from "@/ui/models/task";

/**
 * Tracks newly added task IDs so components can apply entrance animations.
 * Returns a Set of task IDs that were added since the last render.
 * IDs are automatically cleared after the animation duration.
 */
export function useNewTaskIds(tasks: Task[], animationDurationMs = 600): Set<string> {
	const [newIds, setNewIds] = useState<Set<string>>(new Set());
	const prevIdsRef = useRef<Set<string>>(new Set());
	const initialLoadRef = useRef(true);

	useEffect(() => {
		const currentIds = new Set(tasks.map((t) => t.id));

		// Skip animation on initial load
		if (initialLoadRef.current) {
			initialLoadRef.current = false;
			prevIdsRef.current = currentIds;
			return;
		}

		const added = new Set<string>();
		for (const id of currentIds) {
			if (!prevIdsRef.current.has(id)) {
				added.add(id);
			}
		}

		prevIdsRef.current = currentIds;

		if (added.size === 0) return;

		setNewIds((prev) => {
			const merged = new Set(prev);
			for (const id of added) merged.add(id);
			return merged;
		});

		// Clear after animation completes
		const timer = setTimeout(() => {
			setNewIds((prev) => {
				const next = new Set(prev);
				for (const id of added) next.delete(id);
				return next;
			});
		}, animationDurationMs);

		return () => clearTimeout(timer);
	}, [tasks, animationDurationMs]);

	return newIds;
}
