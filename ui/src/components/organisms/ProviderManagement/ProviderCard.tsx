import { Check, Eye, EyeOff, Loader2, X } from "lucide-react";
import { useState } from "react";

import type { ProviderAuthMethod } from "../../../api/client";
import { cn } from "../../../lib/utils";
import { Badge } from "../../ui/badge";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { OpenCodeProviderIcon } from "../OpenCodeProviderIcon";

interface ProviderCardProps {
	provider: {
		id: string;
		name: string;
		env?: string[];
	};
	connected: boolean;
	authMethods: ProviderAuthMethod[];
	onConnectApiKey: (key: string) => Promise<void>;
	onStartOAuth: (methodIndex: number) => void;
}

export function ProviderCard({ provider, connected, authMethods, onConnectApiKey, onStartOAuth }: ProviderCardProps) {
	const apiMethod = authMethods.find((m) => m.type === "api");
	const oauthMethods = authMethods.flatMap((method, index) =>
		method.type === "oauth" ? [{ label: method.label, methodIndex: index }] : [],
	);

	return (
		<div
			className={cn(
				"group flex flex-col gap-3 rounded-xl border px-4 py-3 transition-colors",
				connected
					? "border-border/60 bg-background hover:border-border"
					: "border-dashed border-border/40 bg-muted/20 hover:border-border/60",
			)}
		>
			{/* Header row */}
			<div className="flex items-center gap-3">
				<OpenCodeProviderIcon providerName={provider.name} providerID={provider.id} size="sm" />
				<span className="flex-1 text-sm font-medium">{provider.name}</span>
				{connected ? (
					<Badge variant="outline" className="gap-1.5 border-emerald-200 bg-emerald-50 text-emerald-700 text-xs">
						<span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
						Connected
					</Badge>
				) : (
					<Badge variant="outline" className="gap-1.5 text-xs text-muted-foreground">
						<span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40" />
						Not connected
					</Badge>
				)}
			</div>

			{/* Auth action area */}
			<div className="pl-10">
				{apiMethod && <ApiKeyRow providerId={provider.id} connected={connected} onConnect={onConnectApiKey} />}
				{!apiMethod &&
					oauthMethods.map((method) => (
						<OAuthRow
							key={method.methodIndex}
							label={method.label}
							connected={connected}
							onConnect={() => onStartOAuth(method.methodIndex)}
						/>
					))}
			</div>
		</div>
	);
}

function ApiKeyRow({
	providerId,
	connected,
	onConnect,
}: {
	providerId: string;
	connected: boolean;
	onConnect: (key: string) => Promise<void>;
}) {
	const [editing, setEditing] = useState(!connected);
	const [key, setKey] = useState("");
	const [showKey, setShowKey] = useState(false);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const handleSave = async () => {
		if (!key.trim()) return;
		setSaving(true);
		setError(null);
		try {
			await onConnect(key.trim());
			setKey("");
			setEditing(false);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to connect");
		} finally {
			setSaving(false);
		}
	};

	if (connected && !editing) {
		return (
			<div className="flex items-center gap-2">
				<span className="text-xs text-muted-foreground">API Key</span>
				<span className="font-mono text-xs text-muted-foreground">••••••••••••••••</span>
				<Button
					variant="ghost"
					size="sm"
					className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground"
					onClick={() => setEditing(true)}
				>
					Update
				</Button>
			</div>
		);
	}

	return (
		<div className="space-y-1.5">
			<div className="flex items-center gap-2">
				<span className="shrink-0 text-xs text-muted-foreground">API Key</span>
				<div className="relative flex-1">
					<Input
						type={showKey ? "text" : "password"}
						value={key}
						onChange={(e) => setKey(e.target.value)}
						onKeyDown={(e) => e.key === "Enter" && void handleSave()}
						placeholder={`Paste ${providerId} API key…`}
						className="h-7 pr-8 font-mono text-xs"
						autoFocus={!connected}
					/>
					<button
						type="button"
						className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
						onClick={() => setShowKey((v) => !v)}
						tabIndex={-1}
					>
						{showKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
					</button>
				</div>
				<Button
					size="sm"
					className="h-7 px-3 text-xs"
					disabled={!key.trim() || saving}
					onClick={() => void handleSave()}
				>
					{saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
				</Button>
				{connected && (
					<Button
						variant="ghost"
						size="sm"
						className="h-7 px-2 text-xs text-muted-foreground"
						onClick={() => {
							setKey("");
							setEditing(false);
						}}
					>
						<X className="h-3.5 w-3.5" />
					</Button>
				)}
			</div>
			{error && <p className="text-xs text-destructive">{error}</p>}
		</div>
	);
}

function OAuthRow({ label, connected, onConnect }: { label: string; connected: boolean; onConnect: () => void }) {
	return (
		<div className="flex items-center gap-2">
			<span className="text-xs text-muted-foreground">OAuth</span>
			{connected ? (
				<span className="text-xs text-emerald-600">Authenticated via {label}</span>
			) : (
				<Button variant="outline" size="sm" className="h-7 px-3 text-xs" onClick={onConnect}>
					Connect via {label}
				</Button>
			)}
		</div>
	);
}
