import { useCallback, useEffect, useMemo, useState } from "react";

interface TOCItem {
	id: string;
	text: string;
	number: string;
	level: number;
}

interface DocsTOCProps {
	markdown: string;
	/** The scrollable container to observe (viewport element) */
	scrollContainerRef?: React.RefObject<HTMLElement | null>;
	onHeadingSelect?: (id: string) => void;
}

/**
 * Parse headings from markdown content.
 * Extracts ## and ### headings (skip h1 since that's the doc title).
 */
function parseHeadings(markdown: string): TOCItem[] {
	const items: TOCItem[] = [];
	const lines = markdown.split("\n");
	let inCodeBlock = false;
	const counts = [0, 0, 0];

	const getHeadingNumber = (level: number) => {
		const depth = Math.max(0, level - 2);

		for (let i = 0; i < depth; i += 1) {
			if (counts[i] === 0) counts[i] = 1;
		}

		counts[depth] = (counts[depth] || 0) + 1;

		for (let i = depth + 1; i < counts.length; i += 1) {
			counts[i] = 0;
		}

		return counts.slice(0, depth + 1).join("-");
	};

	const slugifyHeading = (text: string) => {
		return text
			.toLowerCase()
			.replace(/[^\w\s-]/g, "")
			.replace(/\s+/g, "-")
			.replace(/-+/g, "-")
			.replace(/^-|-$/g, "");
	};

	for (const line of lines) {
		if (line.trimStart().startsWith("```")) {
			inCodeBlock = !inCodeBlock;
			continue;
		}
		if (inCodeBlock) continue;

		const match = line.match(/^(#{2,4})\s+(.+)/);
		if (match?.[1] && match[2]) {
			const level = match[1].length; // 2 = h2, 3 = h3, 4 = h4
			const number = getHeadingNumber(level).replace(/-/g, ".");
			const rawText = match[2]
				.replace(/\*\*(.+?)\*\*/g, "$1") // bold
				.replace(/\*(.+?)\*/g, "$1") // italic
				.replace(/`(.+?)`/g, "$1") // code
				.replace(/\[(.+?)\]\(.+?\)/g, "$1") // links
				.trim();

			const slug = slugifyHeading(rawText);
			items.push({ id: slug || number, number, text: rawText, level });
		}
	}

	return items;
}

export function DocsTOC({ markdown, scrollContainerRef, onHeadingSelect }: DocsTOCProps) {
	const [activeId, setActiveId] = useState<string>("");
	const headings = useMemo(() => parseHeadings(markdown), [markdown]);

	// Scroll spy: observe heading elements in the scroll container
	const updateActiveHeading = useCallback(() => {
		const container = scrollContainerRef?.current;
		if (!container || headings.length === 0) return;

		const headingElements: { id: string; top: number }[] = [];

		for (const heading of headings) {
			const el = container.querySelector(`#${CSS.escape(heading.id)}`);
			if (el) {
				const rect = el.getBoundingClientRect();
				const containerRect = container.getBoundingClientRect();
				headingElements.push({
					id: heading.id,
					top: rect.top - containerRect.top,
				});
			}
		}

		if (headingElements.length === 0) return;

		// Find the heading closest to the top of the container (with some offset)
		const offset = 80;
		let active = headingElements[0]?.id ?? "";
		for (const item of headingElements) {
			if (item.top <= offset) {
				active = item.id;
			} else {
				break;
			}
		}
		setActiveId(active);
	}, [headings, scrollContainerRef]);

	// Listen to scroll events on the container
	useEffect(() => {
		const container = scrollContainerRef?.current;
		if (!container) return;

		// Use the container directly (native scrollable div or Radix viewport)
		const viewport =
			container.querySelector("[data-radix-scroll-area-viewport]") ||
			container;

		updateActiveHeading();
		viewport.addEventListener("scroll", updateActiveHeading, {
			passive: true,
		});
		return () => viewport.removeEventListener("scroll", updateActiveHeading);
	}, [scrollContainerRef, updateActiveHeading]);

	// Also update when markdown changes
	useEffect(() => {
		// Small delay to ensure headings are rendered
		const timer = setTimeout(updateActiveHeading, 100);
		return () => clearTimeout(timer);
	}, [markdown, updateActiveHeading]);

	if (headings.length === 0) return null;

	const handleClick = (id: string) => {
		if (onHeadingSelect) {
			onHeadingSelect(id);
			setActiveId(id);
			return;
		}

		const container = scrollContainerRef?.current;
		if (!container) return;

		const el = container.querySelector(`#${CSS.escape(id)}`);
		if (el) {
			const viewport =
				container.querySelector("[data-radix-scroll-area-viewport]") ||
				container;
			const containerRect = viewport.getBoundingClientRect();
			const elRect = el.getBoundingClientRect();
			viewport.scrollTo({
				top: viewport.scrollTop + (elRect.top - containerRect.top) - 20,
				behavior: "smooth",
			});
		}
		setActiveId(id);
	};

	// Determine min level for indent calculation
	const minLevel = Math.min(...headings.map((h) => h.level));

	return (
		<nav className="flex flex-col min-h-0">
			<div className="mb-3 text-[10px] font-medium text-muted-foreground/60 uppercase tracking-[0.18em] shrink-0">
				On this page
			</div>
			<ul className="space-y-1 text-[12px] leading-relaxed overflow-y-auto flex-1 min-h-0">
				{headings.map((heading) => {
					const indent = heading.level - minLevel;
					const isActive = activeId === heading.id;
					return (
						<li key={heading.id}>
							<a
								href={`#${heading.id}`}
								onClick={(e) => {
									e.preventDefault();
									handleClick(heading.id);
								}}
								className={`block w-full text-left truncate py-1 transition-colors border-l ${
									isActive
										? "border-foreground/30 text-foreground font-medium"
										: "border-transparent text-muted-foreground/65 hover:text-foreground"
								}`}
								style={{ paddingLeft: `${indent * 10 + 8}px` }}
								title={heading.text}
							>
								<span className="mr-2 text-muted-foreground/55">{heading.number}</span>
								{heading.text}
							</a>
						</li>
					);
				})}
			</ul>
		</nav>
	);
}
