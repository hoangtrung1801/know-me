import { ExternalLink, Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import type { ProviderAuthAuthorization } from "../../../api/client";
import { Button } from "../../ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../../ui/dialog";
import { Input } from "../../ui/input";

interface ProviderOAuthDialogProps {
	open: boolean;
	providerName: string;
	authorization: ProviderAuthAuthorization | null;
	onFinish: (code?: string) => Promise<void>;
	onClose: () => void;
}

export function ProviderOAuthDialog({ open, providerName, authorization, onFinish, onClose }: ProviderOAuthDialogProps) {
	const [code, setCode] = useState("");
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const calledRef = useRef(false);

	// Auto-mode: single long-poll call — endpoint hangs until OAuth completes then returns true
	useEffect(() => {
		if (!open || !authorization || authorization.method !== "auto" || calledRef.current) return;
		calledRef.current = true;
		let active = true;
		setError(null);

		onFinish()
			.then(() => {
				if (active) onClose();
			})
			.catch((err) => {
				if (!active) return;
				setError(err instanceof Error ? err.message : "Authorization failed. Please try again.");
			});

		return () => {
			active = false;
			calledRef.current = false;
		};
	}, [open, authorization, onFinish, onClose]);

	const handleSubmitCode = async () => {
		if (!code.trim()) return;
		setLoading(true);
		setError(null);
		try {
			await onFinish(code.trim());
			onClose();
		} catch (err) {
			setError(err instanceof Error ? err.message : "Authentication failed");
		} finally {
			setLoading(false);
		}
	};

	const handleOpenUrl = () => {
		if (authorization?.url) window.open(authorization.url, "_blank", "noopener,noreferrer");
	};

	return (
		<Dialog open={open} onOpenChange={(v) => !v && onClose()}>
			<DialogContent className="max-w-md">
				<DialogHeader>
					<DialogTitle>Connect {providerName}</DialogTitle>
				</DialogHeader>

				{!authorization ? (
					<div className="flex items-center justify-center py-6">
						<Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
					</div>
				) : (
					<div className="space-y-4 text-sm">
						{authorization.instructions && (
							<p className="text-muted-foreground">{authorization.instructions}</p>
						)}

						<Button variant="outline" className="w-full gap-2" onClick={handleOpenUrl}>
							<ExternalLink className="h-4 w-4" />
							Open authorization page
						</Button>

						{authorization.method === "auto" && (
							<div className="flex items-center gap-2 rounded-lg border border-dashed px-3 py-2 text-xs text-muted-foreground">
								<Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
								Waiting for authorization to complete…
							</div>
						)}

						{authorization.method === "code" && (
							<div className="space-y-2">
								<p className="text-xs text-muted-foreground">Paste the authorization code here:</p>
								<div className="flex gap-2">
									<Input
										value={code}
										onChange={(e) => setCode(e.target.value)}
										onKeyDown={(e) => e.key === "Enter" && void handleSubmitCode()}
										placeholder="Authorization code…"
										className="h-8 font-mono text-xs"
										autoFocus
									/>
									<Button
										size="sm"
										className="h-8 px-4"
										disabled={!code.trim() || loading}
										onClick={() => void handleSubmitCode()}
									>
										{loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Submit"}
									</Button>
								</div>
							</div>
						)}

						{error && <p className="text-xs text-destructive">{error}</p>}
					</div>
				)}
			</DialogContent>
		</Dialog>
	);
}
