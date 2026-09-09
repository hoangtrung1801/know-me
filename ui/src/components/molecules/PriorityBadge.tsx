import { Icon, type IconName } from "../atoms";
import { cn } from "@/ui/lib/utils";

type Priority = "low" | "medium" | "high";

interface PriorityBadgeProps {
	priority: Priority;
	className?: string;
}

const priorityConfig: Record<Priority, { icon: IconName; colorClass: string }> = {
	low: {
		icon: "arrow-down",
		colorClass: "bg-info-soft text-info border-transparent",
	},
	medium: {
		icon: "minus",
		colorClass: "bg-warning-soft text-warning border-transparent",
	},
	high: {
		icon: "arrow-up",
		colorClass: "bg-danger-soft text-destructive border-transparent",
	},
};

export function PriorityBadge({ priority, className }: PriorityBadgeProps) {
	const config = priorityConfig[priority] || priorityConfig.medium;

	return (
		<div
			className={cn(
				"inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium transition-colors",
				config.colorClass,
				className
			)}
		>
			<Icon name={config.icon} size="sm" />
			<span className="capitalize">{priority}</span>
		</div>
	);
}
