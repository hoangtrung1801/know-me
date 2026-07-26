import type { ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";

import { cn } from "../../lib/utils";

interface AnimatedCollapseProps {
	open: boolean;
	children: ReactNode;
	className?: string;
	innerClassName?: string;
}

export function AnimatedCollapse({
	open,
	children,
	className,
	innerClassName,
}: AnimatedCollapseProps) {
	return (
		<AnimatePresence initial={false}>
			{open ? (
				<motion.div
					initial={{ height: 0, opacity: 0 }}
					animate={{ height: "auto", opacity: 1 }}
					exit={{ height: 0, opacity: 0 }}
					transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
					className={cn("overflow-hidden", className)}
				>
					<div className={cn("min-h-0", innerClassName)}>{children}</div>
				</motion.div>
			) : null}
		</AnimatePresence>
	);
}
