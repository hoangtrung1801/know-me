import { AlertCircle } from "lucide-react";

interface OpenCodeUnavailableBannerProps {
	message: string;
}

export function OpenCodeUnavailableBanner({ message }: OpenCodeUnavailableBannerProps) {
	return (
		<div className="shrink-0 border-b border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
			<div className="mx-auto flex max-w-3xl items-start gap-2">
				<AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
				<div>
					<div className="font-medium">OpenCode is unavailable</div>
					<div className="text-xs text-amber-800/90">{message}</div>
				</div>
			</div>
		</div>
	);
}
