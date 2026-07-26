import { cn } from "../../lib/utils";

interface OpenCodeProviderIconProps {
	providerName?: string;
	providerID?: string;
	className?: string;
	size?: "sm" | "md" | "lg";
}

const sizeClasses = {
	sm: "h-7 w-7 text-[10px]",
	md: "h-8 w-8 text-xs",
	lg: "h-10 w-10 text-sm",
};

const paletteClasses = [
	"border border-zinc-700 bg-zinc-900 text-zinc-100",
	"border border-slate-700 bg-slate-900 text-slate-100",
	"border border-stone-700 bg-stone-900 text-stone-100",
	"border border-neutral-700 bg-neutral-900 text-neutral-100",
	"border border-gray-700 bg-gray-900 text-gray-100",
	"border border-zinc-600 bg-zinc-800 text-zinc-100",
];

function getProviderLabel(providerName?: string, providerID?: string): string {
	return providerName?.trim() || providerID?.trim() || "AI";
}

function getProviderInitials(providerName?: string, providerID?: string): string {
	const label = getProviderLabel(providerName, providerID);
	const tokens = label
		.split(/[\s_-]+/)
		.map((token) => token.replace(/[^a-z0-9]/gi, ""))
		.filter(Boolean);

	if (tokens.length >= 2) {
		return `${tokens[0]?.[0] || ""}${tokens[1]?.[0] || ""}`.toUpperCase();
	}

	const compact = label.replace(/[^a-z0-9]/gi, "");
	return compact.slice(0, 2).toUpperCase() || "AI";
}

function getPaletteIndex(providerName?: string, providerID?: string): number {
	const label = getProviderLabel(providerName, providerID);
	let hash = 0;
	for (let index = 0; index < label.length; index += 1) {
		hash = (hash * 31 + label.charCodeAt(index)) >>> 0;
	}
	return hash % paletteClasses.length;
}

export function OpenCodeProviderIcon({
	providerName,
	providerID,
	className,
	size = "md",
}: OpenCodeProviderIconProps) {
	const label = getProviderLabel(providerName, providerID);
	const initials = getProviderInitials(providerName, providerID);
	const palette = paletteClasses[getPaletteIndex(providerName, providerID)] || paletteClasses[0];

	return (
		<div
			aria-hidden="true"
			className={cn(
				"inline-flex shrink-0 items-center justify-center rounded-full font-semibold tracking-[0.08em] shadow-sm",
				sizeClasses[size],
				palette,
				className,
			)}
			title={label}
		>
			{initials}
		</div>
	);
}
