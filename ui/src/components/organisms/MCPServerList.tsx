import { useCallback, useEffect, useState } from "react";
import { RefreshCw, Server, ServerOff } from "lucide-react";

import { opencodeApi } from "../api/client";
import { useOpenCode } from "../contexts/OpenCodeContext";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "../components/ui/card";

interface MCPServer {
	status: string;
	error?: string;
	tools?: number;
	resources?: number;
}

export function MCPServerList() {
	const { status: opencodeStatus } = useOpenCode();
	const [servers, setServers] = useState<Record<string, MCPServer>>({});
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const fetchMCP = useCallback(async () => {
		if (!opencodeStatus?.available) return;
		setLoading(true);
		setError(null);
		try {
			const data = await opencodeApi.listMCP();
			setServers(data);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to fetch MCP servers");
		} finally {
			setLoading(false);
		}
	}, [opencodeStatus?.available]);

	useEffect(() => {
		void fetchMCP();
	}, [fetchMCP]);

	if (!opencodeStatus?.available) {
		return (
			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<ServerOff className="h-5 w-5" />
						MCP Servers
					</CardTitle>
					<CardDescription>OpenCode is not available</CardDescription>
				</CardHeader>
			</Card>
		);
	}

	const serverList = Object.entries(servers);

	return (
		<Card>
			<CardHeader className="pb-3">
				<div className="flex items-center justify-between">
					<CardTitle className="flex items-center gap-2">
						<Server className="h-5 w-5" />
						MCP Servers
					</CardTitle>
					<Button
						variant="ghost"
						size="sm"
						onClick={() => void fetchMCP()}
						disabled={loading}
					>
						<RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
					</Button>
				</div>
				<CardDescription>
					{serverList.length} server{serverList.length !== 1 ? "s" : ""} configured
				</CardDescription>
			</CardHeader>
			<CardContent>
				{error && (
					<p className="text-sm text-red-500 mb-3">{error}</p>
				)}
				{serverList.length === 0 ? (
					<p className="text-sm text-muted-foreground">No MCP servers configured</p>
				) : (
					<ul className="space-y-2">
						{serverList.map(([name, server]) => (
							<li
								key={name}
								className="flex items-center justify-between rounded-md border p-3"
							>
								<div className="flex-1 min-w-0">
									<p className="font-medium truncate">{name}</p>
									{server.error && (
										<p className="text-xs text-red-500 truncate">{server.error}</p>
									)}
								</div>
								<div className="flex items-center gap-2 ml-3">
									{server.tools !== undefined && (
										<Badge variant="outline" className="text-xs">
											{server.tools} tool{server.tools !== 1 ? "s" : ""}
										</Badge>
									)}
									{server.resources !== undefined && (
										<Badge variant="outline" className="text-xs">
											{server.resources} resource{server.resources !== 1 ? "s" : ""}
										</Badge>
									)}
									<Badge
										variant={server.status === "connected" ? "default" : "secondary"}
										className={
											server.status === "connected"
												? "bg-green-500 hover:bg-green-600"
												: server.status === "error"
												? "bg-red-500 hover:bg-red-600"
												: ""
										}
									>
										{server.status}
									</Badge>
								</div>
							</li>
						))}
					</ul>
				)}
			</CardContent>
		</Card>
	);
}
