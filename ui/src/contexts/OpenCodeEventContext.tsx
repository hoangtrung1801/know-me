/**
 * OpenCodeEventContext — receives OpenCode events multiplexed through the
 * Knowns SSE stream (via the "opencode:event" named event).
 *
 * The backend subscribes to OpenCode's /global/event SSE and re-broadcasts
 * each event through the Knowns SSEBroker. This means each browser tab only
 * needs ONE SSE connection instead of two, avoiding HTTP/1.1 connection
 * exhaustion when multiple tabs are open on the same server.
 *
 * Subscribers call `subscribe(handler)` and receive a cleanup function.
 */

import { createContext, useCallback, useContext, useRef, type ReactNode } from "react";
import { useSSEEvent } from "./SSEContext";

type EventHandler = (data: unknown) => void;
type Unsubscribe = () => void;

interface OpenCodeEventContextType {
	subscribe: (handler: EventHandler) => Unsubscribe;
}

const OpenCodeEventContext = createContext<OpenCodeEventContextType | undefined>(undefined);

export function OpenCodeEventProvider({ children }: { children: ReactNode }) {
	const handlersRef = useRef<Set<EventHandler>>(new Set());

	const dispatch = useCallback((data: unknown) => {
		handlersRef.current.forEach((h) => {
			try {
				h(data);
			} catch {
				// ignore handler errors
			}
		});
	}, []);

	// Listen for OpenCode events multiplexed through the Knowns SSE stream.
	useSSEEvent("opencode:event", useCallback((data: Record<string, unknown>) => {
		// The backend wraps the raw OpenCode event as the SSE data payload.
		// Extract the inner payload if present, otherwise pass through as-is.
		const payload = data?.payload ?? data;
		dispatch(payload);
	}, [dispatch]));

	const subscribe = useCallback((handler: EventHandler): Unsubscribe => {
		handlersRef.current.add(handler);
		return () => {
			handlersRef.current.delete(handler);
		};
	}, []);

	return (
		<OpenCodeEventContext.Provider value={{ subscribe }}>
			{children}
		</OpenCodeEventContext.Provider>
	);
}

export function useOpenCodeEvent() {
	const ctx = useContext(OpenCodeEventContext);
	if (!ctx) {
		return { subscribe: () => () => {} };
	}
	return ctx;
}
