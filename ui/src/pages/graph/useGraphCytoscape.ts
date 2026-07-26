import { useCallback, useEffect, useRef } from "react";
import cytoscape from "cytoscape";
import fcose from "cytoscape-fcose";

import { buildStylesheet } from "./stylesheet";

cytoscape.use(fcose);

interface UseGraphCytoscapeOptions {
	containerRef: React.RefObject<HTMLDivElement | null>;
	elements: cytoscape.ElementDefinition[];
	isDark: boolean;
	loading: boolean;
	hoverLocked: boolean;
	onNodeHover: (node: cytoscape.NodeSingular) => void;
	onNodeHoverLeave: (nodeId: string) => void;
	onNodeSelect: (nodeId: string) => void;
	onCanvasTap: () => void;
	onPhaseChange?: (phase: "idle" | "initializing" | "layouting" | "ready") => void;
}

export function useGraphCytoscape({
	containerRef,
	elements,
	isDark,
	loading,
	hoverLocked,
	onNodeHover,
	onNodeHoverLeave,
	onNodeSelect,
	onCanvasTap,
	onPhaseChange,
}: UseGraphCytoscapeOptions) {
	const cyRef = useRef<cytoscape.Core | null>(null);
	const hoverLockedRef = useRef(hoverLocked);
	const onNodeHoverRef = useRef(onNodeHover);
	const onNodeHoverLeaveRef = useRef(onNodeHoverLeave);
	const onNodeSelectRef = useRef(onNodeSelect);
	const onCanvasTapRef = useRef(onCanvasTap);
	const onPhaseChangeRef = useRef(onPhaseChange);

	useEffect(() => {
		hoverLockedRef.current = hoverLocked;
	}, [hoverLocked]);

	useEffect(() => {
		onNodeHoverRef.current = onNodeHover;
		onNodeHoverLeaveRef.current = onNodeHoverLeave;
		onNodeSelectRef.current = onNodeSelect;
		onCanvasTapRef.current = onCanvasTap;
		onPhaseChangeRef.current = onPhaseChange;
	}, [onCanvasTap, onNodeHover, onNodeHoverLeave, onNodeSelect, onPhaseChange]);

	const arrangeIsolatedNodes = useCallback((cy: cytoscape.Core) => {
		const isolated = cy.nodes().filter((node) => node.connectedEdges().length === 0);
		if (isolated.length === 0) return;

		const connected = cy.nodes().filter((node) => node.connectedEdges().length > 0);

		// Scatter isolated nodes across the same area as the connected cluster (with margin),
		// so they feel like part of the same graph rather than a separate section.
		const margin = 200;
		let areaX1: number, areaY1: number, areaX2: number, areaY2: number;

		if (connected.length > 0) {
			const bb = connected.boundingBox();
			areaX1 = bb.x1 - margin;
			areaY1 = bb.y1 - margin;
			areaX2 = bb.x2 + margin;
			areaY2 = bb.y2 + margin;
		} else {
			const side = Math.max(400, Math.sqrt(isolated.length) * 80);
			areaX1 = -side;
			areaY1 = -side;
			areaX2 = side;
			areaY2 = side;
		}

		const areaW = areaX2 - areaX1;
		const areaH = areaY2 - areaY1;
		const minDist = 55;
		// Seed placed list with connected node positions so isolated nodes don't overlap them
		const placed: Array<{ x: number; y: number }> = connected.map((n) => n.position());

		isolated.forEach((node) => {
			let x = 0;
			let y = 0;
			let attempts = 0;
			do {
				x = areaX1 + Math.random() * areaW;
				y = areaY1 + Math.random() * areaH;
				attempts++;
			} while (
				attempts < 40 &&
				placed.some((p) => Math.hypot(p.x - x, p.y - y) < minDist)
			);
			placed.push({ x, y });
			node.position({ x, y });
			(node as any).lock();
		});
	}, []);

	const updateLabelVisibility = useCallback((cy: cytoscape.Core) => {
		const zoom = cy.zoom();
		const threshold = 1.1;
		cy.batch(() => {
			if (zoom >= threshold) {
				cy.nodes().addClass("show-label");
			} else {
				cy.nodes().removeClass("show-label");
			}
		});
	}, []);

	useEffect(() => {
		const container = containerRef.current;
		if (!container || loading || elements.length === 0) return;

		const nodeCount = elements.filter((el) => !el.data || !Object.prototype.hasOwnProperty.call(el.data, "source")).length;
		const edgeCount = elements.length - nodeCount;
		const performanceMode = nodeCount >= 1200 || edgeCount >= 3000;

		let attempts = 0;
		const tryInit = () => {
			if (!container.offsetWidth || !container.offsetHeight) {
				if (attempts++ < 10) {
					setTimeout(tryInit, 50);
					return;
				}
				return;
			}

			if (cyRef.current) cyRef.current.destroy();
			onPhaseChangeRef.current?.("initializing");

			const cy = cytoscape({
				container,
				elements,
				style: buildStylesheet(isDark),
				motionBlur: false,
				textureOnViewport: true,
				hideEdgesOnViewport: performanceMode,
				pixelRatio: 1,
				layout: { name: "preset", fit: false, padding: 0 } as any,
				minZoom: 0.3,
				maxZoom: 5,
				wheelSensitivity: 0.3,
			});

			let draggedNode: cytoscape.NodeSingular | null = null;
			let dragStartPos: Record<string, { x: number; y: number }> = {};

			cy.on("grab", "node", (evt) => {
				if (performanceMode) return;
				draggedNode = evt.target;
				const neighbors = draggedNode.neighborhood().nodes();
				dragStartPos = {};
				neighbors.forEach((n) => {
					const pos = n.position();
					dragStartPos[n.id()] = { x: pos.x, y: pos.y };
				});
			});

			cy.on("drag", "node", () => {
				if (performanceMode) return;
				if (!draggedNode) return;
				const pos = draggedNode.position();
				const neighbors = draggedNode.neighborhood().nodes();
				neighbors.forEach((n) => {
					const startPos = dragStartPos[n.id()];
					if (!startPos || n.grabbed()) return;
					const dx = pos.x - draggedNode!.position().x;
					const dy = pos.y - draggedNode!.position().y;
					const curPos = n.position();
					n.position({ x: curPos.x + dx * 0.08, y: curPos.y + dy * 0.08 });
				});
			});

			cy.on("free", "node", () => {
				draggedNode = null;
				dragStartPos = {};
			});

			cy.on("mouseover", "node", (evt) => {
				if (!hoverLockedRef.current) onNodeHoverRef.current(evt.target);
			});

			cy.on("mousemove", "node", (evt) => {
				if (!hoverLockedRef.current) onNodeHoverRef.current(evt.target);
			});

			cy.on("mouseout", "node", (evt) => {
				if (!hoverLockedRef.current) onNodeHoverLeaveRef.current(evt.target.id());
			});

			cy.on("tap", "node", (evt) => {
				onNodeSelectRef.current(evt.target.id());
			});

			cy.on("tap", (evt) => {
				if (evt.target === cy) onCanvasTapRef.current();
			});

			cy.on("zoom", () => {
				updateLabelVisibility(cy);
			});

			cy.ready(() => {
				updateLabelVisibility(cy);
				cy.fit(cy.elements(), 40);
				requestAnimationFrame(() => {
					onPhaseChangeRef.current?.("layouting");
					const layout = cy.layout({
						...(performanceMode
							? {
								name: "cose",
								animate: false,
								padding: 20,
								fit: true,
								randomize: true,
								componentSpacing: 120,
								nodeRepulsion: 9000,
								nodeOverlap: 24,
								idealEdgeLength: 100,
								edgeElasticity: 120,
								gravity: 0.12,
								numIter: 1200,
								coolingFactor: 0.97,
								minTemp: 1.0,
							}
							: {
								name: "fcose",
								quality: "default",
								animate: false,
								fit: true,
								tile: true,
								packComponents: true,
								nodeDimensionsIncludeLabels: false,
								padding: 40,
								idealEdgeLength: 80,
								nodeRepulsion: 6000,
								gravity: 0.3,
							}),
					} as any);
					layout.run();
					cy.once("layoutstop", () => {
						if (!performanceMode) {
							arrangeIsolatedNodes(cy);
						}
						updateLabelVisibility(cy);
						cy.fit(cy.elements(), 40);
						onPhaseChangeRef.current?.("ready");
					});
				});
			});

			cyRef.current = cy;
		};

		tryInit();

		return () => {
			if (cyRef.current) {
				cyRef.current.destroy();
				cyRef.current = null;
			}
			onPhaseChangeRef.current?.("idle");
		};
	}, [arrangeIsolatedNodes, containerRef, elements, isDark, loading, updateLabelVisibility]);

	useEffect(() => {
		if (cyRef.current) cyRef.current.style(buildStylesheet(isDark) as any);
	}, [isDark]);

	const relayout = useCallback(() => {
		const cy = cyRef.current;
		if (!cy) return;
		const nodeCount = cy.nodes().length;
		const edgeCount = cy.edges().length;
		const performanceMode = nodeCount >= 1200 || edgeCount >= 3000;
		cy.nodes().unlock();
		const layout = cy.layout({
			...(performanceMode
				? {
					name: "cose",
					animate: false,
					padding: 20,
					fit: true,
					randomize: true,
					componentSpacing: 120,
					nodeRepulsion: 9000,
					nodeOverlap: 24,
					idealEdgeLength: 100,
					edgeElasticity: 120,
					gravity: 0.12,
					numIter: 1200,
					coolingFactor: 0.97,
					minTemp: 1.0,
				}
				: {
					name: "euler",
					animate: false,
					padding: 40,
				}),
		} as any);
		layout.run();
		cy.once("layoutstop", () => {
			if (!performanceMode) {
				arrangeIsolatedNodes(cy);
			}
			cy.fit(cy.elements(), 40);
		});
	}, [arrangeIsolatedNodes]);

	const zoomToFit = useCallback(() => {
		cyRef.current?.fit(cyRef.current.elements(), 40);
	}, []);

	return { cyRef, relayout, zoomToFit };
}
