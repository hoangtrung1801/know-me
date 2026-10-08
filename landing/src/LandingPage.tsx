import { useState, useEffect, type MouseEvent } from "react";
import {
  Terminal,
  Copy,
  Check,
  ArrowRight,
  ShieldCheck,
  Cpu,
  GitBranch,
  BookOpen,
  ExternalLink,
  Bot,
  Zap,
  Search,
  Kanban,
  FileText,
  CheckCircle2,
  Lock,
  Layers,
  Code2,
  FolderTree,
  Sparkles,
  Bookmark,
  Hash,
  FolderGit2,
  CheckSquare,
  Link2,
  Pin,
  FileCode2,
  Split,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ThemeToggle } from "@/components/ThemeToggle";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";
import { NeuralMemoryGraph } from "@/components/NeuralMemoryGraph";
import { AppleDuoShowcase } from "@/components/AppleDuoShowcase";

interface DemoTab {
  id: string;
  name: string;
  toolCall: string;
  description: string;
  requestPayload: string;
  responsePayload: string;
  stats: { time: string; tokens: string; source: string };
}

const DEMO_TABS: DemoTab[] = [
  {
    id: "retrieve",
    name: "knowme_retrieve",
    toolCall: 'knowme_retrieve(task="TASK-104")',
    description: "Curated context pack: criteria, specs, and commit history for instant reasoning.",
    requestPayload: JSON.stringify(
      {
        jsonrpc: "2.0",
        id: 42,
        method: "tools/call",
        params: {
          name: "knowme_retrieve",
          arguments: { task: "TASK-104", include_docs: true, max_tokens: 3500 },
        },
      },
      null,
      2
    ),
    responsePayload: JSON.stringify(
      {
        task: {
          id: "TASK-104",
          title: "Implement MCP Stdio Bridge for Subagent Sessions",
          status: "in-progress",
          priority: "high",
          branch: "feat/mcp-stdio-bridge",
          assignee: "crewmate-4",
          acceptance_criteria: [
            "Stdio JSON-RPC 2.0 pipes over child processes",
            "Local .know-me/ disk state read in <10ms",
            "Deterministic citation anchors with @task/<id>",
          ],
          linked_docs: ["docs/architecture/mcp-bridge.md"],
          tags: ["mcp", "agent-runner"],
        },
        context_pack: { tokens_used: 1420, relevance_score: 0.98 },
      },
      null,
      2
    ),
    stats: { time: "8ms", tokens: "1,420 tokens", source: "Local Disk" },
  },
  {
    id: "search",
    name: "knowme_search",
    toolCall: 'knowme_search(query="token auth expiration")',
    description: "Hybrid retrieval: BM25 keyword matching + local ONNX vector embeddings on CPU.",
    requestPayload: JSON.stringify(
      {
        jsonrpc: "2.0",
        id: 43,
        method: "tools/call",
        params: {
          name: "knowme_search",
          arguments: { query: "token auth expiration", mode: "hybrid", limit: 2 },
        },
      },
      null,
      2
    ),
    responsePayload: JSON.stringify(
      {
        matches: [
          {
            type: "doc",
            path: "security/jwt-rotation.md",
            snippet: "Access tokens expire after 900s. Refresh tokens rotate on issuance.",
            score: 0.94,
            engine: "BM25 + ONNX",
          },
          {
            type: "task",
            id: "TASK-089",
            title: "Sliding session expiration in client SDK",
            score: 0.88,
            engine: "ONNX",
          },
        ],
      },
      null,
      2
    ),
    stats: { time: "14ms", tokens: "480 tokens", source: "BM25 + ONNX" },
  },
  {
    id: "doc",
    name: "knowme_doc",
    toolCall: 'knowme_doc(path="architecture/mcp-bridge.md")',
    description: "Read canonical specs with frontmatter, section anchors, and cross-links.",
    requestPayload: JSON.stringify(
      {
        jsonrpc: "2.0",
        id: 44,
        method: "tools/call",
        params: {
          name: "knowme_doc",
          arguments: { path: "architecture/mcp-bridge.md", section: "stdio-transport" },
        },
      },
      null,
      2
    ),
    responsePayload: JSON.stringify(
      {
        path: "architecture/mcp-bridge.md",
        title: "Model Context Protocol Stdio Architecture",
        content: "### stdio Transport Protocol\nSpawns CLI child process using stdin/stdout. Handshake exchanges tool definitions for instant retrieval.",
        referenced_by: ["TASK-104", "TASK-112"],
      },
      null,
      2
    ),
    stats: { time: "4ms", tokens: "620 tokens", source: "Git Markdown" },
  },
  {
    id: "task",
    name: "knowme_task",
    toolCall: 'knowme_task(id="TASK-104", action="update_status")',
    description: "Bidirectional execution: agents read requirements and atomically advance task states.",
    requestPayload: JSON.stringify(
      {
        jsonrpc: "2.0",
        id: 45,
        method: "tools/call",
        params: {
          name: "knowme_task",
          arguments: {
            id: "TASK-104",
            patch: { status: "review-ready", comment: "Verification passed." },
          },
        },
      },
      null,
      2
    ),
    responsePayload: JSON.stringify(
      {
        success: true,
        id: "TASK-104",
        previous_status: "in-progress",
        current_status: "review-ready",
        file_written: ".know-me/tasks/TASK-104.md",
      },
      null,
      2
    ),
    stats: { time: "11ms", tokens: "310 tokens", source: "Atomic Write" },
  },
];

