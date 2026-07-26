import { AlertCircle, Check, Shield, X } from "lucide-react";

import type { OpenCodePendingPermission } from "../../api/client";
import { Button } from "../ui/button";

interface PermissionDialogProps {
	permission: OpenCodePendingPermission;
	onRespond: (permissionId: string, response: "once" | "always" | "reject") => void;
	variant?: "modal" | "inline";
}

export function PermissionDialog({ permission, onRespond, variant = "modal" }: PermissionDialogProps) {
	const getPermissionLabel = (perm: string) => {
		switch (perm) {
			case "external_directory":
				return "Access external directory";
			case "external_file":
				return "Access external file";
			default:
				return perm;
		}
	};

	const handleRespond = (response: "once" | "always" | "reject") => {
		onRespond(permission.id, response);
	};

	const path = permission.metadata.filepath;
	const scope = permission.always?.[0];

	if (variant === "inline") {
		return (
			<div className="rounded-2xl border border-border/50 bg-[#fafaf8] dark:bg-muted/15 shadow-sm">
				<div className="flex items-start gap-3 px-4 py-3.5">
					<div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
						<Shield className="h-4 w-4" />
					</div>
					<div className="min-w-0 flex-1">
						<div className="flex flex-wrap items-center gap-2">
							<div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
								Permission required
							</div>
							<span className="rounded-full bg-background/80 px-2 py-0.5 text-[10px] text-muted-foreground border border-border/40">
								{getPermissionLabel(permission.permission)}
							</span>
						</div>
						<div className="mt-1.5 text-sm font-medium text-foreground">
							Allow access to <span className="font-mono text-[0.95em]">{path}</span>?
						</div>
						{scope && (
							<div className="mt-1 text-[12px] text-muted-foreground">
								Always applies to <span className="font-mono">{scope}</span>
							</div>
						)}
						<div className="mt-3 flex flex-wrap items-center gap-2">
							<Button
								onClick={() => handleRespond("once")}
								size="sm"
								className="h-8 rounded-full px-3 text-xs shadow-none"
							>
								<Check className="mr-1.5 h-3.5 w-3.5" />
								Allow once
							</Button>
							<Button
								onClick={() => handleRespond("always")}
								size="sm"
								variant="outline"
								className="h-8 rounded-full px-3 text-xs border-border/50 bg-background/70 shadow-none"
							>
								<Shield className="mr-1.5 h-3.5 w-3.5" />
								Always allow
							</Button>
							<Button
								onClick={() => handleRespond("reject")}
								size="sm"
								variant="ghost"
								className="h-8 rounded-full px-3 text-xs text-muted-foreground"
							>
								<X className="mr-1.5 h-3.5 w-3.5" />
								Reject
							</Button>
						</div>
					</div>
				</div>
			</div>
		);
	}

	const content = (
		<div className="mx-4 w-full max-w-md rounded-xl border border-border bg-background p-6 shadow-lg">
				<div className="flex items-start gap-4">
					<div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900">
						<Shield className="h-5 w-5 text-amber-600 dark:text-amber-400" />
					</div>
					<div className="flex-1 space-y-4">
						<div>
							<h3 className="text-base font-semibold">Permission Required</h3>
							<p className="mt-1 text-sm text-muted-foreground">
								{getPermissionLabel(permission.permission)}
							</p>
						</div>

						<div className="rounded-lg border border-border bg-muted/50 p-3">
							<p className="text-xs text-muted-foreground">Path</p>
							<p className="mt-1 break-all font-mono text-sm">{permission.metadata.filepath}</p>
						</div>

						<div className="flex flex-col gap-2">
							<Button
								onClick={() => handleRespond("once")}
								className="w-full justify-start gap-2"
								variant="default"
							>
								<Check className="h-4 w-4" />
								Allow once
							</Button>
							<Button
								onClick={() => handleRespond("always")}
								className="w-full justify-start gap-2"
								variant="outline"
							>
								<Shield className="h-4 w-4" />
								Allow always
							</Button>
							<Button
								onClick={() => handleRespond("reject")}
								className="w-full justify-start gap-2"
								variant="ghost"
							>
								<X className="h-4 w-4" />
								Deny
							</Button>
						</div>
					</div>
				</div>
			</div>
	);

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
			{content}
		</div>
	);
}
