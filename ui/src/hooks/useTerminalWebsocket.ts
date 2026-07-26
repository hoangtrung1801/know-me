/**
 * useTerminalWebSocket — connect to workspace/chat terminal output via WebSocket
 * Parses JSONL ProxyEvent messages from agent-proxy Go binary
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { ProxyEvent } from "@/ui/models/chat";

const API_BASE = import.meta.env.API_URL || "";

function getWsUrl(id: string, type: "workspace" | "chat"): string {
	const path = type === "chat" ? "/ws/chat" : "/ws/terminal";
	const param = type === "chat" ? "chatId" : "workspaceId";

	if (API_BASE) {
		const url = new URL(API_BASE);
		url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
		url.pathname = path;
		url.searchParams.set(param, id);
		return url.toString();
	}
	const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
	return `${proto}//${window.location.host}${path}?${param}=${encodeURIComponent(id)}`;
}

const MAX_MESSAGES = 5000;

export function useTerminalWebSocket(id: string | null, type: "workspace" | "chat" = "workspace") {
	const [messages, setMessages] = useState<ProxyEvent[]>([]);
	const [isConnected, setIsConnected] = useState(false);
	const wsRef = useRef<WebSocket | null>(null);
	const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	const send = useCallback((data: string) => {
		if (wsRef.current?.readyState === WebSocket.OPEN) {
			wsRef.current.send(JSON.stringify({ type: "input", data }));
		}
	}, []);

	useEffect(() => {
		if (!id) {
			setMessages([]);
			setIsConnected(false);
			return;
		}

		let disposed = false;

		const connect = () => {
			if (disposed) return;

			const ws = new WebSocket(getWsUrl(id, type));
			wsRef.current = ws;

			ws.onopen = () => {
				if (!disposed) setIsConnected(true);
			};

			ws.onmessage = (event) => {
				if (disposed) return;
				try {
					const msg = JSON.parse(event.data) as ProxyEvent;
					setMessages((prev) => {
						const next = [...prev, msg];
						return next.length > MAX_MESSAGES
							? next.slice(-MAX_MESSAGES)
							: next;
					});
				} catch {
					// Ignore malformed messages
				}
			};

			ws.onclose = () => {
				if (disposed) return;
				setIsConnected(false);
				reconnectTimerRef.current = setTimeout(connect, 2000);
			};

			ws.onerror = () => {
				ws.close();
			};
		};

		setMessages([]);
		connect();

		return () => {
			disposed = true;
			if (reconnectTimerRef.current) {
				clearTimeout(reconnectTimerRef.current);
				reconnectTimerRef.current = null;
			}
			if (wsRef.current) {
				wsRef.current.close();
				wsRef.current = null;
			}
		};
	}, [id, type]);

	return { messages, isConnected, send };
}
