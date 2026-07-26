import type { ContextCategory } from "../../../hooks/useContextUsage";

interface ContextHeatmapGridProps {
	categories: ContextCategory[];
	contextLimit: number | null;
}

// 10×10 major grid (1% each), each major = 2×2 minor cells (0.25% each)
const MAJOR_COLS = 10;
const MINOR_PER_MAJOR = 4;
const TOTAL_CELLS = 400; // 100 major × 4 minor

export function ContextHeatmapGrid({ categories, contextLimit }: ContextHeatmapGridProps) {
	if (!contextLimit) return null;

	const cells: string[] = new Array(TOTAL_CELLS).fill("transparent");
	let idx = 0;
	for (const cat of categories) {
		if (cat.key === "free") continue;
		// Round up: anything from 0.1% to 0.25% still gets 1 cell
		const rawCount = cat.percent * 4; // 0.25% per cell
		const count = rawCount >= 0.4 ? Math.round(rawCount) : rawCount > 0 ? 1 : 0;
		for (let i = 0; i < count && idx < TOTAL_CELLS; i++) {
			cells[idx] = cat.color;
			idx++;
		}
	}

	const majorCells: string[][] = [];
	for (let i = 0; i < TOTAL_CELLS; i += MINOR_PER_MAJOR) {
		majorCells.push(cells.slice(i, i + MINOR_PER_MAJOR));
	}

	return (
		<div
			className="overflow-hidden rounded-md"
			style={{
				display: "grid",
				gridTemplateColumns: `repeat(${MAJOR_COLS}, 1fr)`,
				gap: "2px",
			}}
		>
			{majorCells.map((minors, mi) => (
				<div
					key={mi}
					className="overflow-hidden rounded-[1px]"
					style={{
						display: "grid",
						gridTemplateColumns: "repeat(2, 1fr)",
						gridTemplateRows: "repeat(2, 1fr)",
						gap: "1px",
					}}
				>
					{minors.map((color, si) => (
						<div
							key={si}
							style={{
								aspectRatio: "1",
								backgroundColor: color === "transparent"
									? "rgba(100, 100, 100, 0.15)"
									: color,
								opacity: color === "transparent" ? 1 : 0.85,
							}}
						/>
					))}
				</div>
			))}
		</div>
	);
}
