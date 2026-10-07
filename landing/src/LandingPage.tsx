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
    return false;
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
    <div className="relative min-h-screen w-full bg-background text-foreground selection:bg-accent selection:text-accent-foreground">
      {/* Top Background subtle gradient grid */}
      <div
        className="pointer-events-none absolute inset-0 -z-10 opacity-30 dark:opacity-20"
        style={{
          backgroundImage: `radial-gradient(circle at 50% 0%, var(--primary) 0%, transparent 45%)`,
          maskImage: "radial-gradient(circle at 50% 30%, black, transparent 80%)",
        }}
      />

      {/* ===================================================================
          1. NAVIGATION BAR
          =================================================================== */}
      <header className="sticky top-0 z-40 w-full border-b border-border/70 bg-background/85 backdrop-blur-md transition-colors duration-160 ease-[var(--ease-out)]">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          {/* Logo & Brand */}
          <div className="flex items-center gap-3">
            <a
              href="/"
              className="flex items-center gap-2.5 text-left group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md active:scale-[0.98] transition-transform duration-160 ease-[var(--ease-out)]"
            >
              <img
                src="/logo.png"
                alt="KnowMe Logo"
                className="h-8 w-8 rounded-lg border border-border/80 object-cover shadow-2xs transition-transform duration-160 ease-[var(--ease-out)] group-hover:scale-105"
              />
              <div className="flex flex-col">
                <span className="font-semibold tracking-tight text-foreground text-sm">
                  KnowMe
                </span>
                <span className="text-[10px] text-muted-foreground font-mono leading-none">
                  local-first memory
                </span>
              </div>
            </a>
          </div>

          {/* Nav Links */}
          <nav className="flex items-center gap-1.5 sm:gap-2">
            <div className="hidden lg:flex items-center gap-0.5 text-xs text-muted-foreground font-medium">
              {[
                { label: "Projects", id: "features-projects" },
                { label: "Tasks", id: "features-tasks" },
                { label: "Kanban", id: "features-kanban" },
                { label: "Links", id: "features-links" },
                { label: "Memos", id: "features-memos" },
                { label: "Docs", id: "features-docs" },
              ].map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => scrollToSection(item.id)}
                  className="px-2 py-1 rounded hover:text-foreground hover:bg-muted/60 transition-[background-color,color,transform] duration-160 ease-[var(--ease-out)] active:scale-[0.97] cursor-pointer"
                >
                  {item.label}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => scrollToSection("workbench-demo")}
              className="hidden sm:inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground px-2 py-1.5 rounded-md hover:bg-muted/60 transition-[background-color,color,transform] duration-160 ease-[var(--ease-out)] active:scale-[0.97] cursor-pointer"
            >
              <Terminal className="h-3.5 w-3.5 text-primary" />
              <span>MCP Bridge</span>
            </button>

            <a
              href="https://github.com/knowns/know-me"
              target="_blank"
              rel="noreferrer"
              className="hidden sm:inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground px-2 py-1.5 rounded-md hover:bg-muted/60 transition-[background-color,color,transform] duration-160 ease-[var(--ease-out)] active:scale-[0.97]"
            >
              <GitBranch className="h-3.5 w-3.5" />
              <span>GitHub</span>
            </a>

            {/* Theme Toggle */}
            <ThemeToggle
              isDark={isDark}
              onToggle={toggleTheme}
              size="sm"
              className="text-muted-foreground hover:text-foreground active:scale-[0.97] transition-transform duration-160 ease-[var(--ease-out)] cursor-pointer"
            />

            {/* Launch Workspace CTA */}
            <a href="http://localhost:6421" target="_blank" rel="noreferrer">
              <Button
                size="sm"
                className="gap-1.5 shadow-2xs font-medium cursor-pointer"
              >
                <span>Launch Workspace</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </a>
          </nav>
        </div>
      </header>

      {/* Main Container */}
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 space-y-16 sm:space-y-24">
        {/* ===================================================================
            2. HERO SECTION
            =================================================================== */}
        <section className="pt-2 sm:pt-6 md:pt-10 animate-fade-in-up">
          <div className="grid grid-cols-1 gap-10 lg:grid-cols-12 lg:items-center">
            {/* Left Column: Distilled Copy & Actions */}
            <div className="lg:col-span-6 space-y-5">
              <div className="inline-flex items-center gap-2">
                <Badge
                  variant="outline"
                  className="rounded-full border-primary/30 bg-primary/5 px-3 py-1 text-xs text-primary font-normal gap-1.5 tracking-tight"
                >
                  <Sparkles className="h-3.5 w-3.5 text-primary animate-pulse-glow" />
                  Local-first memory for AI-native software development
                </Badge>
              </div>

              <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl lg:text-6xl text-foreground text-balance leading-[1.08]">
                Your personal knowledge database.
              </h1>

              <p className="text-base sm:text-lg text-muted-foreground leading-relaxed max-w-xl font-normal text-pretty">
                Projects, tasks, docs, memos, and reading lists in one calm place. AI coding agents plug in via MCP to read and work with everything you know — zero re-explaining.
              </p>

              <div className="space-y-3 pt-1">
                <div className="flex flex-wrap items-center gap-3">
                  <a href="http://localhost:6421" target="_blank" rel="noreferrer">
                    <Button size="lg" className="gap-2 font-medium cursor-pointer shadow-xs">
                      <span>Open Workspace</span>
                      <ArrowRight className="h-4 w-4" />
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
                      className="gap-2 cursor-pointer font-medium hover:border-primary/40"
                    >
                      <GitBranch className="h-4 w-4 text-muted-foreground" />
                      <span>Star on GitHub</span>
                    </Button>
                  </a>
                </div>

                {/* Quick Install Command Box */}
                <div className="flex items-center justify-between gap-3 rounded-lg border border-border/90 bg-muted/40 px-3.5 py-2.5 font-mono text-xs sm:text-sm text-foreground max-w-lg shadow-2xs group hover:border-primary/40 transition-colors duration-160 ease-[var(--ease-out)]">
                  <div className="flex items-center gap-2 overflow-x-auto select-all">
                    <span className="text-muted-foreground select-none">$</span>
                    <span className="font-mono text-foreground font-medium truncate">
                      {installCommand}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(installCommand, "install")}
                    aria-label="Copy install command"
                    className="shrink-0 p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-background/80 active:scale-[0.95] transition-[transform,background-color,color] duration-160 ease-[var(--ease-out)] cursor-pointer"
                  >
                    {copiedInstall ? (
                      <Check className="h-4 w-4 text-primary" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </button>
                </div>
                <p className="text-[11px] text-muted-foreground flex items-center gap-1.5 font-mono">
                  <ShieldCheck className="h-3.5 w-3.5 text-primary" />
                  <span>Standalone POSIX binary · macOS, Linux & WSL · Zero cloud dependency</span>
                </p>
              </div>
            </div>

            {/* Right Column: Visual Mock (.know-me/ local disk + AI agent MCP session) */}
            <div className="lg:col-span-6">
              <div className="rounded-xl border border-border/90 bg-card p-1 shadow-md card-hover">
                <div className="flex items-center justify-between border-b border-border/80 px-4 py-2 bg-muted/30 rounded-t-lg">
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full bg-destructive/60" />
                    <span className="h-2.5 w-2.5 rounded-full bg-warning/60" />
                    <span className="h-2.5 w-2.5 rounded-full bg-success/60" />
                    <span className="ml-2 font-mono text-xs text-muted-foreground">
                      knowme-workspace :: mcp-stdio
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse-glow" />
                    <span className="font-mono text-[11px] text-primary font-medium">connected</span>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-12 divide-y md:divide-y-0 md:divide-x divide-border/80 bg-background/50 font-mono text-xs">
                  {/* Left: Local Filesystem */}
                  <div className="md:col-span-5 p-3 space-y-2.5 bg-muted/15">
                    <div className="flex items-center justify-between text-muted-foreground text-[10.5px] font-semibold uppercase tracking-wider">
                      <span className="flex items-center gap-1 text-foreground">
                        <FolderTree className="h-3.5 w-3.5 text-primary" />
                        .know-me/
                      </span>
                      <span className="text-[9.5px] text-muted-foreground font-mono">git-native</span>
                    </div>

                    <div className="space-y-1 text-[11px]">
                      <div className="flex items-center gap-1.5 text-foreground font-medium">
                        <FileText className="h-3.5 w-3.5 text-primary" />
                        <span>config.json</span>
                      </div>
                      <div className="pl-3 space-y-1">
                        <div className="flex items-center justify-between bg-primary/10 text-primary px-1.5 py-0.5 rounded text-[10px] font-medium">
                          <span className="truncate">tasks/TASK-104.md</span>
                          <span className="text-[9px] font-mono font-bold">ACTIVE</span>
                        </div>
                        <div className="flex items-center justify-between px-1.5 py-0.5 text-muted-foreground text-[10px]">
                          <span className="truncate">tasks/TASK-103.md</span>
                          <span className="text-[9px]">DONE</span>
                        </div>
                        <div className="flex items-center justify-between px-1.5 py-0.5 text-muted-foreground text-[10px]">
                          <span className="truncate">docs/mcp-bridge.md</span>
                          <span className="text-[9px]">DOC</span>
                        </div>
                        <div className="flex items-center justify-between px-1.5 py-0.5 text-muted-foreground text-[10px]">
                          <span className="truncate">memos/2026-w41.md</span>
                          <span className="text-[9px]">MEMO</span>
                        </div>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-border/60 text-[9.5px] text-muted-foreground flex justify-between">
                      <span>Cloud lock-in:</span>
                      <span className="text-primary font-semibold">Zero (0)</span>
                    </div>
                  </div>

                  {/* Right: AI Agent Session */}
                  <div className="md:col-span-7 p-3 space-y-2.5 bg-card/60">
                    <div className="flex items-center justify-between text-[11px]">
                      <div className="flex items-center gap-1.5 text-foreground font-semibold">
                        <Bot className="h-3.5 w-3.5 text-primary" />
                        <span>Claude / Cursor / Codex</span>
                      </div>
                      <Badge variant="secondary" className="text-[9.5px] py-0 px-1.5">
                        stdio JSON-RPC
                      </Badge>
                    </div>

                    <div className="rounded-md border border-border/80 bg-background/80 p-2.5 space-y-1.5 text-[11px]">
                      <div className="flex items-center gap-1.5 text-primary font-medium text-[10.5px]">
                        <Zap className="h-3 w-3" />
                        <span>knowme_retrieve("TASK-104")</span>
                      </div>
                      <div className="rounded bg-muted/60 p-2 font-mono text-[9.5px] space-y-0.5 border border-border/50 text-foreground">
                        <div className="text-primary flex items-center gap-1">
                          <CheckCircle2 className="h-2.5 w-2.5" />
                          <span>Pipes configured (8ms latency)</span>
                        </div>
                        <div className="text-primary flex items-center gap-1">
                          <CheckCircle2 className="h-2.5 w-2.5" />
                          <span>Acceptance criteria loaded</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-[9.5px] text-muted-foreground px-0.5 font-mono">
                      <span className="flex items-center gap-1">
                        <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                        Writing implementation
                      </span>
                      <span>0 re-explanations</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ===================================================================
            3. BENTO GRID OVERVIEW (6 Irregular Tiles with Stagger)
            =================================================================== */}
        <section className="space-y-5">
          <div className="space-y-1 max-w-2xl">
            <p className="font-mono text-xs uppercase tracking-wider text-primary font-semibold">
              Architecture Overview
            </p>
            <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-foreground">
              Built for developer focus and agent collaboration.
            </h2>
          </div>

          <div className="grid grid-cols-1 gap-3.5 md:grid-cols-3 md:grid-rows-[auto_auto_auto]">
            {/* Tile 1: Lead Tile */}
            <article className="md:col-span-2 md:row-span-2 rounded-xl border border-border/90 bg-card p-6 sm:p-7 flex flex-col justify-between shadow-2xs card-hover animate-fade-in-up">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Badge variant="outline" className="text-xs font-mono text-primary border-primary/30">
                    Lead Feature · Core Protocol
                  </Badge>
                  <span className="font-mono text-xs text-muted-foreground">stdio JSON-RPC</span>
                </div>

                <h3 className="text-2xl sm:text-3xl font-semibold tracking-tight text-foreground text-balance">
                  Stop re-explaining your project to AI coding agents.
                </h3>

                <p className="text-sm text-muted-foreground leading-relaxed max-w-xl font-normal">
                  Coding agents lose context every new thread. KnowMe bridges Claude Code, Cursor, Codex, Hermes, and OpenCode straight into your tasks and architectural decisions via stdio pipes.
                </p>
              </div>

              <div className="mt-6 pt-5 border-t border-border/70 space-y-3">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[
                    { name: "Claude Code", status: "MCP stdio", icon: Bot },
                    { name: "Cursor IDE", status: "Direct bridge", icon: Code2 },
                    { name: "Hermes & OMP", status: "Auto-detect", icon: Cpu },
                    { name: "Codex CLI", status: "Native tools", icon: Terminal },
                  ].map((agent, i) => (
                    <div
                      key={agent.name}
                      className={`rounded-lg border border-border/80 bg-muted/30 p-2 text-center space-y-0.5 hover:border-primary/40 active:scale-[0.98] transition-[border-color,transform] duration-160 ease-[var(--ease-out)] stagger-${i + 1}`}
                    >
                      <agent.icon className="h-3.5 w-3.5 text-primary mx-auto" />
                      <div className="text-xs font-medium text-foreground">{agent.name}</div>
                      <div className="text-[9.5px] font-mono text-muted-foreground">{agent.status}</div>
                    </div>
                  ))}
                </div>
              </div>
            </article>

            {/* Tile 2 */}
            <article className="rounded-xl border border-border/90 bg-card p-5 flex flex-col justify-between shadow-2xs card-hover animate-fade-in-up stagger-1">
              <div className="space-y-2">
                <div className="flex items-center gap-1.5 text-primary">
                  <GitBranch className="h-4 w-4" />
                  <span className="font-mono text-xs uppercase tracking-wider font-semibold">Local-First</span>
                </div>
                <h3 className="text-lg font-semibold tracking-tight text-foreground">Git-Native Storage</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Plain Markdown and JSON on disk. Commit tasks and architecture docs right alongside your code commits.
                </p>
              </div>
              <div className="mt-3 pt-2.5 border-t border-border/60 text-[10.5px] font-mono text-muted-foreground flex justify-between">
                <span>Storage:</span>
                <span className="text-foreground font-medium">POSIX files</span>
              </div>
            </article>

            {/* Tile 3 */}
            <article className="rounded-xl border border-border/90 bg-card p-5 flex flex-col justify-between shadow-2xs card-hover animate-fade-in-up stagger-2">
              <div className="space-y-2">
                <div className="flex items-center gap-1.5 text-primary">
                  <Kanban className="h-4 w-4" />
                  <span className="font-mono text-xs uppercase tracking-wider font-semibold">Calm UI</span>
                </div>
                <h3 className="text-lg font-semibold tracking-tight text-foreground">Distraction-Free</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Fluid Kanban board, hashtagged memos, and reading lists. High information density without fatigue.
                </p>
              </div>
              <div className="mt-3 pt-2.5 border-t border-border/60 flex gap-1 font-mono text-[9.5px] text-muted-foreground">
                <span className="px-1.5 py-0.5 rounded bg-muted">#mcp</span>
                <span className="px-1.5 py-0.5 rounded bg-muted">#perf</span>
                <span className="px-1.5 py-0.5 rounded bg-muted">#rfc</span>
              </div>
            </article>

            {/* Tile 4 */}
            <article className="md:col-span-2 rounded-xl border border-border/90 bg-card p-5 sm:p-6 flex flex-col justify-between shadow-2xs card-hover animate-fade-in-up stagger-3">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-primary">
                    <Search className="h-4 w-4" />
                    <span className="font-mono text-xs uppercase tracking-wider font-semibold">Retrieval</span>
                  </div>
                  <span className="font-mono text-[11px] text-muted-foreground">BM25 + ONNX</span>
                </div>
                <h3 className="text-lg font-semibold tracking-tight text-foreground">
                  Deterministic References & Hybrid Retrieval
                </h3>
                <p className="text-xs text-muted-foreground leading-relaxed max-w-xl">
                  Link work with deterministic <code className="text-[10.5px] bg-muted px-1 py-0.5 rounded font-mono text-primary font-semibold">@task/&lt;id&gt;</code> and <code className="text-[10.5px] bg-muted px-1 py-0.5 rounded font-mono text-primary font-semibold">@doc/&lt;path&gt;</code> anchors. Sub-15ms local search combines exact keywords with CPU embeddings.
                </p>
              </div>
              <div className="mt-4 pt-2.5 border-t border-border/60 text-[10.5px] font-mono text-muted-foreground flex justify-between">
                <span>Latency: &lt;15ms</span>
                <span>External vector DB: None</span>
              </div>
            </article>

            {/* Tile 5 */}
            <article className="rounded-xl border border-border/90 bg-card p-5 flex flex-col justify-between shadow-2xs card-hover animate-fade-in-up stagger-4">
              <div className="space-y-2">
                <div className="flex items-center gap-1.5 text-primary">
                  <Cpu className="h-4 w-4" />
                  <span className="font-mono text-xs uppercase tracking-wider font-semibold">Runner</span>
                </div>
                <h3 className="text-lg font-semibold tracking-tight text-foreground">Isolated Worktrees</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Integrated OMP runner runs agents inside disposable Git worktrees with milestone review gates.
                </p>
              </div>
              <div className="mt-3 pt-2.5 border-t border-border/60 text-[10.5px] font-mono text-primary font-medium flex justify-between">
                <span>Isolation:</span>
                <span>100% Safe</span>
              </div>
            </article>

            {/* Tile 6 */}
            <article className="md:col-span-3 rounded-xl border border-border/90 bg-muted/20 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs card-hover">
              <div className="space-y-1">
                <div className="flex items-center gap-1.5 text-primary">
                  <Lock className="h-4 w-4" />
                  <span className="font-mono text-xs uppercase tracking-wider font-semibold">Data Sovereignty</span>
                </div>
                <h3 className="text-base font-semibold tracking-tight text-foreground">
                  Zero Telemetry & Private by Default
                </h3>
                <p className="text-xs text-muted-foreground max-w-2xl">
                  Code, blueprints, and prompts stay on your machine. No cloud telemetry, no remote databases.
                </p>
              </div>
              <Badge variant="outline" className="font-mono text-xs bg-background shrink-0">
                100% Offline Capable
              </Badge>
            </article>
          </div>
        </section>

        {/* ===================================================================
            CORE FEATURE 1: PROJECTS
            =================================================================== */}
        <section id="features-projects" className="scroll-mt-20 space-y-5 pt-1">
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-12 lg:items-center">
            <div className="lg:col-span-5 space-y-3">
              <div className="inline-flex items-center gap-2 text-primary font-mono text-xs uppercase tracking-wider font-semibold">
                <FolderGit2 className="h-4 w-4" />
                <span>Feature 01 · Projects</span>
              </div>
              <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-foreground">
                Centralized home per repository.
              </h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Dedicated workspace home per codebase. Switch between client projects, libraries, and microservices without context loss or window sprawl.
              </p>
              <div className="space-y-2 pt-1 text-xs text-muted-foreground">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-3.5 w-3.5 text-primary shrink-0" />
                  <span>Instant workspace switching with zero reload lag</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-3.5 w-3.5 text-primary shrink-0" />
                  <span>Binds tasks, docs, and git worktrees under one roof</span>
                </div>
              </div>
            </div>

            <div className="lg:col-span-7">
              <div className="rounded-xl border border-border/90 bg-card p-4 sm:p-5 shadow-2xs card-hover space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-border/70 text-xs">
                  <span className="font-medium text-foreground flex items-center gap-1.5">
                    <FolderGit2 className="h-3.5 w-3.5 text-primary" />
                    Workspace Switcher
                  </span>
                  <Badge variant="outline" className="text-[10px] font-mono">4 Local Repos</Badge>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {[
                    { name: "know-me/core", path: "~/code/know-me", active: true, meta: "24 tasks · 18 docs", branch: "main" },
                    { name: "api-gateway", path: "~/code/api-gateway", active: false, meta: "12 tasks · 6 docs", branch: "feat/grpc" },
                    { name: "mobile-sdk", path: "~/code/mobile-sdk", active: false, meta: "9 tasks · 14 docs", branch: "v2.1-dev" },
                    { name: "infra-config", path: "~/code/infra", active: false, meta: "17 tasks · 29 docs", branch: "staging" },
                  ].map((p, i) => (
                    <div
                      key={p.name}
                      className={`p-2.5 rounded-lg border transition-[border-color,background-color,transform] duration-160 ease-[var(--ease-out)] active:scale-[0.98] stagger-${i + 1} ${
                        p.active
                          ? "border-primary/60 bg-primary/5 shadow-2xs"
                          : "border-border/70 bg-muted/20 hover:bg-muted/40"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-semibold text-xs text-foreground truncate">{p.name}</span>
                        {p.active ? (
                          <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-primary text-primary-foreground font-semibold">ACTIVE</span>
                        ) : (
                          <span className="text-[9px] font-mono text-muted-foreground">SWITCH</span>
                        )}
                      </div>
                      <div className="text-[10.5px] font-mono text-muted-foreground truncate mb-1.5">{p.path}</div>
                      <div className="flex items-center justify-between text-[9.5px] font-mono text-muted-foreground pt-1 border-t border-border/50">
                        <span>{p.meta}</span>
                        <span className="text-foreground">{p.branch}</span>
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
        <section id="features-tasks" className="scroll-mt-20 space-y-5 pt-1">
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-12 lg:items-center">
            <div className="lg:col-span-7 order-2 lg:order-1">
              <div className="rounded-xl border border-border/90 bg-card p-4 sm:p-5 shadow-2xs card-hover space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/70 pb-2.5">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold text-primary px-2 py-0.5 rounded bg-primary/10">TASK-104</span>
                    <span className="font-semibold text-xs sm:text-sm text-foreground">Implement MCP Stdio Bridge</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Badge variant="outline" className="border-amber-500/40 text-amber-500 text-[9.5px] font-mono font-semibold">HIGH</Badge>
                    <Badge variant="secondary" className="text-[9.5px] font-mono">IN PROGRESS</Badge>
                  </div>
                </div>

                <div className="space-y-1.5 text-xs">
                  <div className="flex items-center justify-between font-medium text-foreground text-[11px]">
                    <span className="flex items-center gap-1 text-primary">
                      <CheckSquare className="h-3.5 w-3.5" />
                      Acceptance Criteria (Click to test toggle)
                    </span>
                    <span className="font-mono text-[10.5px] text-muted-foreground">
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
                      className="w-full flex items-center gap-2 p-2 rounded-md border border-border/60 hover:bg-muted/40 active:scale-[0.98] transition-[background-color,border-color,transform] duration-160 ease-[var(--ease-out)] text-left cursor-pointer"
                    >
                      <span className={`h-3.5 w-3.5 rounded flex items-center justify-center shrink-0 border transition-colors duration-160 ease-[var(--ease-out)] ${
                        taskCheckedItems[idx]
                          ? "bg-primary border-primary text-primary-foreground"
                          : "border-muted-foreground/40 bg-background"
                      }`}>
                        {taskCheckedItems[idx] && <Check className="h-2.5 w-2.5" />}
                      </span>
                      <span className={`text-[11px] truncate transition-colors duration-160 ease-[var(--ease-out)] ${taskCheckedItems[idx] ? "line-through text-muted-foreground" : "text-foreground"}`}>
                        {crit}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="lg:col-span-5 space-y-3 order-1 lg:order-2">
              <div className="inline-flex items-center gap-2 text-primary font-mono text-xs uppercase tracking-wider font-semibold">
                <CheckSquare className="h-4 w-4" />
                <span>Feature 02 · Tasks</span>
              </div>
              <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-foreground">
                Engineering contracts with clear criteria.
              </h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Tasks with full lifecycle states (<code className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded">todo</code>, <code className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded">in-progress</code>, <code className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded">review-ready</code>, <code className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded">done</code>), checklist acceptance criteria, and git worktree links.
              </p>
              <div className="space-y-2 pt-1 text-xs text-muted-foreground">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-3.5 w-3.5 text-primary shrink-0" />
                  <span>Interactive checklists AI agents read and check off</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-3.5 w-3.5 text-primary shrink-0" />
                  <span>State transitions logged directly inside markdown</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ===================================================================
            CORE FEATURE 3: KANBAN
            =================================================================== */}
        <section id="features-kanban" className="scroll-mt-20 space-y-5 pt-1">
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-12 lg:items-center">
            <div className="lg:col-span-5 space-y-3">
              <div className="inline-flex items-center gap-2 text-primary font-mono text-xs uppercase tracking-wider font-semibold">
                <Kanban className="h-4 w-4" />
                <span>Feature 03 · Kanban</span>
              </div>
              <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-foreground">
                Calm, high-density stage visibility.
              </h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Responsive visual board view for instant WIP tracking. Monitor background subagents moving tasks through milestone review gates in real-time.
              </p>
              <div className="space-y-2 pt-1 text-xs text-muted-foreground">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-3.5 w-3.5 text-primary shrink-0" />
                  <span>Clear stage columns from Backlog to Done</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-3.5 w-3.5 text-primary shrink-0" />
                  <span>Fast keyboard filtering by hashtag, priority, or assignee</span>
                </div>
              </div>
            </div>

            <div className="lg:col-span-7">
              <div className="rounded-xl border border-border/90 bg-card p-4 sm:p-5 shadow-2xs card-hover space-y-2.5">
                <div className="flex items-center justify-between pb-2 border-b border-border/70 text-xs">
                  <span className="font-semibold text-foreground flex items-center gap-1.5">
                    <Kanban className="h-3.5 w-3.5 text-primary" />
                    Sprint Board
                  </span>
                  <span className="font-mono text-muted-foreground text-[10.5px]">8 active items · 0 blocked</span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {/* Backlog */}
                  <div className="rounded-lg bg-muted/30 p-2 border border-border/60 space-y-1.5">
                    <div className="flex items-center justify-between text-[10.5px] font-mono font-semibold text-muted-foreground pb-1 border-b border-border/40">
                      <span>BACKLOG</span>
                      <span className="px-1.5 py-0.2 rounded bg-muted text-[9.5px]">2</span>
                    </div>
                    <div className="p-1.5 rounded bg-background border border-border/70 shadow-2xs text-[10.5px] active:scale-[0.98] transition-transform duration-160 ease-[var(--ease-out)]">
                      <div className="font-medium text-foreground truncate">SQLite indexing</div>
                      <div className="text-[9.5px] font-mono text-muted-foreground">#perf · T-108</div>
                    </div>
                    <div className="p-1.5 rounded bg-background border border-border/70 shadow-2xs text-[10.5px] active:scale-[0.98] transition-transform duration-160 ease-[var(--ease-out)]">
                      <div className="font-medium text-foreground truncate">Markdown export</div>
                      <div className="text-[9.5px] font-mono text-muted-foreground">#export · T-112</div>
                    </div>
                  </div>

                  {/* In Progress */}
                  <div className="rounded-lg bg-muted/30 p-2 border border-border/60 space-y-1.5">
                    <div className="flex items-center justify-between text-[10.5px] font-mono font-semibold text-primary pb-1 border-b border-border/40">
                      <span>PROGRESS</span>
                      <span className="px-1.5 py-0.2 rounded bg-primary/10 text-primary text-[9.5px]">1</span>
                    </div>
                    <div className="p-1.5 rounded bg-background border border-primary/40 shadow-2xs text-[10.5px] space-y-1 active:scale-[0.98] transition-transform duration-160 ease-[var(--ease-out)]">
                      <div className="font-medium text-foreground truncate">MCP Stdio Bridge</div>
                      <div className="text-[9.5px] font-mono text-primary font-semibold">T-104 (75%)</div>
                      <div className="h-1 w-full bg-muted rounded-full overflow-hidden">
                        <div className="h-full bg-primary w-3/4" />
                      </div>
                    </div>
                  </div>

                  {/* Review */}
                  <div className="rounded-lg bg-muted/30 p-2 border border-border/60 space-y-1.5">
                    <div className="flex items-center justify-between text-[10.5px] font-mono font-semibold text-amber-500 pb-1 border-b border-border/40">
                      <span>REVIEW</span>
                      <span className="px-1.5 py-0.2 rounded bg-amber-500/10 text-amber-500 text-[9.5px]">1</span>
                    </div>
                    <div className="p-1.5 rounded bg-background border border-border/70 shadow-2xs text-[10.5px] active:scale-[0.98] transition-transform duration-160 ease-[var(--ease-out)]">
                      <div className="font-medium text-foreground truncate">ONNX Embeddings</div>
                      <div className="text-[9.5px] font-mono text-muted-foreground">#ai · T-101</div>
                    </div>
                  </div>

                  {/* Done */}
                  <div className="rounded-lg bg-muted/30 p-2 border border-border/60 space-y-1.5">
                    <div className="flex items-center justify-between text-[10.5px] font-mono font-semibold text-emerald-500 pb-1 border-b border-border/40">
                      <span>DONE</span>
                      <span className="px-1.5 py-0.2 rounded bg-emerald-500/10 text-emerald-500 text-[9.5px]">4</span>
                    </div>
                    <div className="p-1.5 rounded bg-background/60 border border-border/50 text-[10px] text-muted-foreground line-through truncate">
                      Theme tokens (T-098)
                    </div>
                    <div className="p-1.5 rounded bg-background/60 border border-border/50 text-[10px] text-muted-foreground line-through truncate">
                      CLI auto-help (T-095)
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
        <section id="features-links" className="scroll-mt-20 space-y-5 pt-1">
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-12 lg:items-center">
            <div className="lg:col-span-7 order-2 lg:order-1">
              <div className="rounded-xl border border-border/90 bg-card p-4 sm:p-5 shadow-2xs card-hover space-y-2.5">
                <div className="flex items-center justify-between pb-2 border-b border-border/70 text-xs">
                  <span className="font-semibold text-foreground flex items-center gap-1.5">
                    <Bookmark className="h-3.5 w-3.5 text-primary" />
                    Reading Archive
                  </span>
                  <span className="text-[10px] font-mono text-muted-foreground">Auto-tagged</span>
                </div>

                <div className="space-y-1.5">
                  {[
                    { title: "Model Context Protocol Specification", domain: "modelcontextprotocol.io", tags: ["#mcp", "#spec"] },
                    { title: "uv: Fast Python Package Installer", domain: "github.com", tags: ["#python", "#tools"] },
                    { title: "Local Vector Search with ONNX in Rust", domain: "antigravity.dev", tags: ["#onnx", "#rust"] },
                  ].map((item, i) => (
                    <div
                      key={item.title}
                      className={`p-2.5 rounded-lg border border-border/70 bg-muted/20 hover:bg-muted/40 active:scale-[0.98] transition-[background-color,border-color,transform] duration-160 ease-[var(--ease-out)] flex items-center justify-between gap-2 stagger-${i + 1}`}
                    >
                      <div className="min-w-0">
                        <div className="font-medium text-xs text-foreground truncate flex items-center gap-1.5">
                          <Link2 className="h-3 w-3 text-primary shrink-0" />
                          <span className="truncate">{item.title}</span>
                        </div>
                        <div className="text-[10px] font-mono text-muted-foreground truncate">{item.domain}</div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0 font-mono text-[9px] text-muted-foreground">
                        {item.tags.map((t) => (
                          <span key={t} className="px-1.5 py-0.2 rounded bg-muted">{t}</span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="lg:col-span-5 space-y-3 order-1 lg:order-2">
              <div className="inline-flex items-center gap-2 text-primary font-mono text-xs uppercase tracking-wider font-semibold">
                <Bookmark className="h-4 w-4" />
                <span>Feature 04 · Saved Links</span>
              </div>
              <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-foreground">
                Personal developer web archive.
              </h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Bookmark libraries, RFC proposals, and blogs with automatic domain extraction and local indexing. No third-party cloud bookmarks needed.
              </p>
              <div className="space-y-2 pt-1 text-xs text-muted-foreground">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-3.5 w-3.5 text-primary shrink-0" />
                  <span>Automatic domain extraction and hashtag indexing</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-3.5 w-3.5 text-primary shrink-0" />
                  <span>Available to AI agents as verified context via MCP</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ===================================================================
            CORE FEATURE 5: MEMOS
            =================================================================== */}
        <section id="features-memos" className="scroll-mt-20 space-y-5 pt-1">
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-12 lg:items-center">
            <div className="lg:col-span-5 space-y-3">
              <div className="inline-flex items-center gap-2 text-primary font-mono text-xs uppercase tracking-wider font-semibold">
                <Hash className="h-4 w-4" />
                <span>Feature 05 · Memos</span>
              </div>
              <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-foreground">
                Rapid capture without project friction.
              </h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Zero-friction capture for fleeting thoughts, bug notes, and ideas with instant hashtag filtering. Accessible globally even without an active project.
              </p>
              <div className="space-y-2 pt-1 text-xs text-muted-foreground">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-3.5 w-3.5 text-primary shrink-0" />
                  <span>Instant hashtag classification (#ideas, #bugs, #rfc)</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-3.5 w-3.5 text-primary shrink-0" />
                  <span>Pin important notes to keep them visible</span>
                </div>
              </div>
            </div>

            <div className="lg:col-span-7">
              <div className="rounded-xl border border-border/90 bg-card p-4 sm:p-5 shadow-2xs card-hover space-y-2.5">
                <div className="flex items-center justify-between pb-2 border-b border-border/70 text-xs">
                  <span className="font-semibold text-foreground flex items-center gap-1.5">
                    <Hash className="h-3.5 w-3.5 text-primary" />
                    Engineering Memos
                  </span>
                  <div className="flex items-center gap-1">
                    {["all", "ideas", "bugs", "rfc"].map((tag) => (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => setActiveMemoTag(tag)}
                        className={`text-[10px] font-mono px-2 py-0.5 rounded cursor-pointer active:scale-[0.95] transition-[background-color,color,transform] duration-160 ease-[var(--ease-out)] ${
                          activeMemoTag === tag
                            ? "bg-primary text-primary-foreground font-semibold"
                            : "bg-muted text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        #{tag}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  {[
                    { content: "Enforce POSIX path separators for subagent worktrees on WSL.", tag: "bugs", date: "2h ago", pinned: true },
                    { content: "Weight BM25 keyword matches 60% and ONNX embeddings 40% for developer term precision.", tag: "ideas", date: "Yesterday", pinned: false },
                    { content: "RFC: Draft subagent lifecycle transition hooks for CI/CD checks.", tag: "rfc", date: "3d ago", pinned: false },
                  ]
                    .filter((m) => activeMemoTag === "all" || m.tag === activeMemoTag)
                    .map((m) => (
                      <div key={m.content} className="p-2.5 rounded-lg border border-border/70 bg-muted/20 space-y-1 active:scale-[0.99] transition-transform duration-160 ease-[var(--ease-out)]">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-xs text-foreground leading-relaxed">{m.content}</p>
                          {m.pinned && <Pin className="h-3 w-3 text-primary shrink-0 fill-primary/30" />}
                        </div>
                        <div className="flex items-center justify-between text-[9.5px] font-mono text-muted-foreground pt-0.5">
                          <span className="text-primary font-semibold">#{m.tag}</span>
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
        <section id="features-docs" className="scroll-mt-20 space-y-5 pt-1">
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-12 lg:items-center">
            <div className="lg:col-span-7 order-2 lg:order-1">
              <div className="rounded-xl border border-border/90 bg-card p-4 sm:p-5 shadow-2xs card-hover space-y-2.5">
                <div className="flex items-center justify-between pb-2 border-b border-border/70 text-xs">
                  <span className="font-semibold text-foreground flex items-center gap-1.5">
                    <FileCode2 className="h-3.5 w-3.5 text-primary" />
                    docs/architecture/mcp-bridge.md
                  </span>
                  <Badge variant="outline" className="text-[9.5px] font-mono text-primary border-primary/30">
                    APPROVED SPEC
                  </Badge>
                </div>

                <div className="rounded-lg border border-border/70 bg-background/80 p-3.5 space-y-2 font-sans text-xs">
                  <div className="space-y-0.5">
                    <h4 className="text-sm font-semibold text-foreground">
                      Model Context Protocol Stdio Transport Architecture
                    </h4>
                    <p className="text-[10px] text-muted-foreground font-mono">
                      Linked with <span className="text-primary font-semibold">@task/TASK-104</span>
                    </p>
                  </div>

                  <p className="text-muted-foreground text-[11.5px] leading-relaxed">
                    Governs low-latency bidirectional IPC over UNIX standard input/output pipes without network socket overhead.
                  </p>

                  <div className="rounded bg-muted/60 p-2 font-mono text-[10px] border border-border/60 text-foreground space-y-0.5">
                    <div className="text-muted-foreground">// JSON-RPC stdio pipe handshake</div>
                    <div className="text-primary truncate">{"{ \"jsonrpc\": \"2.0\", \"method\": \"initialize\", \"id\": 1 }"}</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="lg:col-span-5 space-y-3 order-1 lg:order-2">
              <div className="inline-flex items-center gap-2 text-primary font-mono text-xs uppercase tracking-wider font-semibold">
                <FileText className="h-4 w-4" />
                <span>Feature 06 · Docs</span>
              </div>
              <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-foreground">
                Living specs with zero hallucination.
              </h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Markdown-native architecture specs, ADRs, and onboarding guides. Deterministic <code className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded">@task/&lt;id&gt;</code> and <code className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded">@doc/&lt;path&gt;</code> cross-references ensure zero-hallucination traversal.
              </p>
              <div className="space-y-2 pt-1 text-xs text-muted-foreground">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-3.5 w-3.5 text-primary shrink-0" />
                  <span>Exact citation anchors for humans and AI agents</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-3.5 w-3.5 text-primary shrink-0" />
                  <span>Pure Markdown files versioned directly in Git</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ===================================================================
            WORKBENCH INTERACTIVE DEMO (Tactile Tabs & Blinking Cursor)
            =================================================================== */}
        <section id="workbench-demo" className="scroll-mt-20 space-y-5 pt-2">
          <div className="grid grid-cols-1 gap-10 lg:grid-cols-12 lg:items-start">
            <div className="lg:col-span-5 space-y-4">
              <div className="space-y-2">
                <p className="font-mono text-xs uppercase tracking-wider text-primary font-semibold">
                  Interactive Workbench
                </p>
                <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-foreground">
                  The stdio JSON-RPC MCP bridge.
                </h2>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Agents connect via standard UNIX pipes (<code className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded">stdin/stdout</code>). Zero network roundtrips, atomic file parsing, and structured context packs.
                </p>
              </div>

              <div className="space-y-2.5 pt-1 text-xs text-muted-foreground">
                <div className="flex items-center gap-2.5">
                  <div className="p-1.5 rounded bg-primary/10 text-primary shrink-0">
                    <Zap className="h-3.5 w-3.5" />
                  </div>
                  <span>Sub-millisecond local IPC over child process pipes</span>
                </div>
                <div className="flex items-center gap-2.5">
                  <div className="p-1.5 rounded bg-primary/10 text-primary shrink-0">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  </div>
                  <span>Structured knowledge packs tailored to the active task</span>
                </div>
                <div className="flex items-center gap-2.5">
                  <div className="p-1.5 rounded bg-primary/10 text-primary shrink-0">
                    <Layers className="h-3.5 w-3.5" />
                  </div>
                  <span>Bidirectional lifecycle updates without context pollution</span>
                </div>
              </div>

              <div className="rounded-lg border border-border/80 bg-muted/30 p-3 space-y-1.5">
                <div className="text-xs font-medium text-foreground">Start the MCP server:</div>
                <div className="flex items-center justify-between rounded bg-background px-3 py-1 font-mono text-xs border border-border/60">
                  <span className="text-primary font-medium">$ knowme mcp serve</span>
                  <span className="text-[10px] text-muted-foreground">stdio</span>
                </div>
              </div>
            </div>

            {/* Terminal Transcript */}
            <div className="lg:col-span-7">
              <div className="rounded-xl border border-border/90 bg-card overflow-hidden shadow-md card-hover">
                <div className="border-b border-border/80 bg-muted/40 p-2.5 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full bg-destructive/60" />
                    <span className="h-2.5 w-2.5 rounded-full bg-warning/60" />
                    <span className="h-2.5 w-2.5 rounded-full bg-success/60" />
                    <span className="ml-2 font-mono text-xs font-medium text-foreground flex items-center gap-1.5">
                      <Terminal className="h-3.5 w-3.5 text-primary" />
                      mcp-terminal
                    </span>
                  </div>

                  <div className="flex items-center rounded-md border border-border/80 bg-background/80 p-0.5 text-xs font-mono">
                    <button
                      type="button"
                      onClick={() => setDemoView("response")}
                      className={`px-2 py-0.5 rounded text-[10.5px] active:scale-[0.95] transition-[background-color,color,transform] duration-160 ease-[var(--ease-out)] cursor-pointer ${
                        demoView === "response"
                          ? "bg-primary text-primary-foreground font-medium"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      Output
                    </button>
                    <button
                      type="button"
                      onClick={() => setDemoView("request")}
                      className={`px-2 py-0.5 rounded text-[10.5px] active:scale-[0.95] transition-[background-color,color,transform] duration-160 ease-[var(--ease-out)] cursor-pointer ${
                        demoView === "request"
                          ? "bg-primary text-primary-foreground font-medium"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      Request
                    </button>
                  </div>
                </div>

                <div className="flex items-center overflow-x-auto border-b border-border/70 bg-muted/20 px-2.5 py-1.5 gap-1 scrollbar-none">
                  {DEMO_TABS.map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setActiveTabId(tab.id)}
                      className={`font-mono text-xs px-2 py-1 rounded whitespace-nowrap cursor-pointer flex items-center gap-1.5 active:scale-[0.96] transition-[background-color,color,border-color,transform] duration-160 ease-[var(--ease-out)] ${
                        activeTabId === tab.id
                          ? "bg-background text-primary border border-border/80 font-semibold shadow-2xs"
                          : "text-muted-foreground hover:text-foreground hover:bg-muted/50 border border-transparent"
                      }`}
                    >
                      <span className={`h-1.5 w-1.5 rounded-full ${activeTabId === tab.id ? "bg-primary animate-pulse-glow" : "bg-muted-foreground/50"}`} />
                      {tab.name}
                    </button>
                  ))}
                </div>

                <div className="p-3.5 sm:p-4 font-mono text-xs space-y-2.5 bg-card">
                  <div className="flex items-center justify-between pb-1.5 border-b border-border/50 text-[10.5px] text-muted-foreground">
                    <span className="truncate max-w-[80%]">{activeTab.description}</span>
                    <button
                      type="button"
                      onClick={() =>
                        copyToClipboard(
                          demoView === "response" ? activeTab.responsePayload : activeTab.requestPayload,
                          "payload"
                        )
                      }
                      className="p-1 rounded hover:bg-muted/80 text-muted-foreground hover:text-foreground active:scale-[0.9] transition-[background-color,color,transform] duration-160 ease-[var(--ease-out)] cursor-pointer"
                      title="Copy JSON"
                    >
                      {copiedPayload ? <Check className="h-3.5 w-3.5 text-primary" /> : <Copy className="h-3.5 w-3.5" />}
                    </button>
                  </div>

                  <div className="flex items-center gap-2 text-foreground font-medium bg-muted/40 px-2.5 py-1.5 rounded border border-border/60">
                    <span className="text-primary font-bold">agent&gt;</span>
                    <span className="text-primary truncate">{activeTab.toolCall}</span>
                    <span className="text-primary animate-cursor-blink font-bold">_</span>
                  </div>

                  <div className="relative rounded-lg border border-border/70 bg-background/80 p-3 overflow-x-auto max-h-[300px]">
                    <pre className="text-[11px] font-mono leading-relaxed text-foreground">
                      {demoView === "response" ? activeTab.responsePayload : activeTab.requestPayload}
                    </pre>
                  </div>

                  <div className="flex flex-wrap items-center justify-between pt-1 text-[10.5px] text-muted-foreground font-mono">
                    <div className="flex items-center gap-3">
                      <span>Latency: <strong className="text-primary font-semibold">{activeTab.stats.time}</strong></span>
                      <span>Tokens: <strong className="text-foreground">{activeTab.stats.tokens}</strong></span>
                    </div>
                    <span>Source: <strong className="text-foreground">{activeTab.stats.source}</strong></span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ===================================================================
            FAQ ACCORDION SECTION
            =================================================================== */}
        <section id="faq-section" className="scroll-mt-20 space-y-5 max-w-4xl mx-auto pt-1">
          <div className="text-center space-y-1">
            <p className="font-mono text-xs uppercase tracking-wider text-primary font-semibold">
              FAQ
            </p>
            <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-foreground">
              Frequently Asked Questions
            </h2>
          </div>

          <div className="rounded-xl border border-border/90 bg-card p-5 sm:p-6 shadow-2xs card-hover">
            <Accordion type="single" collapsible defaultValue="item-1" className="w-full">
              <AccordionItem value="item-1">
                <AccordionTrigger className="text-sm sm:text-base font-semibold text-foreground">
                  How does KnowMe protect my project's data privacy?
                </AccordionTrigger>
                <AccordionContent>
                  KnowMe is 100% local-first. Tasks, memos, docs, and reading lists live in plain Markdown and JSON files in your repository's <code className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">.know-me/</code> folder. There is no cloud database, tracking cookies, or telemetry. Agent MCP communication runs entirely over local child process stdio pipes.
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="item-2">
                <AccordionTrigger className="text-sm sm:text-base font-semibold text-foreground">
                  How does the Model Context Protocol (MCP) integration work?
                </AccordionTrigger>
                <AccordionContent>
                  KnowMe exposes an MCP server speaking JSON-RPC 2.0 over standard I/O (<code className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">stdio</code>). Coding agents (Claude Code, Cursor, Codex, Hermes) spawn the KnowMe CLI as a child process, query tools like <code className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">knowme_retrieve</code>, and receive verified context without network overhead.
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="item-3">
                <AccordionTrigger className="text-sm sm:text-base font-semibold text-foreground">
                  How is KnowMe different from Notion or Obsidian?
                </AccordionTrigger>
                <AccordionContent>
                  Unlike Notion, KnowMe doesn't lock your data in a proprietary cloud database with monthly fees. Unlike Obsidian, KnowMe is purpose-built for engineering workflows and coding agents: granular task lifecycles, acceptance checklists, Kanban boards, deterministic cross-references (<code className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">@task/&lt;id&gt;</code>), and isolated Git worktree execution.
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="item-4">
                <AccordionTrigger className="text-sm sm:text-base font-semibold text-foreground">
                  Which platforms and coding agents are supported?
                </AccordionTrigger>
                <AccordionContent>
                  Runs on macOS (Apple Silicon & Intel), Linux (x86_64 & aarch64), and Windows WSL2. Compatible out of the box with Claude Code, Cursor IDE, Codex CLI, Hermes Agent, OpenCode, and any client implementing the MCP specification.
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="item-5">
                <AccordionTrigger className="text-sm sm:text-base font-semibold text-foreground">
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
            COLOPHON / FOOTER
            =================================================================== */}
        <footer className="border-t border-border/80 pt-10 pb-14 space-y-6">
          <div className="grid grid-cols-1 gap-6 md:grid-cols-4 lg:grid-cols-5">
            <div className="md:col-span-2 space-y-2">
              <div className="flex items-center gap-2">
                <img
                  src="/logo.png"
                  alt="KnowMe"
                  className="h-6 w-6 rounded-md border border-border/80 object-cover"
                />
                <span className="font-semibold tracking-tight text-foreground text-sm">
                  KnowMe
                </span>
                <Badge variant="secondary" className="font-mono text-[9.5px] px-1.5 py-0">
                  v1.12
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed max-w-sm">
                Your personal knowledge database for developers and AI coding agents. Local-first, git-native, zero telemetry.
              </p>
              <div className="text-[10.5px] font-mono text-muted-foreground">
                MIT License. Free to fork and self-host.
              </div>
            </div>

            <div className="space-y-2 text-xs">
              <div className="font-mono font-semibold uppercase tracking-wider text-foreground text-[10.5px]">
                Features
              </div>
              <ul className="space-y-1.5 text-muted-foreground">
                {[
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
                      className="hover:text-foreground transition-colors duration-160 ease-[var(--ease-out)] cursor-pointer"
                    >
                      {item.label}
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            <div className="space-y-2 text-xs">
              <div className="font-mono font-semibold uppercase tracking-wider text-foreground text-[10.5px]">
                Developers
              </div>
              <ul className="space-y-1.5 text-muted-foreground">
                <li>
                  <a
                    href="https://github.com/knowns/know-me"
                    target="_blank"
                    rel="noreferrer"
                    className="hover:text-foreground transition-colors duration-160 ease-[var(--ease-out)] inline-flex items-center gap-1"
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
                    className="hover:text-foreground transition-colors duration-160 ease-[var(--ease-out)] inline-flex items-center gap-1"
                  >
                    <span>MCP Spec</span>
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </li>
                <li>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(installCommand, "install")}
                    className="hover:text-foreground transition-colors duration-160 ease-[var(--ease-out)] inline-flex items-center gap-1 cursor-pointer active:scale-[0.97]"
                  >
                    <span>Install Script</span>
                    <Copy className="h-3 w-3" />
                  </button>
                </li>
              </ul>
            </div>

            <div className="space-y-2 text-xs">
              <div className="font-mono font-semibold uppercase tracking-wider text-foreground text-[10.5px]">
                Status
              </div>
              <div className="space-y-1 font-mono text-[10.5px] text-muted-foreground">
                <div className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse-glow" />
                  <span className="text-foreground">Local Engine: Active</span>
                </div>
                <div>Storage: .know-me/ disk</div>
                <div>Protocol: MCP JSON-RPC</div>
              </div>
            </div>
          </div>

          <div className="border-t border-border/60 pt-5 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-muted-foreground">
            <div>© 2026 KnowMe Authors. Open source under MIT.</div>
            <div>
              <a
                href="http://localhost:6421"
                target="_blank"
                rel="noreferrer"
                className="hover:text-foreground transition-colors duration-160 ease-[var(--ease-out)] cursor-pointer font-medium text-primary active:scale-[0.97]"
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
