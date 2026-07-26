interface ArcIndicatorProps {
	/** Usage percentage 0-100 */
	percent: number | null;
	/** Size in px */
	size?: number;
	/** Stroke width */
	strokeWidth?: number;
	className?: string;
}

function getArcColor(percent: number): string {
	if (percent >= 80) return "#ef4444"; // red
	if (percent >= 50) return "#eab308"; // yellow
	return "#22c55e"; // green
}

export function ArcIndicator({
	percent,
	size = 22,
	strokeWidth = 3,
	className,
}: ArcIndicatorProps) {
	if (percent == null || percent <= 0) return null;

	const radius = (size - strokeWidth) / 2;
	const circumference = 2 * Math.PI * radius;
	const filled = Math.min(percent, 100);
	const dash = (filled / 100) * circumference;
	const gap = circumference - dash;
	const color = getArcColor(filled);

	return (
		<svg
			width={size}
			height={size}
			className={className}
			style={{ transform: "rotate(-90deg)" }}
			aria-label={`Context usage: ${Math.round(filled)}%`}
			role="img"
		>
			{/* Background track */}
			<circle
				cx={size / 2}
				cy={size / 2}
				r={radius}
				fill="none"
				stroke="currentColor"
				strokeWidth={strokeWidth}
				className="text-muted-foreground/20"
			/>
			{/* Filled arc */}
			<circle
				cx={size / 2}
				cy={size / 2}
				r={radius}
				fill="none"
				stroke={color}
				strokeWidth={strokeWidth}
				strokeDasharray={`${dash} ${gap}`}
				strokeLinecap="round"
				className="transition-all duration-500 ease-out"
			/>
		</svg>
	);
}