export function LandingPage() {
  const [isDark, setIsDark] = useState(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("theme");
      if (saved) return saved === "dark";
      return window.matchMedia("(prefers-color-scheme: dark)").matches;
    }
    return true; // Default dark for Apple product launch
  });

  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add("dark");
      localStorage.setItem("theme", "dark");
    } else {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("theme", "light");
    }
  }, [isDark]);

  const toggleTheme = (e: MouseEvent<HTMLButtonElement>) => {
    setIsDark((prev) => !prev);
  };

  const [copiedInstall, setCopiedInstall] = useState(false);
  const [copiedPayload, setCopiedPayload] = useState(false);
  const [activeTabId, setActiveTabId] = useState("retrieve");
  const [demoView, setDemoView] = useState<"response" | "request">("response");

  // Interactive mock state for Task Checklist demo
  const [taskCheckedItems, setTaskCheckedItems] = useState<Record<number, boolean>>({
    0: true,
    1: true,
    2: false,
    3: false,
  });

  // Interactive mock state for Memo hashtag filter
  const [activeMemoTag, setActiveMemoTag] = useState<string>("all");

  const installCommand = "curl -fsSL https://knowme.dev/install.sh | sh";

  const copyToClipboard = (text: string, type: "install" | "payload") => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      void navigator.clipboard.writeText(text);
      if (type === "install") {
        setCopiedInstall(true);
        setTimeout(() => setCopiedInstall(false), 2000);
      } else {
        setCopiedPayload(true);
        setTimeout(() => setCopiedPayload(false), 2000);
      }
    }
  };

  const activeTab = DEMO_TABS.find((t) => t.id === activeTabId) || DEMO_TABS[0];

  const scrollToSection = (id: string) => {
    const el = document.getElementById(id);
    el?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <div className="relative min-h-screen w-full bg-[#000000] text-[#f5f5f7] selection:bg-[#2997ff]/30 selection:text-white">
      {/* Subtle Apple Radial Spotlight */}
      <div className="pointer-events-none fixed inset-0 -z-10 subtle-spotlight opacity-75" />

      {/* ===================================================================
          1. FLOATING TRANSLUCENT PILL NAV (Apple Materials)
          =================================================================== */}
      <header className="fixed top-4 left-1/2 -translate-x-1/2 z-50 w-[94%] max-w-5xl rounded-full apple-glass-pill py-2 px-4 sm:px-6 flex items-center justify-between transition-all duration-300">
        {/* Wordmark */}
        <a
          href="/"
          className="flex items-center gap-2.5 group active:scale-[0.98] transition-transform duration-160 ease-[var(--apple-spring)]"
        >
          <img
            src="/logo.png"
            alt="KnowMe Logo"
            className="h-7 w-7 rounded-lg border border-white/20 object-cover shadow-sm transition-transform duration-160 group-hover:scale-105"
          />
          <div className="flex flex-col">
            <span className="font-semibold tracking-tight text-white text-sm">
              KnowMe
            </span>
            <span className="text-[9.5px] text-[#86868b] font-mono leading-none">
              duo core
            </span>
          </div>
        </a>

        {/* Center Links */}
        <nav className="hidden md:flex items-center gap-1 text-xs text-[#86868b] font-medium">
          <button
            type="button"
            onClick={() => scrollToSection("duo-showcase")}
            className="px-2.5 py-1 rounded-full hover:text-white hover:bg-white/10 transition-colors duration-160 cursor-pointer"
          >
            Duo
          </button>
          <button
            type="button"
            onClick={() => scrollToSection("memory-graph")}
            className="px-2.5 py-1 rounded-full hover:text-white hover:bg-white/10 transition-colors duration-160 cursor-pointer"
          >
            Graph
          </button>
          <button
            type="button"
            onClick={() => scrollToSection("features-projects")}
            className="px-2.5 py-1 rounded-full hover:text-white hover:bg-white/10 transition-colors duration-160 cursor-pointer"
          >
            Features
          </button>
          <button
            type="button"
            onClick={() => scrollToSection("workbench-demo")}
            className="px-2.5 py-1 rounded-full hover:text-white hover:bg-white/10 transition-colors duration-160 cursor-pointer"
          >
            MCP Bridge
          </button>
          <button
            type="button"
            onClick={() => scrollToSection("faq-section")}
            className="px-2.5 py-1 rounded-full hover:text-white hover:bg-white/10 transition-colors duration-160 cursor-pointer"
          >
            FAQ
          </button>
        </nav>

        {/* Right CTA */}
        <div className="flex items-center gap-2">
          <a
            href="https://github.com/knowns/know-me"
            target="_blank"
            rel="noreferrer"
            className="hidden sm:inline-flex p-1.5 rounded-full text-[#86868b] hover:text-white hover:bg-white/10 transition-colors"
            title="GitHub Repository"
          >
            <GitBranch className="h-4 w-4" />
          </a>

          <ThemeToggle
            isDark={isDark}
            onToggle={toggleTheme}
            size="sm"
            className="text-[#86868b] hover:text-white active:scale-[0.95]"
          />

          <a href="http://localhost:6421" target="_blank" rel="noreferrer">
            <Button
              size="sm"
              className="rounded-full bg-[#2997ff] text-white hover:bg-[#2997ff]/90 text-xs px-4 h-8 font-medium shadow-sm transition-transform active:scale-[0.96] cursor-pointer"
            >
              <span>Launch</span>
              <ArrowRight className="h-3.5 w-3.5 ml-1" />
            </Button>
          </a>
        </div>
      </header>

      {/* Main Keynote Canvas */}
      <main className="mx-auto max-w-7xl px-4 pt-28 pb-16 sm:px-6 lg:px-8 space-y-24 sm:space-y-36">
        {/* ===================================================================
            2. HERO SECTION (Apple Keynote Giant Display Typography)
            =================================================================== */}
        <section className="text-center pt-8 sm:pt-14 space-y-6 sm:space-y-8 animate-fade-in-up">
          {/* Eyebrow Tagline */}
          <div className="inline-flex items-center gap-2">
            <span className="rounded-full border border-white/15 bg-white/[0.04] px-3.5 py-1 text-xs text-[#2997ff] font-mono tracking-tight flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-[#2997ff] animate-pulse-glow" />
              Local-first memory for AI-native software engineering
            </span>
          </div>

          {/* Giant Bold Display Headline */}
          <h1 className="text-5xl sm:text-7xl md:text-8xl lg:text-9xl font-bold tracking-[-0.04em] leading-[1.02] text-balance titanium-gradient max-w-6xl mx-auto">
            Your personal knowledge database.
          </h1>

          {/* Keynote Subheadline */}
          <p className="text-lg sm:text-2xl text-[#86868b] leading-relaxed max-w-3xl mx-auto font-normal text-pretty">
            Two minds. One shared memory. Projects, tasks, docs, and memos unified in a calm space, accessible to human engineers and AI coding agents without re-explaining.
          </p>

          {/* Hero Actions & Install Command */}
          <div className="flex flex-col items-center gap-4 pt-2">
            <div className="flex flex-wrap items-center justify-center gap-3">
              <a href="http://localhost:6421" target="_blank" rel="noreferrer">
                <Button
                  size="lg"
                  className="rounded-full bg-white text-black hover:bg-white/90 font-medium px-7 h-12 text-sm transition-transform active:scale-[0.98] cursor-pointer shadow-lg"
                >
                  <span>Open Workspace</span>
                  <ArrowRight className="h-4 w-4 ml-1" />
                </Button>
              </a>

              <a
                href="https://github.com/knowns/know-me"
                target="_blank"
                rel="noreferrer"
                className="inline-flex"
              >
                <Button
                  variant="outline"
                  size="lg"
                  className="rounded-full border-white/20 bg-white/5 text-white hover:bg-white/10 font-medium px-6 h-12 text-sm cursor-pointer"
                >
                  <GitBranch className="h-4 w-4 mr-1.5 text-[#86868b]" />
                  <span>Star on GitHub</span>
                </Button>
              </a>
            </div>

            {/* Quick Install Pill */}
            <div className="flex items-center justify-between gap-3 rounded-full border border-white/15 bg-white/[0.03] px-4 py-2 font-mono text-xs text-white max-w-md w-full shadow-md backdrop-blur-md">
              <div className="flex items-center gap-2 overflow-x-auto select-all">
                <span className="text-[#86868b] select-none">$</span>
                <span className="font-mono text-white truncate">{installCommand}</span>
              </div>
              <button
                type="button"
                onClick={() => copyToClipboard(installCommand, "install")}
                aria-label="Copy install script"
                className="shrink-0 p-1.5 rounded-full text-[#86868b] hover:text-white hover:bg-white/10 active:scale-[0.95] transition-all cursor-pointer"
              >
                {copiedInstall ? (
                  <Check className="h-3.5 w-3.5 text-emerald-400" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
              </button>
            </div>
            <p className="text-[11.5px] text-[#86868b] flex items-center gap-1.5 font-mono">
              <ShieldCheck className="h-3.5 w-3.5 text-[#2997ff]" />
              <span>Standalone POSIX binary · macOS, Linux & WSL · Zero cloud dependency</span>
            </p>
          </div>
        </section>

        {/* ===================================================================
            3. APPLE 'DUO' SHOWCASE (Twin Power Device Frame)
            =================================================================== */}
        <section id="duo-showcase" className="scroll-mt-24 space-y-6 animate-fade-in-up">
          <div className="text-center space-y-2 max-w-2xl mx-auto">
            <span className="font-mono text-xs uppercase tracking-wider text-[#2997ff] font-semibold">
              The Duo Architecture
            </span>
            <h2 className="text-3xl sm:text-5xl font-bold tracking-[-0.035em] text-white">
              Two minds. One shared memory.
            </h2>
            <p className="text-sm sm:text-base text-[#86868b]">
              Switch perspectives between the human engineer's calm canvas and the AI agent's low-latency execution core.
            </p>
          </div>

          <AppleDuoShowcase />
        </section>

        {/* ===================================================================
            4. VISUAL GRAPH MEMORY CORE (Interactive Canvas Topology)
            =================================================================== */}
        <section id="memory-graph" className="scroll-mt-24 space-y-5 animate-fade-in-up">
          <div className="space-y-1.5 max-w-2xl">
            <div className="inline-flex items-center gap-2 text-[#2997ff] font-mono text-xs uppercase tracking-wider font-semibold">
              <Layers className="h-4 w-4" />
              <span>Neural Memory Core</span>
            </div>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-[-0.035em] text-white">
              Live neural memory topology.
            </h2>
            <p className="text-sm text-[#86868b] leading-relaxed">
              Watch tasks, specifications, git commits, and AI coding agents interconnect in real-time. Drag nodes with natural spring physics, filter clusters, and pulse live stdio retrieval packets across the graph.
            </p>
          </div>

          <NeuralMemoryGraph />
        </section>

        {/* ===================================================================
            5. BENTO OVERVIEW (Apple Pro Cards)
            =================================================================== */}
        <section className="space-y-5">
          <div className="space-y-1 max-w-2xl">
            <p className="font-mono text-xs uppercase tracking-wider text-[#2997ff] font-semibold">
              Pro Architecture
            </p>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-[-0.035em] text-white">
              Engineered for developer clarity.
            </h2>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3 md:grid-rows-[auto_auto_auto]">
            {/* Tile 1: Lead Tile */}
            <article className="md:col-span-2 md:row-span-2 rounded-3xl apple-card p-6 sm:p-8 flex flex-col justify-between">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Badge variant="outline" className="text-xs font-mono text-[#2997ff] border-[#2997ff]/30 bg-[#2997ff]/10">
                    Lead Feature · Core Protocol
                  </Badge>
                  <span className="font-mono text-xs text-[#86868b]">stdio JSON-RPC</span>
                </div>

                <h3 className="text-3xl sm:text-4xl font-bold tracking-[-0.035em] text-white text-balance">
                  Stop re-explaining your project to AI coding agents.
                </h3>

                <p className="text-sm sm:text-base text-[#86868b] leading-relaxed max-w-xl font-normal">
                  Coding agents lose context every new thread. KnowMe bridges Claude Code, Cursor, Codex, Hermes, and OpenCode straight into your tasks and architectural decisions via stdio pipes.
                </p>
              </div>

              <div className="mt-8 pt-6 border-t border-white/10 space-y-3">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  {[
                    { name: "Claude Code", status: "MCP stdio", icon: Bot },
                    { name: "Cursor IDE", status: "Direct bridge", icon: Code2 },
                    { name: "Hermes & OMP", status: "Auto-detect", icon: Cpu },
                    { name: "Codex CLI", status: "Native tools", icon: Terminal },
                  ].map((agent) => (
                    <div
                      key={agent.name}
                      className="rounded-2xl border border-white/10 bg-white/[0.02] p-3 text-center space-y-1 hover:border-white/20 transition-all"
                    >
                      <agent.icon className="h-4 w-4 text-[#2997ff] mx-auto" />
                      <div className="text-xs font-medium text-white">{agent.name}</div>
                      <div className="text-[10px] font-mono text-[#86868b]">{agent.status}</div>
                    </div>
                  ))}
                </div>
              </div>
            </article>

            {/* Tile 2 */}
            <article className="rounded-3xl apple-card p-6 flex flex-col justify-between">
              <div className="space-y-2">
                <div className="flex items-center gap-1.5 text-[#2997ff]">
                  <GitBranch className="h-4 w-4" />
                  <span className="font-mono text-xs uppercase tracking-wider font-semibold">Local-First</span>
                </div>
                <h3 className="text-xl font-bold tracking-[-0.02em] text-white">Git-Native Storage</h3>
                <p className="text-xs sm:text-sm text-[#86868b] leading-relaxed">
                  Plain Markdown and JSON on disk. Commit tasks and architecture docs right alongside your code commits.
                </p>
              </div>
              <div className="mt-4 pt-3 border-t border-white/10 text-[11px] font-mono text-[#86868b] flex justify-between">
                <span>Storage:</span>
                <span className="text-white font-medium">POSIX files</span>
              </div>
            </article>

            {/* Tile 3 */}
            <article className="rounded-3xl apple-card p-6 flex flex-col justify-between">
              <div className="space-y-2">
                <div className="flex items-center gap-1.5 text-[#2997ff]">
                  <Kanban className="h-4 w-4" />
                  <span className="font-mono text-xs uppercase tracking-wider font-semibold">Calm UI</span>
                </div>
                <h3 className="text-xl font-bold tracking-[-0.02em] text-white">Distraction-Free</h3>
                <p className="text-xs sm:text-sm text-[#86868b] leading-relaxed">
                  Fluid Kanban board, hashtagged memos, and reading lists. High information density without visual fatigue.
                </p>
              </div>
              <div className="mt-4 pt-3 border-t border-white/10 flex gap-1.5 font-mono text-[10px] text-[#86868b]">
                <span className="px-2 py-0.5 rounded-full bg-white/5 border border-white/10">#mcp</span>
                <span className="px-2 py-0.5 rounded-full bg-white/5 border border-white/10">#perf</span>
                <span className="px-2 py-0.5 rounded-full bg-white/5 border border-white/10">#rfc</span>
              </div>
            </article>

            {/* Tile 4 */}
            <article className="md:col-span-2 rounded-3xl apple-card p-6 sm:p-7 flex flex-col justify-between">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-[#2997ff]">
                    <Search className="h-4 w-4" />
                    <span className="font-mono text-xs uppercase tracking-wider font-semibold">Retrieval</span>
                  </div>
                  <span className="font-mono text-xs text-[#86868b]">BM25 + ONNX</span>
                </div>
                <h3 className="text-xl font-bold tracking-[-0.02em] text-white">
                  Deterministic References & Hybrid Retrieval
                </h3>
                <p className="text-xs sm:text-sm text-[#86868b] leading-relaxed max-w-xl">
                  Link work with deterministic <code className="text-xs bg-white/10 px-1.5 py-0.5 rounded font-mono text-[#2997ff] font-semibold">@task/&lt;id&gt;</code> and <code className="text-xs bg-white/10 px-1.5 py-0.5 rounded font-mono text-[#2997ff] font-semibold">@doc/&lt;path&gt;</code> anchors. Sub-15ms local search combines exact keywords with CPU embeddings.
                </p>
              </div>
              <div className="mt-5 pt-3 border-t border-white/10 text-[11px] font-mono text-[#86868b] flex justify-between">
                <span>Latency: &lt;15ms</span>
                <span>External vector DB: None</span>
              </div>
            </article>

            {/* Tile 5 */}
            <article className="rounded-3xl apple-card p-6 flex flex-col justify-between">
              <div className="space-y-2">
                <div className="flex items-center gap-1.5 text-[#2997ff]">
                  <Cpu className="h-4 w-4" />
                  <span className="font-mono text-xs uppercase tracking-wider font-semibold">Runner</span>
                </div>
                <h3 className="text-xl font-bold tracking-[-0.02em] text-white">Isolated Worktrees</h3>
                <p className="text-xs sm:text-sm text-[#86868b] leading-relaxed">
                  Integrated OMP runner executes agents inside disposable Git worktrees with milestone review gates.
                </p>
              </div>
              <div className="mt-4 pt-3 border-t border-white/10 text-[11px] font-mono text-[#2997ff] font-medium flex justify-between">
                <span>Worktree Isolation:</span>
                <span>100% Safe</span>
              </div>
            </article>

            {/* Tile 6 */}
            <article className="md:col-span-3 rounded-3xl apple-card p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-1.5 text-[#2997ff]">
                  <Lock className="h-4 w-4" />
                  <span className="font-mono text-xs uppercase tracking-wider font-semibold">Data Sovereignty</span>
                </div>
                <h3 className="text-lg font-bold text-white">
                  Zero Telemetry & Private by Default
                </h3>
                <p className="text-xs sm:text-sm text-[#86868b] max-w-2xl">
                  Code, blueprints, and prompts stay on your machine. No cloud telemetry, no remote databases.
                </p>
              </div>
              <Badge variant="outline" className="font-mono text-xs bg-white/5 border-white/20 text-white shrink-0">
                100% Offline Capable
              </Badge>
            </article>
          </div>
        </section>

        {/* ===================================================================
            CORE FEATURE 1: PROJECTS
            =================================================================== */}
        <section id="features-projects" className="scroll-mt-24 space-y-6">
          <div className="grid grid-cols-1 gap-10 lg:grid-cols-12 lg:items-center">
            <div className="lg:col-span-5 space-y-3">
              <div className="inline-flex items-center gap-2 text-[#2997ff] font-mono text-xs uppercase tracking-wider font-semibold">
                <FolderGit2 className="h-4 w-4" />
                <span>Feature 01 · Projects</span>
              </div>
              <h2 className="text-3xl sm:text-4xl font-bold tracking-[-0.035em] text-white">
                Centralized home per repository.
              </h2>
              <p className="text-sm sm:text-base text-[#86868b] leading-relaxed">
                Dedicated workspace home per codebase. Switch between client projects, libraries, and microservices without context loss or window sprawl.
              </p>
              <div className="space-y-2 pt-1 text-xs text-[#86868b]">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-3.5 w-3.5 text-[#2997ff] shrink-0" />
                  <span>Instant workspace switching with zero reload lag</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-3.5 w-3.5 text-[#2997ff] shrink-0" />
                  <span>Binds tasks, docs, and git worktrees under one roof</span>
                </div>
              </div>
            </div>

            <div className="lg:col-span-7">
              <div className="rounded-3xl apple-card p-5 space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-white/10 text-xs">
                  <span className="font-medium text-white flex items-center gap-1.5">
                    <FolderGit2 className="h-3.5 w-3.5 text-[#2997ff]" />
                    Workspace Switcher
                  </span>
                  <Badge variant="outline" className="text-[10px] font-mono border-white/20 text-[#86868b]">
                    4 Local Repos
                  </Badge>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {[
                    { name: "know-me/core", path: "~/code/know-me", active: true, meta: "24 tasks · 18 docs", branch: "main" },
                    { name: "api-gateway", path: "~/code/api-gateway", active: false, meta: "12 tasks · 6 docs", branch: "feat/grpc" },
                    { name: "mobile-sdk", path: "~/code/mobile-sdk", active: false, meta: "9 tasks · 14 docs", branch: "v2.1-dev" },
                    { name: "infra-config", path: "~/code/infra", active: false, meta: "17 tasks · 29 docs", branch: "staging" },
                  ].map((p) => (
                    <div
                      key={p.name}
                      className={`p-3 rounded-2xl border transition-all duration-200 ${
                        p.active
                          ? "border-[#2997ff]/50 bg-[#2997ff]/10"
                          : "border-white/10 bg-white/[0.02] hover:bg-white/[0.05]"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-semibold text-xs text-white truncate">{p.name}</span>
                        {p.active ? (
                          <span className="text-[9px] font-mono px-2 py-0.5 rounded-full bg-[#2997ff] text-white font-semibold">
                            ACTIVE
                          </span>
                        ) : (
                          <span className="text-[9px] font-mono text-[#86868b]">SWITCH</span>
                        )}
                      </div>
                      <div className="text-[11px] font-mono text-[#86868b] truncate mb-2">{p.path}</div>
                      <div className="flex items-center justify-between text-[10px] font-mono text-[#86868b] pt-1.5 border-t border-white/5">
                        <span>{p.meta}</span>
                        <span className="text-white">{p.branch}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ===================================================================
            CORE FEATURE 2: TASKS
            =================================================================== */}
        <section id="features-tasks" className="scroll-mt-24 space-y-6">
          <div className="grid grid-cols-1 gap-10 lg:grid-cols-12 lg:items-center">
            <div className="lg:col-span-7 order-2 lg:order-1">
              <div className="rounded-3xl apple-card p-5 space-y-3.5">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-3">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold text-[#2997ff] px-2.5 py-0.5 rounded-full bg-[#2997ff]/15">
                      TASK-104
                    </span>
                    <span className="font-semibold text-sm text-white">Implement MCP Stdio Bridge</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Badge variant="outline" className="border-amber-400/40 text-amber-400 text-[10px] font-mono font-semibold">
                      HIGH
                    </Badge>
                    <Badge variant="secondary" className="text-[10px] font-mono bg-white/10 text-white">
                      IN PROGRESS
                    </Badge>
                  </div>
                </div>

                <div className="space-y-2 text-xs">
                  <div className="flex items-center justify-between font-medium text-white text-[11.5px]">
                    <span className="flex items-center gap-1.5 text-[#2997ff]">
                      <CheckSquare className="h-3.5 w-3.5" />
                      Acceptance Criteria (Click to test toggle)
                    </span>
                    <span className="font-mono text-[11px] text-[#86868b]">
                      {Object.values(taskCheckedItems).filter(Boolean).length} / 4 passed
                    </span>
                  </div>

                  {[
                    "Support JSON-RPC 2.0 pipes over child process stdin/stdout",
                    "Atomic local .know-me/ disk reads with zero latency",
                    "Deterministic citation anchors with @task/<id>",
                    "Worktree verification before review milestone transition",
                  ].map((crit, idx) => (
                    <button
                      key={crit}
                      type="button"
                      onClick={() =>
                        setTaskCheckedItems((prev) => ({ ...prev, [idx]: !prev[idx] }))
                      }
                      className="w-full flex items-center gap-2.5 p-2.5 rounded-xl border border-white/10 hover:bg-white/[0.04] active:scale-[0.98] transition-all text-left cursor-pointer"
                    >
                      <span className={`h-4 w-4 rounded-md flex items-center justify-center shrink-0 border transition-colors ${
                        taskCheckedItems[idx]
                          ? "bg-[#2997ff] border-[#2997ff] text-white"
                          : "border-white/20 bg-transparent"
                      }`}>
                        {taskCheckedItems[idx] && <Check className="h-3 w-3" />}
                      </span>
                      <span className={`text-xs truncate ${taskCheckedItems[idx] ? "line-through text-[#86868b]" : "text-white"}`}>
                        {crit}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="lg:col-span-5 space-y-3 order-1 lg:order-2">
              <div className="inline-flex items-center gap-2 text-[#2997ff] font-mono text-xs uppercase tracking-wider font-semibold">
                <CheckSquare className="h-4 w-4" />
                <span>Feature 02 · Tasks</span>
              </div>
              <h2 className="text-3xl sm:text-4xl font-bold tracking-[-0.035em] text-white">
                Engineering contracts with clear criteria.
              </h2>
              <p className="text-sm sm:text-base text-[#86868b] leading-relaxed">
                Tasks with full lifecycle states (<code className="text-xs font-mono bg-white/10 px-1.5 py-0.5 rounded text-white">todo</code>, <code className="text-xs font-mono bg-white/10 px-1.5 py-0.5 rounded text-white">in-progress</code>, <code className="text-xs font-mono bg-white/10 px-1.5 py-0.5 rounded text-white">review-ready</code>, <code className="text-xs font-mono bg-white/10 px-1.5 py-0.5 rounded text-white">done</code>), checklist acceptance criteria, and git worktree links.
              </p>
              <div className="space-y-2 pt-1 text-xs text-[#86868b]">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-3.5 w-3.5 text-[#2997ff] shrink-0" />
                  <span>Interactive checklists AI agents read and check off</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-3.5 w-3.5 text-[#2997ff] shrink-0" />
                  <span>State transitions logged directly inside markdown</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ===================================================================
            CORE FEATURE 3: KANBAN
            =================================================================== */}
        <section id="features-kanban" className="scroll-mt-24 space-y-6">
          <div className="grid grid-cols-1 gap-10 lg:grid-cols-12 lg:items-center">
            <div className="lg:col-span-5 space-y-3">
              <div className="inline-flex items-center gap-2 text-[#2997ff] font-mono text-xs uppercase tracking-wider font-semibold">
                <Kanban className="h-4 w-4" />
                <span>Feature 03 · Kanban</span>
              </div>
              <h2 className="text-3xl sm:text-4xl font-bold tracking-[-0.035em] text-white">
                Calm, high-density stage visibility.
              </h2>
              <p className="text-sm sm:text-base text-[#86868b] leading-relaxed">
                Responsive visual board view for instant WIP tracking. Monitor background subagents moving tasks through milestone review gates in real-time.
              </p>
              <div className="space-y-2 pt-1 text-xs text-[#86868b]">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-3.5 w-3.5 text-[#2997ff] shrink-0" />
                  <span>Clear stage columns from Backlog to Done</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-3.5 w-3.5 text-[#2997ff] shrink-0" />
                  <span>Fast keyboard filtering by hashtag, priority, or assignee</span>
                </div>
              </div>
            </div>

            <div className="lg:col-span-7">
              <div className="rounded-3xl apple-card p-5 space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-white/10 text-xs">
                  <span className="font-semibold text-white flex items-center gap-1.5">
                    <Kanban className="h-3.5 w-3.5 text-[#2997ff]" />
                    Sprint Board
                  </span>
                  <span className="font-mono text-[#86868b] text-[11px]">8 active items · 0 blocked</span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  <div className="rounded-2xl bg-white/[0.02] p-2.5 border border-white/5 space-y-1.5">
                    <div className="flex items-center justify-between text-[10.5px] font-mono font-semibold text-[#86868b] pb-1 border-b border-white/5">
                      <span>BACKLOG</span>
                      <span className="px-1.5 py-0.2 rounded bg-white/10 text-[10px]">2</span>
                    </div>
                    <div className="p-2 rounded-xl bg-white/[0.04] border border-white/10 text-[11px]">
                      <div className="font-medium text-white truncate">SQLite indexing</div>
                      <div className="text-[10px] font-mono text-[#86868b]">#perf · T-108</div>
                    </div>
                  </div>

                  <div className="rounded-2xl bg-white/[0.02] p-2.5 border border-white/5 space-y-1.5">
                    <div className="flex items-center justify-between text-[10.5px] font-mono font-semibold text-[#2997ff] pb-1 border-b border-white/5">
                      <span>PROGRESS</span>
                      <span className="px-1.5 py-0.2 rounded bg-[#2997ff]/20 text-[#2997ff] text-[10px]">1</span>
                    </div>
                    <div className="p-2 rounded-xl bg-white/[0.04] border border-[#2997ff]/30 text-[11px] space-y-1">
                      <div className="font-medium text-white truncate">MCP Stdio Bridge</div>
                      <div className="text-[10px] font-mono text-[#2997ff] font-semibold">T-104 (75%)</div>
                      <div className="h-1 w-full bg-white/10 rounded-full overflow-hidden">
                        <div className="h-full bg-[#2997ff] w-3/4" />
                      </div>
                    </div>
                  </div>

                  <div className="rounded-2xl bg-white/[0.02] p-2.5 border border-white/5 space-y-1.5">
                    <div className="flex items-center justify-between text-[10.5px] font-mono font-semibold text-amber-400 pb-1 border-b border-white/5">
                      <span>REVIEW</span>
                      <span className="px-1.5 py-0.2 rounded bg-amber-400/20 text-amber-400 text-[10px]">1</span>
                    </div>
                    <div className="p-2 rounded-xl bg-white/[0.04] border border-white/10 text-[11px]">
                      <div className="font-medium text-white truncate">ONNX Vectors</div>
                      <div className="text-[10px] font-mono text-[#86868b]">#ai · T-101</div>
                    </div>
                  </div>

                  <div className="rounded-2xl bg-white/[0.02] p-2.5 border border-white/5 space-y-1.5">
                    <div className="flex items-center justify-between text-[10.5px] font-mono font-semibold text-emerald-400 pb-1 border-b border-white/5">
                      <span>DONE</span>
                      <span className="px-1.5 py-0.2 rounded bg-emerald-400/20 text-emerald-400 text-[10px]">4</span>
                    </div>
                    <div className="p-2 rounded-xl bg-white/[0.02] border border-white/5 text-[10.5px] text-[#86868b] line-through truncate">
                      Theme tokens (T-098)
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ===================================================================
            CORE FEATURE 4: SAVED LINKS
            =================================================================== */}
        <section id="features-links" className="scroll-mt-24 space-y-6">
          <div className="grid grid-cols-1 gap-10 lg:grid-cols-12 lg:items-center">
            <div className="lg:col-span-7 order-2 lg:order-1">
              <div className="rounded-3xl apple-card p-5 space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-white/10 text-xs">
                  <span className="font-semibold text-white flex items-center gap-1.5">
                    <Bookmark className="h-3.5 w-3.5 text-[#2997ff]" />
                    Reading Archive
                  </span>
                  <span className="text-[10px] font-mono text-[#86868b]">Auto-tagged</span>
                </div>

                <div className="space-y-2">
                  {[
                    { title: "Model Context Protocol Specification", domain: "modelcontextprotocol.io", tags: ["#mcp", "#spec"] },
                    { title: "uv: Fast Python Package Installer", domain: "github.com", tags: ["#python", "#tools"] },
                    { title: "Local Vector Search with ONNX in Rust", domain: "antigravity.dev", tags: ["#onnx", "#rust"] },
                  ].map((item) => (
                    <div
                      key={item.title}
                      className="p-3 rounded-2xl border border-white/10 bg-white/[0.02] hover:bg-white/[0.05] transition-all flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <div className="font-medium text-xs text-white truncate flex items-center gap-1.5">
                          <Link2 className="h-3 w-3 text-[#2997ff] shrink-0" />
                          <span className="truncate">{item.title}</span>
                        </div>
                        <div className="text-[10px] font-mono text-[#86868b] truncate">{item.domain}</div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0 font-mono text-[9px] text-[#86868b]">
                        {item.tags.map((t) => (
                          <span key={t} className="px-2 py-0.5 rounded-full bg-white/10 text-white">{t}</span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="lg:col-span-5 space-y-3 order-1 lg:order-2">
              <div className="inline-flex items-center gap-2 text-[#2997ff] font-mono text-xs uppercase tracking-wider font-semibold">
                <Bookmark className="h-4 w-4" />
                <span>Feature 04 · Saved Links</span>
              </div>
              <h2 className="text-3xl sm:text-4xl font-bold tracking-[-0.035em] text-white">
                Personal developer web archive.
              </h2>
              <p className="text-sm sm:text-base text-[#86868b] leading-relaxed">
                Bookmark libraries, RFC proposals, and blogs with automatic domain extraction and local indexing. No third-party cloud bookmarks needed.
              </p>
              <div className="space-y-2 pt-1 text-xs text-[#86868b]">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-3.5 w-3.5 text-[#2997ff] shrink-0" />
                  <span>Automatic domain extraction and hashtag indexing</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-3.5 w-3.5 text-[#2997ff] shrink-0" />
                  <span>Available to AI agents as verified context via MCP</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ===================================================================
            CORE FEATURE 5: MEMOS
            =================================================================== */}
        <section id="features-memos" className="scroll-mt-24 space-y-6">
          <div className="grid grid-cols-1 gap-10 lg:grid-cols-12 lg:items-center">
            <div className="lg:col-span-5 space-y-3">
              <div className="inline-flex items-center gap-2 text-[#2997ff] font-mono text-xs uppercase tracking-wider font-semibold">
                <Hash className="h-4 w-4" />
                <span>Feature 05 · Memos</span>
              </div>
              <h2 className="text-3xl sm:text-4xl font-bold tracking-[-0.035em] text-white">
                Rapid capture without project friction.
              </h2>
              <p className="text-sm sm:text-base text-[#86868b] leading-relaxed">
                Zero-friction capture for fleeting thoughts, bug notes, and ideas with instant hashtag filtering. Accessible globally even without an active project.
              </p>
              <div className="space-y-2 pt-1 text-xs text-[#86868b]">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-3.5 w-3.5 text-[#2997ff] shrink-0" />
                  <span>Instant hashtag classification (#ideas, #bugs, #rfc)</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-3.5 w-3.5 text-[#2997ff] shrink-0" />
                  <span>Pin important notes to keep them visible</span>
                </div>
              </div>
            </div>

            <div className="lg:col-span-7">
              <div className="rounded-3xl apple-card p-5 space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-white/10 text-xs">
                  <span className="font-semibold text-white flex items-center gap-1.5">
                    <Hash className="h-3.5 w-3.5 text-[#2997ff]" />
                    Engineering Memos
                  </span>
                  <div className="flex items-center gap-1">
                    {["all", "ideas", "bugs", "rfc"].map((tag) => (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => setActiveMemoTag(tag)}
                        className={`text-[10px] font-mono px-2.5 py-0.5 rounded-full cursor-pointer transition-all ${
                          activeMemoTag === tag
                            ? "bg-[#2997ff] text-white font-semibold"
                            : "bg-white/10 text-[#86868b] hover:text-white"
                        }`}
                      >
                        #{tag}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2.5">
                  {[
                    { content: "Enforce POSIX path separators for subagent worktrees on WSL.", tag: "bugs", date: "2h ago", pinned: true },
                    { content: "Weight BM25 keyword matches 60% and ONNX embeddings 40% for developer term precision.", tag: "ideas", date: "Yesterday", pinned: false },
                    { content: "RFC: Draft subagent lifecycle transition hooks for CI/CD checks.", tag: "rfc", date: "3d ago", pinned: false },
                  ]
                    .filter((m) => activeMemoTag === "all" || m.tag === activeMemoTag)
                    .map((m) => (
                      <div key={m.content} className="p-3 rounded-2xl border border-white/10 bg-white/[0.02] space-y-1">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-xs text-white leading-relaxed">{m.content}</p>
                          {m.pinned && <Pin className="h-3 w-3 text-[#2997ff] shrink-0 fill-[#2997ff]/30" />}
                        </div>
                        <div className="flex items-center justify-between text-[10px] font-mono text-[#86868b] pt-1">
                          <span className="text-[#2997ff] font-semibold">#{m.tag}</span>
                          <span>{m.date}</span>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ===================================================================
            CORE FEATURE 6: DOCS
            =================================================================== */}
        <section id="features-docs" className="scroll-mt-24 space-y-6">
          <div className="grid grid-cols-1 gap-10 lg:grid-cols-12 lg:items-center">
            <div className="lg:col-span-7 order-2 lg:order-1">
              <div className="rounded-3xl apple-card p-5 space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-white/10 text-xs">
                  <span className="font-semibold text-white flex items-center gap-1.5">
                    <FileCode2 className="h-3.5 w-3.5 text-[#2997ff]" />
                    docs/architecture/mcp-bridge.md
                  </span>
                  <Badge variant="outline" className="text-[10px] font-mono text-[#2997ff] border-[#2997ff]/40 bg-[#2997ff]/10">
                    APPROVED SPEC
                  </Badge>
                </div>

                <div className="rounded-2xl border border-white/10 bg-black/40 p-4 space-y-2.5 font-sans text-xs">
                  <div className="space-y-0.5">
                    <h4 className="text-sm font-semibold text-white">
                      Model Context Protocol Stdio Transport Architecture
                    </h4>
                    <p className="text-[10px] text-[#86868b] font-mono">
                      Linked with <span className="text-[#2997ff] font-semibold">@task/TASK-104</span>
                    </p>
                  </div>

                  <p className="text-[#86868b] text-[11.5px] leading-relaxed">
                    Governs low-latency bidirectional IPC over UNIX standard input/output pipes without network socket overhead.
                  </p>

                  <div className="rounded-xl bg-white/[0.04] p-2.5 font-mono text-[10.5px] border border-white/5 text-white space-y-0.5">
                    <div className="text-[#86868b]">// JSON-RPC stdio pipe handshake</div>
                    <div className="text-[#2997ff] truncate">{"{ \"jsonrpc\": \"2.0\", \"method\": \"initialize\", \"id\": 1 }"}</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="lg:col-span-5 space-y-3 order-1 lg:order-2">
              <div className="inline-flex items-center gap-2 text-[#2997ff] font-mono text-xs uppercase tracking-wider font-semibold">
                <FileText className="h-4 w-4" />
                <span>Feature 06 · Docs</span>
              </div>
              <h2 className="text-3xl sm:text-4xl font-bold tracking-[-0.035em] text-white">
                Living specs with zero hallucination.
              </h2>
              <p className="text-sm sm:text-base text-[#86868b] leading-relaxed">
                Markdown-native architecture specs, ADRs, and onboarding guides. Deterministic <code className="text-xs font-mono bg-white/10 px-1.5 py-0.5 rounded text-white">@task/&lt;id&gt;</code> and <code className="text-xs font-mono bg-white/10 px-1.5 py-0.5 rounded text-white">@doc/&lt;path&gt;</code> cross-references ensure zero-hallucination traversal.
              </p>
              <div className="space-y-2 pt-1 text-xs text-[#86868b]">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-3.5 w-3.5 text-[#2997ff] shrink-0" />
                  <span>Exact citation anchors for humans and AI agents</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-3.5 w-3.5 text-[#2997ff] shrink-0" />
                  <span>Pure Markdown files versioned directly in Git</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ===================================================================
            WORKBENCH INTERACTIVE DEMO (Apple Dark Glass Terminal)
            =================================================================== */}
        <section id="workbench-demo" className="scroll-mt-24 space-y-6 pt-4">
          <div className="grid grid-cols-1 gap-10 lg:grid-cols-12 lg:items-start">
            <div className="lg:col-span-5 space-y-4">
              <div className="space-y-2">
                <p className="font-mono text-xs uppercase tracking-wider text-[#2997ff] font-semibold">
                  Interactive Workbench
                </p>
                <h2 className="text-3xl sm:text-4xl font-bold tracking-[-0.035em] text-white">
                  The stdio JSON-RPC MCP bridge.
                </h2>
                <p className="text-sm sm:text-base text-[#86868b] leading-relaxed">
                  Agents connect via standard UNIX pipes (<code className="text-xs font-mono bg-white/10 px-1.5 py-0.5 rounded text-white">stdin/stdout</code>). Zero network roundtrips, atomic file parsing, and structured context packs.
                </p>
              </div>

              <div className="space-y-2.5 pt-1 text-xs text-[#86868b]">
                <div className="flex items-center gap-2.5">
                  <div className="p-1.5 rounded-lg bg-[#2997ff]/15 text-[#2997ff] shrink-0">
                    <Zap className="h-3.5 w-3.5" />
                  </div>
                  <span>Sub-millisecond local IPC over child process pipes</span>
                </div>
                <div className="flex items-center gap-2.5">
                  <div className="p-1.5 rounded-lg bg-[#2997ff]/15 text-[#2997ff] shrink-0">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  </div>
                  <span>Structured knowledge packs tailored to the active task</span>
                </div>
                <div className="flex items-center gap-2.5">
                  <div className="p-1.5 rounded-lg bg-[#2997ff]/15 text-[#2997ff] shrink-0">
                    <Layers className="h-3.5 w-3.5" />
                  </div>
                  <span>Bidirectional lifecycle updates without context pollution</span>
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3.5 space-y-1.5">
                <div className="text-xs font-medium text-white">Start the MCP server:</div>
                <div className="flex items-center justify-between rounded-xl bg-black/60 px-3.5 py-1.5 font-mono text-xs border border-white/10">
                  <span className="text-[#2997ff] font-medium">$ knowme mcp serve</span>
                  <span className="text-[10px] text-[#86868b]">stdio</span>
                </div>
              </div>
            </div>

            {/* Terminal Transcript */}
            <div className="lg:col-span-7">
              <div className="rounded-3xl apple-card overflow-hidden shadow-2xl">
                <div className="border-b border-white/10 bg-white/[0.03] p-3 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full bg-white/20" />
                    <span className="h-2.5 w-2.5 rounded-full bg-white/20" />
                    <span className="h-2.5 w-2.5 rounded-full bg-white/20" />
                    <span className="ml-2 font-mono text-xs font-medium text-white flex items-center gap-1.5">
                      <Terminal className="h-3.5 w-3.5 text-[#2997ff]" />
                      mcp-terminal
                    </span>
                  </div>

                  <div className="flex items-center rounded-full border border-white/15 bg-black/40 p-0.5 text-xs font-mono">
                    <button
                      type="button"
                      onClick={() => setDemoView("response")}
                      className={`px-3 py-1 rounded-full text-[10.5px] transition-all cursor-pointer ${
                        demoView === "response"
                          ? "bg-[#2997ff] text-white font-medium"
                          : "text-[#86868b] hover:text-white"
                      }`}
                    >
                      Output
                    </button>
                    <button
                      type="button"
                      onClick={() => setDemoView("request")}
                      className={`px-3 py-1 rounded-full text-[10.5px] transition-all cursor-pointer ${
                        demoView === "request"
                          ? "bg-[#2997ff] text-white font-medium"
                          : "text-[#86868b] hover:text-white"
                      }`}
                    >
                      Request
                    </button>
                  </div>
                </div>

                <div className="flex items-center overflow-x-auto border-b border-white/10 bg-black/40 px-3 py-2 gap-1.5 scrollbar-none">
                  {DEMO_TABS.map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setActiveTabId(tab.id)}
                      className={`font-mono text-xs px-3 py-1 rounded-full whitespace-nowrap cursor-pointer flex items-center gap-1.5 transition-all ${
                        activeTabId === tab.id
                          ? "bg-white/15 text-white font-semibold border border-white/20"
                          : "text-[#86868b] hover:text-white hover:bg-white/5 border border-transparent"
                      }`}
                    >
                      <span className={`h-1.5 w-1.5 rounded-full ${activeTabId === tab.id ? "bg-[#2997ff] animate-pulse-glow" : "bg-[#86868b]"}`} />
                      {tab.name}
                    </button>
                  ))}
                </div>

                <div className="p-4 sm:p-5 font-mono text-xs space-y-3 bg-[#060608]/90">
                  <div className="flex items-center justify-between pb-2 border-b border-white/10 text-[11px] text-[#86868b]">
                    <span className="truncate max-w-[80%]">{activeTab.description}</span>
                    <button
                      type="button"
                      onClick={() =>
                        copyToClipboard(
                          demoView === "response" ? activeTab.responsePayload : activeTab.requestPayload,
                          "payload"
                        )
                      }
                      className="p-1 rounded-md hover:bg-white/10 text-[#86868b] hover:text-white transition-colors cursor-pointer"
                      title="Copy JSON"
                    >
                      {copiedPayload ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                    </button>
                  </div>

                  <div className="flex items-center gap-2 text-white font-medium bg-white/[0.03] px-3 py-2 rounded-xl border border-white/10">
                    <span className="text-[#2997ff] font-bold">agent&gt;</span>
                    <span className="text-white truncate">{activeTab.toolCall}</span>
                    <span className="text-[#2997ff] animate-cursor-blink font-bold">_</span>
                  </div>

                  <div className="relative rounded-2xl border border-white/10 bg-black/60 p-3.5 overflow-x-auto max-h-[300px]">
                    <pre className="text-[11px] font-mono leading-relaxed text-[#f5f5f7]">
                      {demoView === "response" ? activeTab.responsePayload : activeTab.requestPayload}
                    </pre>
                  </div>

                  <div className="flex flex-wrap items-center justify-between pt-1 text-[11px] text-[#86868b] font-mono">
                    <div className="flex items-center gap-4">
                      <span>Latency: <strong className="text-emerald-400 font-semibold">{activeTab.stats.time}</strong></span>
                      <span>Tokens: <strong className="text-white">{activeTab.stats.tokens}</strong></span>
                    </div>
                    <span>Source: <strong className="text-white">{activeTab.stats.source}</strong></span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ===================================================================
            FAQ ACCORDION SECTION (Apple Pro Design)
            =================================================================== */}
        <section id="faq-section" className="scroll-mt-24 space-y-6 max-w-4xl mx-auto pt-4">
          <div className="text-center space-y-1.5">
            <p className="font-mono text-xs uppercase tracking-wider text-[#2997ff] font-semibold">
              FAQ
            </p>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-[-0.035em] text-white">
              Frequently Asked Questions
            </h2>
          </div>

          <div className="rounded-3xl apple-card p-6 sm:p-8">
            <Accordion type="single" collapsible defaultValue="item-1" className="w-full">
              <AccordionItem value="item-1">
                <AccordionTrigger className="text-base sm:text-lg font-semibold text-white hover:text-[#2997ff]">
                  How does KnowMe protect my project's data privacy?
                </AccordionTrigger>
                <AccordionContent>
                  KnowMe is 100% local-first. Tasks, memos, docs, and reading lists live in plain Markdown and JSON files in your repository's <code className="font-mono text-xs bg-white/10 px-1.5 py-0.5 rounded text-white">.know-me/</code> folder. There is no cloud database, tracking cookies, or telemetry. Agent MCP communication runs entirely over local child process stdio pipes.
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="item-2">
                <AccordionTrigger className="text-base sm:text-lg font-semibold text-white hover:text-[#2997ff]">
                  How does the Model Context Protocol (MCP) integration work?
                </AccordionTrigger>
                <AccordionContent>
                  KnowMe exposes an MCP server speaking JSON-RPC 2.0 over standard I/O (<code className="font-mono text-xs bg-white/10 px-1.5 py-0.5 rounded text-white">stdio</code>). Coding agents (Claude Code, Cursor, Codex, Hermes) spawn the KnowMe CLI as a child process, query tools like <code className="font-mono text-xs bg-white/10 px-1.5 py-0.5 rounded text-white">knowme_retrieve</code>, and receive verified context without network overhead.
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="item-3">
                <AccordionTrigger className="text-base sm:text-lg font-semibold text-white hover:text-[#2997ff]">
                  How is KnowMe different from Notion or Obsidian?
                </AccordionTrigger>
                <AccordionContent>
                  Unlike Notion, KnowMe doesn't lock your data in a proprietary cloud database with monthly fees. Unlike Obsidian, KnowMe is purpose-built for engineering workflows and coding agents: granular task lifecycles, acceptance checklists, Kanban boards, deterministic cross-references (<code className="font-mono text-xs bg-white/10 px-1.5 py-0.5 rounded text-white">@task/&lt;id&gt;</code>), and isolated Git worktree execution.
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="item-4">
                <AccordionTrigger className="text-base sm:text-lg font-semibold text-white hover:text-[#2997ff]">
                  Which platforms and coding agents are supported?
                </AccordionTrigger>
                <AccordionContent>
                  Runs on macOS (Apple Silicon & Intel), Linux (x86_64 & aarch64), and Windows WSL2. Compatible out of the box with Claude Code, Cursor IDE, Codex CLI, Hermes Agent, OpenCode, and any client implementing the MCP specification.
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="item-5">
                <AccordionTrigger className="text-base sm:text-lg font-semibold text-white hover:text-[#2997ff]">
                  Does KnowMe require a background server daemon?
                </AccordionTrigger>
                <AccordionContent>
                  No. CLI and MCP commands execute directly against local files on disk. The web interface starts an ephemeral local server on localhost only when you choose to open it.
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </div>
        </section>

        {/* ===================================================================
            COLOPHON / FOOTER (Apple Keynote Style)
            =================================================================== */}
        <footer className="border-t border-white/10 pt-12 pb-16 space-y-8">
          <div className="grid grid-cols-1 gap-8 md:grid-cols-4 lg:grid-cols-5">
            <div className="md:col-span-2 space-y-3">
              <div className="flex items-center gap-2.5">
                <img
                  src="/logo.png"
                  alt="KnowMe"
                  className="h-7 w-7 rounded-lg border border-white/20 object-cover"
                />
                <span className="font-semibold tracking-tight text-white text-base">
                  KnowMe
                </span>
                <Badge variant="secondary" className="font-mono text-[9.5px] px-2 py-0.5 bg-white/10 text-white rounded-full">
                  v1.12 Pro
                </Badge>
              </div>
              <p className="text-xs sm:text-sm text-[#86868b] leading-relaxed max-w-sm">
                Your personal knowledge database for human developers and AI coding agents. Local-first, git-native, zero telemetry.
              </p>
              <div className="text-[11px] font-mono text-[#86868b]">
                MIT License. Free to fork and self-host.
              </div>
            </div>

            <div className="space-y-2 text-xs">
              <div className="font-mono font-semibold uppercase tracking-wider text-white text-[10.5px]">
                Features
              </div>
              <ul className="space-y-1.5 text-[#86868b]">
                {[
                  { label: "Duo Architecture", id: "duo-showcase" },
                  { label: "Neural Memory Graph", id: "memory-graph" },
                  { label: "Projects", id: "features-projects" },
                  { label: "Tasks", id: "features-tasks" },
                  { label: "Kanban", id: "features-kanban" },
                  { label: "Saved Links", id: "features-links" },
                  { label: "Memos", id: "features-memos" },
                  { label: "Docs", id: "features-docs" },
                ].map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => scrollToSection(item.id)}
                      className="hover:text-white transition-colors cursor-pointer"
                    >
                      {item.label}
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            <div className="space-y-2 text-xs">
              <div className="font-mono font-semibold uppercase tracking-wider text-white text-[10.5px]">
                Developers
              </div>
              <ul className="space-y-1.5 text-[#86868b]">
                <li>
                  <a
                    href="https://github.com/knowns/know-me"
                    target="_blank"
                    rel="noreferrer"
                    className="hover:text-white transition-colors inline-flex items-center gap-1"
                  >
                    <span>GitHub</span>
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </li>
                <li>
                  <a
                    href="https://modelcontextprotocol.io"
                    target="_blank"
                    rel="noreferrer"
                    className="hover:text-white transition-colors inline-flex items-center gap-1"
                  >
                    <span>MCP Spec</span>
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </li>
                <li>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(installCommand, "install")}
                    className="hover:text-white transition-colors inline-flex items-center gap-1 cursor-pointer active:scale-[0.97]"
                  >
                    <span>Install Script</span>
                    <Copy className="h-3 w-3" />
                  </button>
                </li>
              </ul>
            </div>

            <div className="space-y-2 text-xs">
              <div className="font-mono font-semibold uppercase tracking-wider text-white text-[10.5px]">
                Status
              </div>
              <div className="space-y-1.5 font-mono text-[10.5px] text-[#86868b]">
                <div className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse-glow" />
                  <span className="text-white">Local Engine: Active</span>
                </div>
                <div>Storage: .know-me/ disk</div>
                <div>Protocol: MCP JSON-RPC</div>
              </div>
            </div>
          </div>

          <div className="border-t border-white/10 pt-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-[#86868b]">
            <div>© 2026 KnowMe Authors. Open source under MIT.</div>
            <div>
              <a
                href="http://localhost:6421"
                target="_blank"
                rel="noreferrer"
                className="hover:text-white transition-colors cursor-pointer font-medium text-[#2997ff] active:scale-[0.97]"
              >
                Go to Workspace →
              </a>
            </div>
          </div>
        </footer>
      </main>
    </div>
  );
}

export default LandingPage;
