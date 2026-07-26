import { useMemo, useState } from "react";

import type { ProviderAuthAuthorization } from "../../../api/client";
import { useOpenCode } from "../../../contexts/OpenCodeContext";
import { Badge } from "../../ui/badge";
import { ProviderCard } from "./ProviderCard";
import { ProviderOAuthDialog } from "./ProviderOAuthDialog";

export function ProviderManagementSection() {
	const { providerResponse, providerAuthMethods, connectWithApiKey, startOAuth, finishOAuth } = useOpenCode();

	const [oauthDialog, setOAuthDialog] = useState<{
		providerId: string;
		providerName: string;
		methodIndex: number;
		authorization: ProviderAuthAuthorization | null;
	} | null>(null);

	const connectedIds = useMemo(() => new Set(providerResponse?.connected ?? []), [providerResponse]);

	const sortedProviders = useMemo(() => {
		const all = providerResponse?.all ?? [];
		return [...all].sort((a, b) => {
			const aConn = connectedIds.has(a.id) ? 0 : 1;
			const bConn = connectedIds.has(b.id) ? 0 : 1;
			return aConn - bConn || a.name.localeCompare(b.name);
		});
	}, [providerResponse, connectedIds]);

	const handleStartOAuth = async (providerId: string, providerName: string, methodIndex: number) => {
		setOAuthDialog({ providerId, providerName, methodIndex, authorization: null });
		try {
			const authorization = await startOAuth(providerId, methodIndex);
			setOAuthDialog((prev) => (prev ? { ...prev, authorization } : null));
			if (authorization.url) {
				window.open(authorization.url, "_blank", "noopener,noreferrer");
			}
		} catch {
			setOAuthDialog(null);
		}
	};

	const handleFinishOAuth = async (code?: string) => {
		if (!oauthDialog) return;
		await finishOAuth(oauthDialog.providerId, oauthDialog.methodIndex, code);
	};

	if (!providerResponse) return null;

	const connectedCount = connectedIds.size;

	return (
		<div className="space-y-3">
			<div className="flex items-center gap-2">
				<span className="text-xs text-muted-foreground">
					{sortedProviders.length} providers available
				</span>
				{connectedCount > 0 && (
					<Badge variant="outline" className="gap-1.5 border-emerald-200 bg-emerald-50 text-emerald-700 text-xs">
						<span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
						{connectedCount} connected
					</Badge>
				)}
			</div>

			<div className="space-y-2">
				{sortedProviders.map((provider) => (
					<ProviderCard
						key={provider.id}
						provider={provider}
						connected={connectedIds.has(provider.id)}
						authMethods={providerAuthMethods?.[provider.id] ?? []}
						onConnectApiKey={(key) => connectWithApiKey(provider.id, key)}
						onStartOAuth={(methodIndex) => void handleStartOAuth(provider.id, provider.name, methodIndex)}
					/>
				))}
			</div>

			{oauthDialog && (
				<ProviderOAuthDialog
					open
					providerName={oauthDialog.providerName}
					authorization={oauthDialog.authorization}
					onFinish={handleFinishOAuth}
					onClose={() => setOAuthDialog(null)}
				/>
			)}
		</div>
	);
}
