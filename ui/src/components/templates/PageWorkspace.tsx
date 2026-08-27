import { createElement, useEffect, useRef, type ComponentType } from "react";
import { usePageWorkspace, type PageId } from "../../contexts/PageWorkspaceContext";
import { cn } from "../../lib/utils";

export interface PageWorkspaceSlot {
	id: PageId;
	component: ComponentType<any>;
	props?: Record<string, unknown>;
}

function PageSlot({ slot, active }: { slot: PageWorkspaceSlot; active: boolean }) {
	const elementRef = useRef<HTMLDivElement>(null);
	const hasBeenActiveRef = useRef(false);
	const shouldAnimate = active && !hasBeenActiveRef.current;

	useEffect(() => {
		if (elementRef.current) elementRef.current.inert = !active;
		if (active) hasBeenActiveRef.current = true;
	}, [active]);

	return (
		<div
			ref={elementRef}
			data-page-slot={slot.id}
			data-page-active={active ? "true" : "false"}
			hidden={!active}
			aria-hidden={!active ? "true" : undefined}
			className={cn("flex min-h-0 flex-1 flex-col", shouldAnimate && "animate-page-in")}
		>
			{createElement(slot.component, slot.props)}
		</div>
	);
}

export function PageWorkspace({ slots, className }: { slots: PageWorkspaceSlot[]; className?: string }) {
	const { activePage, visitedPages, isHydrated } = usePageWorkspace();
	return (
		<div data-page-workspace aria-busy={!isHydrated} className={cn("flex min-h-0 flex-1 flex-col", className)}>
			{isHydrated && slots.map((slot) => {
				const active = slot.id === activePage;
				if (!active && !visitedPages.has(slot.id)) return null;
				return <PageSlot key={slot.id} slot={slot} active={active} />;
			})}
		</div>
	);
}
