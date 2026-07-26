import { useCallback, useEffect, useState } from "react";
import { RefreshCw, Server, ServerOff, Settings2 } from "lucide-react";

import { opencodeApi } from "../../api/client";
import { useOpenCode } from "../../contexts/OpenCodeContext";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "../ui/dialog";

interface MCPServer {
	status: string;
	error?: string;
	tools?: number;
	resources?: number;
}

export function MCPServerDialog() {
	const { status: opencodeStatus } = useOpenCode();
	const [servers, setServers] = useState<Record<string, MCPServer>>({});
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [open, setOpen] = useState(false);

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
		if (open) {
			void fetchMCP();
		}
	}, [open, fetchMCP]);

	const serverList = Object.entries(servers);

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button variant="ghost" size="sm" title="MCP Servers">
					<Settings2 className="h-4 w-4" />
				</Button>
			</DialogTrigger>
			<DialogContent className="max-w-md">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<Server className="h-5 w-5" />
						MCP Servers
					</DialogTitle>
					<DialogDescription>
						{opencodeStatus?.available
							? `${serverList.length} server${serverList.length !== 1 ? "s" : ""} configured`
							: "OpenCode is not available"}
					</DialogDescription>
				</DialogHeader>

				{!opencodeStatus?.available ? (
					<div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
						<ServerOff className="h-4 w-4" />
						OpenCode is not available
					</div>
				) : (
					<div className="space-y-3">
						{error && (
							<p className="text-sm text-red-500">{error}</p>
						)}
						{loading && serverList.length === 0 ? (
							<div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
								<RefreshCw className="h-4 w-4 animate-spin" />
								Loading...
							</div>
						) : serverList.length === 0 ? (
							<p className="text-sm text-muted-foreground py-4">No MCP servers configured</p>
						) : (
							<ul className="space-y-2 max-h-[300px] overflow-y-auto">
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
						<div className="flex justify-end pt-2">
							<Button
								variant="outline"
								size="sm"
								onClick={() => void fetchMCP()}
								disabled={loading}
							>
								<RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
								Refresh
							</Button>
						</div>
					</div>
				)}
			</DialogContent>
		</Dialog>
	);
}
