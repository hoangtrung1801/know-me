/**
 * AI Logo Icon component
 */

import { memo } from "react";

interface AIIconProps {
	className?: string;
	size?: "sm" | "md" | "lg" | "xl";
}

const sizeClasses = {
	sm: "w-6 h-6",
	md: "w-7 h-7",
	lg: "w-10 h-10",
	xl: "w-16 h-16",
};

export const AIIcon = memo(function AIIcon({ className = "", size = "md" }: AIIconProps) {
	return (
		<img
			src="/ai-logo.png"
			alt="AI"
			className={`${sizeClasses[size]} rounded-full object-cover ${className}`}
		/>
	);
});

// Avatar variant with fallback
interface AIAvatarProps {
	className?: string;
	size?: "sm" | "md" | "lg";
}

export const AIAvatar = memo(function AIAvatar({ className = "", size = "md" }: AIAvatarProps) {
	const sizeClasses = {
		sm: "w-6 h-6",
		md: "w-8 h-8",
		lg: "w-10 h-10",
	};

	return (
		<div className={`${sizeClasses[size]} rounded-full bg-muted flex items-center justify-center overflow-hidden ${className}`}>
			<img
				src="/ai-logo.png"
				alt="AI"
				className="w-full h-full object-cover"
				onError={(e) => {
					// Fallback to icon if image fails
					const target = e.target as HTMLImageElement;
					target.style.display = "none";
				}}
			/>
		</div>
	);
});
