import { useEffect, useRef, useState, useCallback, type MouseEvent } from "react";
import {
  Bot,
  CheckCircle2,
  FileText,
  GitCommit,
  Sparkles,
  Zap,
  RotateCcw,
  Layers,
  Search,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export type NodeType = "agent" | "task" | "doc" | "commit" | "memo";

export interface GraphNode {
  id: string;
  label: string;
  type: NodeType;
  cluster: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  color: string;
  glowColor: string;
  metadata: {
    status?: string;
    path?: string;
    tokens?: string;
    desc?: string;
  };
}

export interface GraphEdge {
  source: string;
  target: string;
  label?: string;
  strength: number;
}

interface PulsePacket {
  sourceId: string;
  targetId: string;
  progress: number;
  speed: number;
  color: string;
}

const INITIAL_NODES: GraphNode[] = [
  // Agents cluster (Center/Top)
  {
    id: "agent-claude",
    label: "Claude Code",
    type: "agent",
    cluster: "agents",
    x: 480,
    y: 160,
    vx: 0,
    vy: 0,
    radius: 20,
    color: "#6366f1",
    glowColor: "rgba(99, 102, 241, 0.4)",
    metadata: { status: "Active stdio", desc: "Anthropic Claude 3.7 Sonnet agent" },
  },
  {
    id: "agent-cursor",
    label: "Cursor IDE",
    type: "agent",
    cluster: "agents",
    x: 360,
    y: 130,
    vx: 0,
    vy: 0,
    radius: 17,
    color: "#06b6d4",
    glowColor: "rgba(6, 182, 212, 0.4)",
    metadata: { status: "Direct bridge", desc: "Editor-integrated coding agent" },
  },
  {
    id: "agent-codex",
    label: "Codex CLI",
    type: "agent",
    cluster: "agents",
    x: 600,
    y: 130,
    vx: 0,
    vy: 0,
    radius: 17,
    color: "#10b981",
    glowColor: "rgba(16, 185, 129, 0.4)",
    metadata: { status: "Subprocess", desc: "Local CLI execution harness" },
  },

  // Tasks cluster (Left)
  {
    id: "task-104",
    label: "TASK-104",
    type: "task",
    cluster: "tasks",
    x: 260,
    y: 280,
    vx: 0,
    vy: 0,
    radius: 16,
    color: "#14b8a6",
    glowColor: "rgba(20, 184, 166, 0.4)",
    metadata: {
      status: "in-progress",
      path: ".know-me/tasks/TASK-104.md",
      desc: "Implement MCP Stdio Bridge for Subagent Sessions",
      tokens: "1,420 tokens",
    },
  },
  {
    id: "task-103",
    label: "TASK-103",
    type: "task",
    cluster: "tasks",
    x: 180,
    y: 230,
    vx: 0,
    vy: 0,
    radius: 14,
    color: "#10b981",
    glowColor: "rgba(16, 185, 129, 0.4)",
    metadata: {
      status: "done",
      path: ".know-me/tasks/TASK-103.md",
      desc: "Add sliding session expiration to client SDK",
    },
  },
  {
    id: "task-108",
    label: "TASK-108",
    type: "task",
    cluster: "tasks",
    x: 220,
    y: 370,
    vx: 0,
    vy: 0,
    radius: 14,
    color: "#f59e0b",
    glowColor: "rgba(245, 158, 11, 0.4)",
    metadata: {
      status: "todo",
      path: ".know-me/tasks/TASK-108.md",
      desc: "SQLite index optimization for search vectors",
    },
  },

  // Docs cluster (Right)
  {
    id: "doc-mcp",
    label: "specs/mcp.md",
    type: "doc",
    cluster: "docs",
    x: 700,
    y: 260,
    vx: 0,
    vy: 0,
    radius: 16,
    color: "#8b5cf6",
    glowColor: "rgba(139, 92, 246, 0.4)",
    metadata: {
      path: ".know-me/docs/architecture/mcp-bridge.md",
      desc: "Model Context Protocol Stdio Transport Architecture",
      tokens: "620 tokens",
    },
  },
  {
    id: "doc-subagents",
    label: "specs/agents.md",
    type: "doc",
    cluster: "docs",
    x: 780,
    y: 210,
    vx: 0,
    vy: 0,
    radius: 14,
    color: "#a855f7",
    glowColor: "rgba(168, 85, 247, 0.4)",
    metadata: {
      path: ".know-me/docs/specs/subagents.md",
      desc: "Isolated worktree lifecycle and review gates",
    },
  },
  {
    id: "doc-jwt",
    label: "security/jwt.md",
    type: "doc",
    cluster: "docs",
    x: 740,
    y: 360,
    vx: 0,
    vy: 0,
    radius: 14,
    color: "#ec4899",
    glowColor: "rgba(236, 72, 153, 0.4)",
    metadata: {
      path: ".know-me/docs/security/jwt-rotation.md",
      desc: "Refresh token rotation and HMAC verification",
    },
  },

  // Git commits cluster (Bottom Center)
  {
    id: "commit-c9a",
    label: "commit c9a41b",
    type: "commit",
    cluster: "commits",
    x: 420,
    y: 390,
    vx: 0,
    vy: 0,
    radius: 13,
    color: "#3b82f6",
    glowColor: "rgba(59, 130, 246, 0.4)",
    metadata: {
      status: "merged",
      desc: "feat(mcp): support stdio JSON-RPC pipe transport",
    },
  },
  {
    id: "commit-8f1",
    label: "commit 8f102e",
    type: "commit",
    cluster: "commits",
    x: 540,
    y: 390,
    vx: 0,
    vy: 0,
    radius: 13,
    color: "#3b82f6",
    glowColor: "rgba(59, 130, 246, 0.4)",
    metadata: {
      status: "staged",
      desc: "refactor(search): hybrid BM25 and ONNX scoring",
    },
  },

  // Memos cluster (Bottom Floating)
  {
    id: "memo-ideas",
    label: "#ideas/vector",
    type: "memo",
    cluster: "memos",
    x: 350,
    y: 460,
    vx: 0,
    vy: 0,
    radius: 12,
    color: "#f43f5e",
    glowColor: "rgba(244, 63, 94, 0.4)",
    metadata: {
      path: ".know-me/memos/daily.md",
      desc: "Weight BM25 keyword matches 60% and ONNX embeddings 40%",
    },
  },
  {
    id: "memo-bugs",
    label: "#bugs/wsl",
    type: "memo",
    cluster: "memos",
    x: 610,
    y: 460,
    vx: 0,
    vy: 0,
    radius: 12,
    color: "#f43f5e",
    glowColor: "rgba(244, 63, 94, 0.4)",
    metadata: {
      path: ".know-me/memos/daily.md",
      desc: "Enforce POSIX path separators for worktrees on WSL",
    },
  },
];

const INITIAL_EDGES: GraphEdge[] = [
  // Agent to task & docs connections
  { source: "agent-claude", target: "task-104", strength: 0.9 },
  { source: "agent-claude", target: "doc-mcp", strength: 0.9 },
  { source: "agent-cursor", target: "task-104", strength: 0.7 },
  { source: "agent-cursor", target: "task-103", strength: 0.8 },
  { source: "agent-codex", target: "doc-subagents", strength: 0.8 },
  { source: "agent-codex", target: "task-108", strength: 0.7 },

  // Task cross-references
  { source: "task-104", target: "doc-mcp", strength: 0.95 },
  { source: "task-104", target: "commit-c9a", strength: 0.85 },
  { source: "task-103", target: "doc-jwt", strength: 0.8 },
  { source: "task-108", target: "commit-8f1", strength: 0.75 },

  // Doc references
  { source: "doc-mcp", target: "doc-subagents", strength: 0.7 },
  { source: "doc-mcp", target: "commit-c9a", strength: 0.8 },
  { source: "doc-jwt", target: "memo-ideas", strength: 0.6 },

  // Commit connections
  { source: "commit-c9a", target: "commit-8f1", strength: 0.75 },
  { source: "commit-c9a", target: "memo-bugs", strength: 0.65 },
  { source: "commit-8f1", target: "memo-ideas", strength: 0.7 },
];

export function NeuralMemoryGraph() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const [nodes, setNodes] = useState<GraphNode[]>(() =>
    INITIAL_NODES.map((n) => ({ ...n }))
  );
  const edgesRef = useRef<GraphEdge[]>(INITIAL_EDGES);
  const pulsesRef = useRef<PulsePacket[]>([]);

  const [activeFilter, setActiveFilter] = useState<string>("all");
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(nodes[3]); // Default to TASK-104
  const [hoveredNode, setHoveredNode] = useState<GraphNode | null>(null);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);

  // Dragging state
  const dragNodeRef = useRef<GraphNode | null>(null);
  const isDraggingRef = useRef<boolean>(false);
  const mousePosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const isVisibleRef = useRef<boolean>(true);

  // Trigger pulse stream along edges
  const triggerPulseWave = useCallback(() => {
    setIsSyncing(true);
    const newPulses: PulsePacket[] = [];
    edgesRef.current.forEach((edge) => {
      newPulses.push({
        sourceId: edge.source,
        targetId: edge.target,
        progress: 0,
        speed: 0.015 + Math.random() * 0.015,
        color: "#2dd4bf",
      });
    });
    pulsesRef.current.push(...newPulses);
    setTimeout(() => setIsSyncing(false), 1200);
  }, []);

  // Periodic subtle background pulses
  useEffect(() => {
    const interval = setInterval(() => {
      if (!isVisibleRef.current) return;
      const edge = edgesRef.current[Math.floor(Math.random() * edgesRef.current.length)];
      if (edge) {
        pulsesRef.current.push({
          sourceId: edge.source,
          targetId: edge.target,
          progress: 0,
          speed: 0.012 + Math.random() * 0.01,
          color: Math.random() > 0.5 ? "#2dd4bf" : "#818cf8",
        });
      }
    }, 1800);
    return () => clearInterval(interval);
  }, []);

  // Simulation and Rendering Loop (Targeting 60fps with IntersectionObserver pause)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationFrameId: number;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        isVisibleRef.current = entry ? entry.isIntersecting : false;
      },
      { threshold: 0.05 }
    );

    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    const resizeCanvas = () => {
      if (!canvas || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.scale(dpr, dpr);
    };

    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);

    // Spring physics step
    const updatePhysics = (width: number, height: number) => {
      const currentNodes = nodes;
      const centerX = width / 2;
      const centerY = height / 2;

      // 1. Center gravity & boundary spring
      currentNodes.forEach((node) => {
        if (dragNodeRef.current?.id === node.id) return;

        const dx = centerX - node.x;
        const dy = centerY - node.y;
        node.vx += dx * 0.0008;
        node.vy += dy * 0.0008;

        // Repulsion between nodes
        currentNodes.forEach((other) => {
          if (node.id === other.id) return;
          const rx = node.x - other.x;
          const ry = node.y - other.y;
          const dist = Math.hypot(rx, ry) || 1;
          const minDist = node.radius + other.radius + 45;
          if (dist < minDist) {
            const force = ((minDist - dist) / dist) * 0.08;
            node.vx += rx * force;
            node.vy += ry * force;
          }
        });
      });

      // 2. Spring forces along edges
      edgesRef.current.forEach((edge) => {
        const source = currentNodes.find((n) => n.id === edge.source);
        const target = currentNodes.find((n) => n.id === edge.target);
        if (!source || !target) return;

        const ex = target.x - source.x;
        const ey = target.y - source.y;
        const dist = Math.hypot(ex, ey) || 1;
        const restLength = 110;
        const displacement = dist - restLength;
        const springForce = displacement * 0.002 * edge.strength;

        const fx = (ex / dist) * springForce;
        const fy = (ey / dist) * springForce;

        if (dragNodeRef.current?.id !== source.id) {
          source.vx += fx;
          source.vy += fy;
        }
        if (dragNodeRef.current?.id !== target.id) {
          target.vx -= fx;
          target.vy -= fy;
        }
      });

      // 3. Apply velocities with friction damping
      const friction = 0.88;
      currentNodes.forEach((node) => {
        if (dragNodeRef.current?.id === node.id) {
          node.x = mousePosRef.current.x;
          node.y = mousePosRef.current.y;
          node.vx = 0;
          node.vy = 0;
        } else {
          node.vx *= friction;
          node.vy *= friction;
          node.x += node.vx;
          node.y += node.vy;

          // Boundary clamp
          const pad = node.radius + 15;
          node.x = Math.max(pad, Math.min(width - pad, node.x));
          node.y = Math.max(pad, Math.min(height - pad, node.y));
        }
      });

      // 4. Update pulse packets
      pulsesRef.current = pulsesRef.current.filter((p) => {
        p.progress += p.speed;
        return p.progress < 1;
      });
    };

    // Draw loop
    const render = () => {
      if (!canvas || !containerRef.current) return;
      if (!isVisibleRef.current) {
        animationFrameId = requestAnimationFrame(render);
        return;
      }

      const rect = containerRef.current.getBoundingClientRect();
      const width = rect.width;
      const height = rect.height;

      updatePhysics(width, height);

      ctx.clearRect(0, 0, width, height);

      // Draw subtle background grid dots
      ctx.fillStyle = "rgba(120, 140, 140, 0.08)";
      const dotSpacing = 28;
      for (let x = dotSpacing / 2; x < width; x += dotSpacing) {
        for (let y = dotSpacing / 2; y < height; y += dotSpacing) {
          ctx.beginPath();
          ctx.arc(x, y, 1, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      const isNodeFiltered = (node: GraphNode) =>
        activeFilter === "all" || node.cluster === activeFilter;

      // Draw edges
      edgesRef.current.forEach((edge) => {
        const source = nodes.find((n) => n.id === edge.source);
        const target = nodes.find((n) => n.id === edge.target);
        if (!source || !target) return;

        const isHighlighted =
          (selectedNode && (source.id === selectedNode.id || target.id === selectedNode.id)) ||
          (hoveredNode && (source.id === hoveredNode.id || target.id === hoveredNode.id));

        const isDimmed =
          (activeFilter !== "all" && (!isNodeFiltered(source) || !isNodeFiltered(target))) ||
          (selectedNode && !isHighlighted);

        ctx.beginPath();
        ctx.moveTo(source.x, source.y);
        ctx.lineTo(target.x, target.y);

        if (isHighlighted) {
          ctx.strokeStyle = "rgba(45, 212, 191, 0.7)";
          ctx.lineWidth = 1.75;
        } else if (isDimmed) {
          ctx.strokeStyle = "rgba(100, 120, 120, 0.1)";
          ctx.lineWidth = 0.75;
        } else {
          ctx.strokeStyle = "rgba(100, 120, 120, 0.22)";
          ctx.lineWidth = 1;
        }
        ctx.stroke();
      });

      // Draw edge pulse packets
      pulsesRef.current.forEach((pulse) => {
        const source = nodes.find((n) => n.id === pulse.sourceId);
        const target = nodes.find((n) => n.id === pulse.targetId);
        if (!source || !target) return;

        const px = source.x + (target.x - source.x) * pulse.progress;
        const py = source.y + (target.y - source.y) * pulse.progress;

        ctx.save();
        ctx.beginPath();
        ctx.arc(px, py, 3.5, 0, Math.PI * 2);
        ctx.fillStyle = pulse.color;
        ctx.shadowColor = pulse.color;
        ctx.shadowBlur = 8;
        ctx.fill();
        ctx.restore();
      });

      // Draw nodes
      nodes.forEach((node) => {
        const isSelected = selectedNode?.id === node.id;
        const isHovered = hoveredNode?.id === node.id;
        const isDimmed = !isNodeFiltered(node);

        const currentRadius = isSelected || isHovered ? node.radius * 1.15 : node.radius;

        // Outer glow
        if (isSelected || isHovered) {
          ctx.save();
          ctx.beginPath();
          ctx.arc(node.x, node.y, currentRadius + 7, 0, Math.PI * 2);
          ctx.fillStyle = node.glowColor;
          ctx.fill();
          ctx.restore();
        }

        // Main node circle
        ctx.save();
        ctx.beginPath();
        ctx.arc(node.x, node.y, currentRadius, 0, Math.PI * 2);
        ctx.fillStyle = isDimmed ? "rgba(100, 110, 110, 0.2)" : node.color;
        ctx.fill();

        ctx.lineWidth = isSelected ? 2.5 : 1.5;
        ctx.strokeStyle = isSelected ? "#ffffff" : "rgba(255, 255, 255, 0.4)";
        ctx.stroke();
        ctx.restore();

        // Node label
        ctx.save();
        ctx.font = isSelected
          ? "600 11px -apple-system, sans-serif"
          : "500 10px -apple-system, sans-serif";
        ctx.fillStyle = isDimmed ? "rgba(120, 130, 130, 0.4)" : "rgba(140, 150, 155, 0.95)";
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillText(node.label, node.x, node.y + currentRadius + 5);
        ctx.restore();
      });

      animationFrameId = requestAnimationFrame(render);
    };

    animationFrameId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener("resize", resizeCanvas);
      observer.disconnect();
    };
  }, [nodes, activeFilter, selectedNode, hoveredNode]);

  // Pointer interaction helpers
  const handlePointerDown = (e: MouseEvent<HTMLCanvasElement>) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const hit = nodes.find(
      (n) => Math.hypot(n.x - mouseX, n.y - mouseY) <= n.radius + 8
    );

    if (hit) {
      dragNodeRef.current = hit;
      isDraggingRef.current = true;
      setSelectedNode(hit);
      mousePosRef.current = { x: mouseX, y: mouseY };
    }
  };

  const handlePointerMove = (e: MouseEvent<HTMLCanvasElement>) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    mousePosRef.current = { x: mouseX, y: mouseY };

    if (isDraggingRef.current && dragNodeRef.current) {
      return;
    }

    const hit = nodes.find(
      (n) => Math.hypot(n.x - mouseX, n.y - mouseY) <= n.radius + 6
    );

    setHoveredNode(hit || null);
  };

  const handlePointerUp = () => {
    isDraggingRef.current = false;
    dragNodeRef.current = null;
  };

  const resetGraph = () => {
    setNodes(INITIAL_NODES.map((n) => ({ ...n })));
    pulsesRef.current = [];
    setSelectedNode(nodes[3]);
    setActiveFilter("all");
  };

  return (
    <div
      ref={containerRef}
      className="relative w-full rounded-2xl border border-border/80 bg-card overflow-hidden shadow-sm card-hover"
    >
      {/* Top Header & HUD bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/70 bg-muted/30 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="flex h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse-glow" />
          <span className="font-mono text-xs font-semibold text-foreground flex items-center gap-1.5">
            <Layers className="h-3.5 w-3.5 text-primary" />
            Neural Memory Graph Core
          </span>
          <span className="hidden sm:inline-block font-mono text-[11px] text-muted-foreground">
            · 60fps Spring Simulation
          </span>
        </div>

        {/* Cluster Filter Buttons */}
        <div className="flex items-center gap-1 overflow-x-auto scrollbar-none font-mono text-xs">
          {[
            { id: "all", label: "All" },
            { id: "agents", label: "Agents" },
            { id: "tasks", label: "Tasks" },
            { id: "docs", label: "Docs" },
            { id: "commits", label: "Commits" },
            { id: "memos", label: "Memos" },
          ].map((filter) => (
            <button
              key={filter.id}
              type="button"
              onClick={() => setActiveFilter(filter.id)}
              className={`px-2 py-0.5 rounded transition-[background-color,color,transform] duration-160 ease-[var(--ease-out)] active:scale-[0.95] cursor-pointer text-[10.5px] ${
                activeFilter === filter.id
                  ? "bg-primary text-primary-foreground font-semibold"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              {filter.label}
            </button>
          ))}

          <Button
            size="sm"
            variant="outline"
            onClick={triggerPulseWave}
            disabled={isSyncing}
            className="h-6 px-2 text-[10.5px] font-mono gap-1 ml-1 cursor-pointer"
          >
            <Zap className={`h-3 w-3 ${isSyncing ? "text-amber-500 animate-spin" : "text-primary"}`} />
            <span>{isSyncing ? "Syncing..." : "Pulse"}</span>
          </Button>

          <button
            type="button"
            onClick={resetGraph}
            title="Reset layout"
            className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors cursor-pointer"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Main Interactive Canvas Area */}
      <div className="relative h-[480px] sm:h-[540px] w-full bg-background/50 cursor-grab active:cursor-grabbing">
        <canvas
          ref={canvasRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          className="absolute inset-0 h-full w-full touch-none"
        />

        {/* Selected Node HUD Card (Linear/Raycast style) */}
        {selectedNode && (
          <div className="pointer-events-none absolute bottom-4 left-4 max-w-xs sm:max-w-sm rounded-xl border border-border/90 bg-card/95 p-3.5 shadow-md backdrop-blur-md animate-fade-in-up space-y-2">
            <div className="flex items-center justify-between gap-2 border-b border-border/70 pb-2">
              <div className="flex items-center gap-1.5 font-mono text-xs font-semibold text-foreground">
                {selectedNode.type === "agent" && <Bot className="h-3.5 w-3.5 text-primary" />}
                {selectedNode.type === "task" && <CheckCircle2 className="h-3.5 w-3.5 text-teal-500" />}
                {selectedNode.type === "doc" && <FileText className="h-3.5 w-3.5 text-purple-500" />}
                {selectedNode.type === "commit" && <GitCommit className="h-3.5 w-3.5 text-blue-500" />}
                {selectedNode.type === "memo" && <Sparkles className="h-3.5 w-3.5 text-rose-500" />}
                <span>{selectedNode.label}</span>
              </div>
              <Badge variant="outline" className="font-mono text-[9.5px] uppercase">
                {selectedNode.cluster}
              </Badge>
            </div>

            <p className="text-xs text-muted-foreground leading-relaxed">
              {selectedNode.metadata.desc || "Connected knowledge node in local memory graph."}
            </p>

            <div className="space-y-1 font-mono text-[10px] text-muted-foreground pt-1 border-t border-border/50">
              {selectedNode.metadata.path && (
                <div className="truncate">
                  Path: <span className="text-foreground">{selectedNode.metadata.path}</span>
                </div>
              )}
              {selectedNode.metadata.status && (
                <div>
                  State: <span className="text-primary font-semibold">{selectedNode.metadata.status}</span>
                </div>
              )}
              {selectedNode.metadata.tokens && (
                <div>
                  Tokens: <span className="text-foreground">{selectedNode.metadata.tokens}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Drag Hint Overlay */}
        <div className="pointer-events-none absolute top-3 right-4 rounded-md bg-muted/60 px-2 py-1 font-mono text-[10px] text-muted-foreground border border-border/50 backdrop-blur-xs">
          Interactive: Drag nodes · Click to inspect · Pulse IPC
        </div>
      </div>
    </div>
  );
}

export default NeuralMemoryGraph;
