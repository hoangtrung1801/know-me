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
  Clock,
  Tag,
  CheckSquare,
  AlertCircle,
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
    description: "Structured context pack combining task acceptance criteria, linked docs, and active git commit context for instant reasoning.",
    requestPayload: JSON.stringify(
      {
        jsonrpc: "2.0",
        id: 42,
        method: "tools/call",
        params: {
          name: "knowme_retrieve",
          arguments: {
            task: "TASK-104",
            include_docs: true,
            max_tokens: 3500,
          },
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
            "Support stdio JSON-RPC 2.0 communication over child process pipes",
            "Zero cloud roundtrips; parse .know-me/ local disk state directly",
            "Deterministic citation anchors with @task/<id> and @doc/<path>",
          ],
          linked_docs: ["docs/architecture/mcp-bridge.md", "docs/specs/subagents.md"],
          tags: ["mcp", "architecture", "agent-runner"],
        },
        context_pack: {
          tokens_used: 1420,
          relevance_score: 0.98,
          citation_format: "exact-line",
        },
      },
      null,
      2
    ),
    stats: { time: "8ms", tokens: "1,420 tokens", source: "Local Markdown Cache" },
  },
  {
    id: "search",
    name: "knowme_search",
    toolCall: 'knowme_search(query="token auth expiration")',
    description: "Hybrid search pairing BM25 keyword matching with local ONNX vector embeddings. Runs 100% on CPU without API keys.",
    requestPayload: JSON.stringify(
      {
        jsonrpc: "2.0",
        id: 43,
        method: "tools/call",
        params: {
          name: "knowme_search",
          arguments: {
            query: "token auth expiration",
            mode: "hybrid",
            limit: 3,
          },
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
            snippet: "Access tokens expire after 900s. Refresh tokens rotate on each issuance.",
            score: 0.94,
            engine: "BM25 (0.91) + ONNX Vector (0.97)",
          },
          {
            type: "task",
            id: "TASK-089",
            title: "Add sliding session expiration to client SDK",
            score: 0.88,
            engine: "ONNX Vector (0.92)",
          },
        ],
      },
      null,
      2
    ),
    stats: { time: "14ms", tokens: "480 tokens", source: "Hybrid BM25 + ONNX" },
  },
  {
    id: "doc",
    name: "knowme_doc",
    toolCall: 'knowme_doc(path="architecture/mcp-bridge.md")',
    description: "Read canonical project documentation with frontmatter parsing, section anchors, and cross-reference resolution.",
    requestPayload: JSON.stringify(
      {
        jsonrpc: "2.0",
        id: 44,
        method: "tools/call",
        params: {
          name: "knowme_doc",
          arguments: {
            path: "architecture/mcp-bridge.md",
            section: "stdio-transport",
          },
        },
      },
      null,
      2
    ),
    responsePayload: JSON.stringify(
      {
        path: "architecture/mcp-bridge.md",
        title: "Model Context Protocol Stdio Architecture",
        last_modified: "2026-10-02T14:15:00Z",
        content: "### stdio Transport Protocol\nThe agent spawns the KnowMe CLI as a child process using stdin/stdout. Handshake exchanges tool definitions for immediate retrieval without socket overhead.",
        referenced_by: ["TASK-104", "TASK-112"],
      },
      null,
      2
    ),
    stats: { time: "4ms", tokens: "620 tokens", source: "Git-Tracked Markdown" },
  },
  {
    id: "task",
    name: "knowme_task",
    toolCall: 'knowme_task(id="TASK-104", action="update_status")',
    description: "Bidirectional agent execution: agents read specifications and update task lifecycle states upon milestone completion.",
    requestPayload: JSON.stringify(
      {
        jsonrpc: "2.0",
        id: 45,
        method: "tools/call",
        params: {
          name: "knowme_task",
          arguments: {
            id: "TASK-104",
            patch: {
              status: "review-ready",
              comment: "All unit tests passing. Ready for milestone gate check.",
            },
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
        git_status: "modified",
      },
      null,
      2
    ),
    stats: { time: "11ms", tokens: "310 tokens", source: "Atomic File Write" },
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
      <header className="sticky top-0 z-40 w-full border-b border-border/70 bg-background/85 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          {/* Logo & Brand */}
          <div className="flex items-center gap-3">
            <a
              href="/"
              className="flex items-center gap-2.5 text-left group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md"
            >
              <img
                src="/logo.png"
                alt="KnowMe Logo"
                className="h-8 w-8 rounded-lg border border-border/80 object-cover shadow-xs transition-transform duration-200 group-hover:scale-105"
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
          <nav className="flex items-center gap-1.5 sm:gap-3">
            <div className="hidden lg:flex items-center gap-1 text-xs text-muted-foreground">
              <button
                type="button"
                onClick={() => scrollToSection("features-projects")}
                className="px-2 py-1 rounded hover:text-foreground hover:bg-muted/60 transition-colors cursor-pointer"
              >
                Projects
              </button>
              <button
                type="button"
                onClick={() => scrollToSection("features-tasks")}
                className="px-2 py-1 rounded hover:text-foreground hover:bg-muted/60 transition-colors cursor-pointer"
              >
                Tasks
              </button>
              <button
                type="button"
                onClick={() => scrollToSection("features-kanban")}
                className="px-2 py-1 rounded hover:text-foreground hover:bg-muted/60 transition-colors cursor-pointer"
              >
                Kanban
              </button>
              <button
                type="button"
                onClick={() => scrollToSection("features-links")}
                className="px-2 py-1 rounded hover:text-foreground hover:bg-muted/60 transition-colors cursor-pointer"
              >
                Links
              </button>
              <button
                type="button"
                onClick={() => scrollToSection("features-memos")}
                className="px-2 py-1 rounded hover:text-foreground hover:bg-muted/60 transition-colors cursor-pointer"
              >
                Memos
              </button>
              <button
                type="button"
                onClick={() => scrollToSection("features-docs")}
                className="px-2 py-1 rounded hover:text-foreground hover:bg-muted/60 transition-colors cursor-pointer"
              >
                Docs
              </button>
            </div>

            <button
              type="button"
              onClick={() => scrollToSection("workbench-demo")}
              className="hidden sm:inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1.5 rounded-md hover:bg-muted/60 cursor-pointer"
            >
              <Terminal className="h-3.5 w-3.5" />
              <span>MCP Bridge</span>
            </button>

            <a
              href="https://github.com/knowns/know-me"
              target="_blank"
              rel="noreferrer"
              className="hidden sm:inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1.5 rounded-md hover:bg-muted/60"
            >
              <GitBranch className="h-3.5 w-3.5" />
              <span>GitHub</span>
            </a>

            {/* Theme Toggle */}
            <ThemeToggle
              isDark={isDark}
              onToggle={toggleTheme}
              size="sm"
              className="text-muted-foreground hover:text-foreground cursor-pointer"
            />

            {/* Launch Workspace CTA */}
            <a href="http://localhost:6421" target="_blank" rel="noreferrer">
              <Button
                size="sm"
                className="gap-1.5 shadow-xs font-medium cursor-pointer"
              >
                <span>Launch Workspace</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </a>
          </nav>
        </div>
      </header>

      {/* Main Container */}
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 space-y-24 sm:space-y-32">
        {/* ===================================================================
            2. HERO SECTION (Split Hero Layout)
            =================================================================== */}
        <section className="pt-4 sm:pt-8 md:pt-12">
          <div className="grid grid-cols-1 gap-12 lg:grid-cols-12 lg:items-center">
            {/* Left Column: Copy & Actions */}
            <div className="lg:col-span-6 space-y-6">
              {/* Badge/Tagline */}
              <div className="inline-flex items-center gap-2">
                <Badge
                  variant="outline"
                  className="rounded-full border-primary/30 bg-primary/5 px-3 py-1 text-xs text-primary font-normal gap-1.5 tracking-tight"
                >
                  <Sparkles className="h-3.5 w-3.5 text-primary" />
                  Local-first memory for AI-native software development
                </Badge>
              </div>

              {/* Headline */}
              <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl lg:text-6xl text-foreground text-balance leading-[1.08]">
                Your personal knowledge database.
              </h1>

              {/* Subheadline */}
              <p className="text-base sm:text-lg text-muted-foreground leading-relaxed max-w-xl text-pretty font-normal">
                KnowMe is your personal knowledge database: projects, tasks, docs, memos, and reading lists in one calm, local-first place. Your AI coding agents plug in via MCP to read, understand, and work with everything you know — no more re-explaining.
              </p>

              {/* Actions: Install Command & Open Workspace */}
              <div className="space-y-3 pt-2">
                <div className="flex flex-wrap items-center gap-3">
                  <a href="http://localhost:6421" target="_blank" rel="noreferrer">
                    <Button
                      size="lg"
                      className="gap-2 font-medium cursor-pointer"
                    >
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
                      className="gap-2 cursor-pointer font-medium"
                    >
                      <GitBranch className="h-4 w-4 text-muted-foreground" />
                      <span>Star on GitHub</span>
                    </Button>
                  </a>
                </div>

                {/* Quick Install Command Box */}
                <div className="flex items-center justify-between gap-3 rounded-lg border border-border/90 bg-muted/40 px-3.5 py-2.5 font-mono text-xs sm:text-sm text-foreground max-w-lg shadow-xs group">
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
                    className="shrink-0 p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-background/80 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer"
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
                  <span>Works with macOS, Linux, and WSL · Standalone binary · Zero npm/cloud lock-in</span>
                </p>
              </div>
            </div>

            {/* Right Column: Visual Element Mock (.know-me/ local disk + AI agent MCP session) */}
            <div className="lg:col-span-6">
              <div className="rounded-xl border border-border/90 bg-card p-1 shadow-md transition-all hover:shadow-lg">
                {/* Window Bar */}
                <div className="flex items-center justify-between border-b border-border/80 px-4 py-2.5 bg-muted/30 rounded-t-lg">
                  <div className="flex items-center gap-2">
                    <span className="h-3 w-3 rounded-full bg-destructive/60" />
                    <span className="h-3 w-3 rounded-full bg-warning/60" />
                    <span className="h-3 w-3 rounded-full bg-success/60" />
                    <span className="ml-2 font-mono text-xs text-muted-foreground">
                      knowme-workspace :: mcp-session
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="font-mono text-[11px] text-primary font-medium">
                      MCP stdio active
                    </span>
                  </div>
                </div>

                {/* Split Mock Layout: Local Disk vs AI Agent Session */}
                <div className="grid grid-cols-1 md:grid-cols-12 divide-y md:divide-y-0 md:divide-x divide-border/80 bg-background/50 font-mono text-xs">
                  {/* Left: Local Filesystem (.know-me/) */}
                  <div className="md:col-span-5 p-3.5 space-y-3 bg-muted/15">
                    <div className="flex items-center justify-between text-muted-foreground text-[11px] font-semibold tracking-wider uppercase">
                      <span className="flex items-center gap-1">
                        <FolderTree className="h-3.5 w-3.5 text-primary" />
                        .know-me/ disk
                      </span>
                      <span className="text-[10px] text-muted-foreground/80 font-mono">
                        git-native
                      </span>
                    </div>

                    <div className="space-y-1.5 text-[11px] text-muted-foreground">
                      <div className="flex items-center gap-1.5 text-foreground font-medium">
                        <FileText className="h-3.5 w-3.5 text-primary" />
                        <span>config.json</span>
                      </div>
                      <div className="pl-3 space-y-1">
                        <div className="flex items-center justify-between bg-accent/30 text-accent-foreground px-1.5 py-0.5 rounded text-[10.5px]">
                          <span className="truncate">tasks/TASK-104.md</span>
                          <span className="text-[9px] font-mono text-primary font-semibold">
                            ACTIVE
                          </span>
                        </div>
                        <div className="flex items-center justify-between px-1.5 py-0.5 text-muted-foreground text-[10.5px]">
                          <span className="truncate">tasks/TASK-103.md</span>
                          <span className="text-[9px] text-muted-foreground/70">DONE</span>
                        </div>
                        <div className="flex items-center justify-between px-1.5 py-0.5 text-muted-foreground text-[10.5px]">
                          <span className="truncate">docs/mcp-bridge.md</span>
                          <span className="text-[9px] text-muted-foreground/70">DOC</span>
                        </div>
                        <div className="flex items-center justify-between px-1.5 py-0.5 text-muted-foreground text-[10.5px]">
                          <span className="truncate">memos/2026-w41.md</span>
                          <span className="text-[9px] text-muted-foreground/70">MEMO</span>
                        </div>
                        <div className="flex items-center justify-between px-1.5 py-0.5 text-muted-foreground text-[10.5px]">
                          <span className="truncate">reading/papers.md</span>
                          <span className="text-[9px] text-muted-foreground/70">READ</span>
                        </div>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-border/60 text-[10px] text-muted-foreground space-y-0.5">
                      <div className="flex justify-between">
                        <span>Format:</span>
                        <span className="text-foreground font-medium">Markdown + JSON</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Cloud dependencies:</span>
                        <span className="text-primary font-medium">Zero (0)</span>
                      </div>
                    </div>
                  </div>

                  {/* Right: AI Coding Agent MCP Session */}
                  <div className="md:col-span-7 p-3.5 space-y-3 bg-card/60">
                    <div className="flex items-center justify-between text-[11px]">
                      <div className="flex items-center gap-1.5 text-foreground font-semibold">
                        <Bot className="h-3.5 w-3.5 text-primary" />
                        <span>Claude / Cursor / Codex</span>
                      </div>
                      <Badge variant="secondary" className="text-[10px] py-0 px-1.5">
                        MCP stdio v1.0
                      </Badge>
                    </div>

                    {/* Chat / Tool Execution Bubble */}
                    <div className="rounded-md border border-border/80 bg-background/80 p-2.5 space-y-2 text-[11px]">
                      <div className="flex items-center gap-1.5 text-primary font-medium">
                        <Zap className="h-3 w-3" />
                        <span>knowme_retrieve(task="TASK-104")</span>
                      </div>
                      <p className="text-[10.5px] text-muted-foreground font-sans leading-relaxed">
                        Retrieved task acceptance criteria and linked architecture docs in 8ms:
                      </p>
                      <div className="rounded bg-muted/60 p-2 font-mono text-[10px] space-y-1 border border-border/50 text-foreground">
                        <div className="text-muted-foreground"># TASK-104 Acceptance Criteria</div>
                        <div className="text-primary flex items-center gap-1">
                          <CheckCircle2 className="h-2.5 w-2.5" />
                          <span>Stdio JSON-RPC pipe configured</span>
                        </div>
                        <div className="text-primary flex items-center gap-1">
                          <CheckCircle2 className="h-2.5 w-2.5" />
                          <span>Local disk read (zero latency)</span>
                        </div>
                        <div className="text-muted-foreground flex items-center gap-1">
                          <span className="h-2 w-2 rounded-full border border-muted-foreground/60" />
                          <span>Pass verification suite</span>
                        </div>
                      </div>
                    </div>

                    {/* Agent reasoning bar */}
                    <div className="flex items-center justify-between text-[10px] text-muted-foreground px-1 pt-1 font-mono">
                      <span className="flex items-center gap-1">
                        <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                        Ready to write code
                      </span>
                      <span>0 re-explanations needed</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ===================================================================
            3. BENTO GRID OVERVIEW (6 irregular tiles)
            =================================================================== */}
        <section className="space-y-6">
          <div className="space-y-2 max-w-2xl">
            <p className="font-mono text-xs uppercase tracking-wider text-primary font-semibold">
              Engineered for developer clarity
            </p>
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl text-foreground">
              Everything in your workspace, tuned for agent collaboration.
            </h2>
            <p className="text-sm sm:text-base text-muted-foreground">
              A single cohesive foundation where human thought and machine intelligence meet without friction or context loss.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3 md:grid-rows-[auto_auto_auto]">
            {/* Tile 1: Lead Tile (spans 2 cols, 2 rows) */}
            <article className="md:col-span-2 md:row-span-2 rounded-xl border border-border/90 bg-card p-6 sm:p-8 flex flex-col justify-between shadow-xs transition-colors hover:border-border">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Badge variant="outline" className="text-xs font-mono text-primary border-primary/30">
                    Lead Feature · Core Protocol
                  </Badge>
                  <span className="font-mono text-xs text-muted-foreground">stdio JSON-RPC</span>
                </div>

                <h3 className="text-2xl sm:text-3xl lg:text-4xl font-semibold tracking-tight text-foreground text-balance">
                  Stop re-explaining your project to AI coding agents.
                </h3>

                <p className="text-sm sm:text-base text-muted-foreground leading-relaxed max-w-2xl font-normal">
                  Every time you start a new conversation with Claude Code, Cursor, Codex, OpenCode, or Hermes, you lose context. KnowMe implements the official Model Context Protocol (MCP) over fast stdio pipes, giving your coding agents instant, structured access to your active tasks, architectural decisions, and docs.
                </p>
              </div>

              {/* Agent compatibility pills & Visual architecture schematic */}
              <div className="mt-8 pt-6 border-t border-border/70 space-y-4">
                <div className="text-xs font-mono text-muted-foreground uppercase tracking-wider">
                  Native MCP compatibility out of the box
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  {[
                    { name: "Claude Code", status: "MCP stdio", icon: Bot },
                    { name: "Cursor IDE", status: "Direct bridge", icon: Code2 },
                    { name: "Hermes & OMP", status: "Auto-detect", icon: Cpu },
                    { name: "Codex CLI", status: "Native tools", icon: Terminal },
                  ].map((agent) => (
                    <div
                      key={agent.name}
                      className="rounded-lg border border-border/80 bg-muted/30 p-2.5 text-center space-y-1 hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex justify-center">
                        <agent.icon className="h-4 w-4 text-primary" />
                      </div>
                      <div className="text-xs font-medium text-foreground">{agent.name}</div>
                      <div className="text-[10px] font-mono text-muted-foreground">{agent.status}</div>
                    </div>
                  ))}
                </div>

                <div className="rounded-lg bg-muted/40 p-3 font-mono text-[11px] text-muted-foreground flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <Zap className="h-3.5 w-3.5 text-primary" />
                    Prompt injection protection & deterministic schema verification
                  </span>
                  <span className="text-primary font-semibold">100% verified</span>
                </div>
              </div>
            </article>

            {/* Tile 2: Local-First & Git-Native */}
            <article className="rounded-xl border border-border/90 bg-card p-6 flex flex-col justify-between shadow-xs transition-colors hover:border-border">
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-primary">
                  <GitBranch className="h-4 w-4" />
                  <span className="font-mono text-xs uppercase tracking-wider font-semibold">
                    Local-First
                  </span>
                </div>
                <h3 className="text-xl font-semibold tracking-tight text-foreground">
                  Local-First & Git-Native
                </h3>
                <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                  Plain Markdown (<code className="text-[11px] bg-muted px-1 py-0.5 rounded">.know-me/tasks/</code>, <code className="text-[11px] bg-muted px-1 py-0.5 rounded">.know-me/docs/</code>) and JSON on disk. Commit your knowledge right next to your code. Zero vendor lock-in.
                </p>
              </div>

              <div className="mt-4 pt-3 border-t border-border/70 flex items-center justify-between text-[11px] font-mono text-muted-foreground">
                <span>Storage backend:</span>
                <span className="text-foreground font-medium">Standard POSIX files</span>
              </div>
            </article>

            {/* Tile 3: Calm Workspace */}
            <article className="rounded-xl border border-border/90 bg-card p-6 flex flex-col justify-between shadow-xs transition-colors hover:border-border">
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-primary">
                  <Kanban className="h-4 w-4" />
                  <span className="font-mono text-xs uppercase tracking-wider font-semibold">
                    Calm Workspace
                  </span>
                </div>
                <h3 className="text-xl font-semibold tracking-tight text-foreground">
                  Calm, Distraction-Free UI
                </h3>
                <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                  Fluid Kanban board, quick hashtagged memos, and reading lists with automatic metadata extraction. High density without visual fatigue.
                </p>
              </div>

              <div className="mt-4 pt-3 border-t border-border/70 flex flex-wrap gap-1.5">
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-muted text-muted-foreground">#architecture</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-muted text-muted-foreground">#mcp</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-muted text-muted-foreground">#security</span>
              </div>
            </article>

            {/* Tile 4: Deterministic References & Hybrid Retrieval (spans 2 cols) */}
            <article className="md:col-span-2 rounded-xl border border-border/90 bg-card p-6 sm:p-7 flex flex-col justify-between shadow-xs transition-colors hover:border-border">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-primary">
                    <Search className="h-4 w-4" />
                    <span className="font-mono text-xs uppercase tracking-wider font-semibold">
                      Retrieval Engine
                    </span>
                  </div>
                  <span className="font-mono text-xs text-muted-foreground">BM25 + ONNX Embeddings</span>
                </div>

                <h3 className="text-xl sm:text-2xl font-semibold tracking-tight text-foreground">
                  Deterministic References & Hybrid Retrieval
                </h3>

                <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed max-w-2xl">
                  Anchor ideas with deterministic <code className="text-[11px] bg-muted px-1.5 py-0.5 rounded font-mono text-primary font-semibold">@task/&lt;id&gt;</code> and <code className="text-[11px] bg-muted px-1.5 py-0.5 rounded font-mono text-primary font-semibold">@doc/&lt;path&gt;</code> cross-links. Dual-engine search fuses BM25 exact keyword matches with local vector semantic embeddings for pinpoint retrieval.
                </p>
              </div>

              <div className="mt-6 pt-4 border-t border-border/70 flex flex-wrap items-center justify-between gap-3 text-xs font-mono">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <span className="h-2 w-2 rounded-full bg-primary" />
                  <span>Sub-15ms local search latency</span>
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <span>Zero external vector database required</span>
                </div>
              </div>
            </article>

            {/* Tile 5: Background Agent Runner */}
            <article className="rounded-xl border border-border/90 bg-card p-6 flex flex-col justify-between shadow-xs transition-colors hover:border-border">
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-primary">
                  <Cpu className="h-4 w-4" />
                  <span className="font-mono text-xs uppercase tracking-wider font-semibold">
                    Execution
                  </span>
                </div>
                <h3 className="text-xl font-semibold tracking-tight text-foreground">
                  Background Agent Runner
                </h3>
                <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                  Integrated OMP runner executing in isolated Git worktrees. Set acceptance criteria, inspect live diffs, and enforce milestone review gates.
                </p>
              </div>

              <div className="mt-4 pt-3 border-t border-border/70 flex items-center justify-between text-[11px] font-mono text-muted-foreground">
                <span>Worktree isolation:</span>
                <span className="text-primary font-medium">Guaranteed safe</span>
              </div>
            </article>

            {/* Tile 6: Zero Telemetry & Private by Default */}
            <article className="md:col-span-3 rounded-xl border border-border/90 bg-muted/20 p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xs">
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-primary">
                  <Lock className="h-4 w-4" />
                  <span className="font-mono text-xs uppercase tracking-wider font-semibold">
                    Data Sovereignty
                  </span>
                </div>
                <h3 className="text-lg font-semibold tracking-tight text-foreground">
                  Zero Telemetry & Private by Default
                </h3>
                <p className="text-xs sm:text-sm text-muted-foreground max-w-3xl">
                  Your code, architectural blueprints, and thinking stay on your machine. KnowMe has no cloud database, no tracking cookies, and no telemetry pings.
                </p>
              </div>
              <div className="shrink-0">
                <Badge variant="outline" className="font-mono text-xs bg-background">
                  100% Offline Capable
                </Badge>
              </div>
            </article>
          </div>
        </section>

        {/* ===================================================================
            CORE FEATURE 1: PROJECTS (Centralized Repository / Workspace Home)
            =================================================================== */}
        <section id="features-projects" className="scroll-mt-20 space-y-8 pt-4">
          <div className="grid grid-cols-1 gap-10 lg:grid-cols-12 lg:items-center">
            {/* Left Column: Copy */}
            <div className="lg:col-span-5 space-y-4">
              <div className="inline-flex items-center gap-2 text-primary font-mono text-xs uppercase tracking-wider font-semibold">
                <FolderGit2 className="h-4 w-4" />
                <span>Feature 01 · Workspace Topology</span>
              </div>
              <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight text-foreground">
                Projects: Centralized home per repository.
              </h2>
              <p className="text-sm sm:text-base text-muted-foreground leading-relaxed">
                Every code repository gets its own clean home with a dedicated <code className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded">.know-me/</code> folder. Seamlessly switch between active client projects, microservices, and internal tools without context contamination.
              </p>
              <div className="space-y-2.5 pt-2 text-xs text-muted-foreground">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                  <span>Instant workspace switching with zero reload lag</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                  <span>Binds all tasks, docs, and git worktrees under one roof</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                  <span>Git-native configuration stored directly in your repo root</span>
                </div>
              </div>
            </div>

            {/* Right Column: Visual Mock for Projects */}
            <div className="lg:col-span-7">
              <div className="rounded-xl border border-border/90 bg-card p-5 shadow-xs space-y-4">
                <div className="flex items-center justify-between border-b border-border/70 pb-3">
                  <div className="flex items-center gap-2">
                    <FolderGit2 className="h-4 w-4 text-primary" />
                    <span className="font-medium text-sm text-foreground">Switch Project Workspace</span>
                  </div>
                  <Badge variant="outline" className="text-[11px] font-mono">4 Local Repositories</Badge>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {[
                    { name: "know-me/core", path: "~/code/know-me", active: true, tasks: "24 tasks", docs: "18 docs", branch: "main (c9a41b)" },
                    { name: "api-gateway", path: "~/code/api-gateway", active: false, tasks: "12 tasks", docs: "6 docs", branch: "feat/grpc (8f102e)" },
                    { name: "mobile-sdk", path: "~/code/mobile-sdk", active: false, tasks: "9 tasks", docs: "14 docs", branch: "v2.1-dev (1a044b)" },
                    { name: "cloud-infrastructure", path: "~/code/infra", active: false, tasks: "17 tasks", docs: "29 docs", branch: "staging (45df01)" },
                  ].map((p) => (
                    <div
                      key={p.name}
                      className={`p-3 rounded-lg border transition-all ${
                        p.active
                          ? "border-primary/60 bg-primary/5 shadow-xs"
                          : "border-border/70 bg-muted/20 hover:bg-muted/40"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="font-semibold text-xs text-foreground truncate">{p.name}</span>
                        {p.active ? (
                          <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-primary text-primary-foreground font-semibold">ACTIVE</span>
                        ) : (
                          <span className="text-[10px] font-mono text-muted-foreground">SWITCH</span>
                        )}
                      </div>
                      <div className="text-[11px] font-mono text-muted-foreground truncate mb-2">{p.path}</div>
                      <div className="flex items-center justify-between text-[10px] font-mono text-muted-foreground pt-1.5 border-t border-border/50">
                        <span>{p.tasks} · {p.docs}</span>
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
            CORE FEATURE 2: TASKS (Granular Engineering Task Tracking)
            =================================================================== */}
        <section id="features-tasks" className="scroll-mt-20 space-y-8 pt-4">
          <div className="grid grid-cols-1 gap-10 lg:grid-cols-12 lg:items-center">
            {/* Left Column: Visual Mock for Tasks */}
            <div className="lg:col-span-7 order-2 lg:order-1">
              <div className="rounded-xl border border-border/90 bg-card p-5 shadow-xs space-y-4">
                {/* Task Header */}
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/70 pb-3">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold text-primary px-2 py-0.5 rounded bg-primary/10">TASK-104</span>
                    <span className="font-semibold text-sm text-foreground">Implement MCP Stdio Bridge</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Badge variant="outline" className="border-amber-500/40 text-amber-500 text-[10px] font-mono font-semibold">HIGH PRIORITY</Badge>
                    <Badge variant="secondary" className="text-[10px] font-mono">IN PROGRESS</Badge>
                  </div>
                </div>

                {/* Task Metadata row */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] font-mono bg-muted/30 p-2.5 rounded-lg border border-border/60">
                  <div>
                    <span className="text-muted-foreground block text-[10px]">ASSIGNEE</span>
                    <span className="text-foreground font-medium">crewmate-4</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block text-[10px]">BRANCH</span>
                    <span className="text-foreground font-medium">feat/mcp-bridge</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block text-[10px]">TIME TRACKED</span>
                    <span className="text-foreground font-medium">1h 45m</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block text-[10px]">CROSS-LINKS</span>
                    <span className="text-primary font-medium">@doc/specs/mcp</span>
                  </div>
                </div>

                {/* Acceptance Criteria Checklist */}
                <div className="space-y-2 pt-1">
                  <div className="flex items-center justify-between text-xs font-semibold text-foreground">
                    <span className="flex items-center gap-1.5">
                      <CheckSquare className="h-3.5 w-3.5 text-primary" />
                      Acceptance Criteria Checklist (Agent Verifiable)
                    </span>
                    <span className="font-mono text-[11px] text-muted-foreground">
                      {Object.values(taskCheckedItems).filter(Boolean).length} / 4 passed
                    </span>
                  </div>

                  <div className="space-y-1.5 text-xs">
                    {[
                      "Support standard JSON-RPC 2.0 pipes over child process stdin/stdout",
                      "Zero cloud network roundtrips; read .know-me/ disk state atomically",
                      "Deterministic cross-references resolution for @task/<id> and @doc/<path>",
                      "Run isolated worktree test suite before review-ready milestone transition",
                    ].map((crit, idx) => (
                      <button
                        key={crit}
                        type="button"
                        onClick={() =>
                          setTaskCheckedItems((prev) => ({ ...prev, [idx]: !prev[idx] }))
                        }
                        className="w-full flex items-start gap-2.5 p-2 rounded-md border border-border/60 hover:bg-muted/40 transition-colors text-left cursor-pointer"
                      >
                        <span className={`mt-0.5 h-4 w-4 rounded flex items-center justify-center shrink-0 border ${
                          taskCheckedItems[idx]
                            ? "bg-primary border-primary text-primary-foreground"
                            : "border-muted-foreground/40 bg-background"
                        }`}>
                          {taskCheckedItems[idx] && <Check className="h-3 w-3" />}
                        </span>
                        <span className={taskCheckedItems[idx] ? "line-through text-muted-foreground" : "text-foreground"}>
                          {crit}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Right Column: Copy */}
            <div className="lg:col-span-5 space-y-4 order-1 lg:order-2">
              <div className="inline-flex items-center gap-2 text-primary font-mono text-xs uppercase tracking-wider font-semibold">
                <CheckSquare className="h-4 w-4" />
                <span>Feature 02 · Engineering Execution</span>
              </div>
              <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight text-foreground">
                Tasks: Granular lifecycles, clear acceptance criteria.
              </h2>
              <p className="text-sm sm:text-base text-muted-foreground leading-relaxed">
                Tasks in KnowMe aren't just informal to-do bullets. They are precision engineering contracts with lifecycle transitions (<code className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded">todo</code>, <code className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded">in-progress</code>, <code className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded">review-ready</code>, <code className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded">done</code>, <code className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded">blocked</code>), acceptance checklists, time tracking, and Git worktree links.
              </p>
              <div className="space-y-2.5 pt-2 text-xs text-muted-foreground">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                  <span>Interactive acceptance criteria that AI coding agents read and satisfy</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                  <span>Subtask hierarchies with automatic parent progress recalculation</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                  <span>Audit logging of state transitions stored right inside task markdown files</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ===================================================================
            CORE FEATURE 3: KANBAN (Visual Flow & Stage Transitions)
            =================================================================== */}
        <section id="features-kanban" className="scroll-mt-20 space-y-8 pt-4">
          <div className="grid grid-cols-1 gap-10 lg:grid-cols-12 lg:items-center">
            {/* Left Column: Copy */}
            <div className="lg:col-span-5 space-y-4">
              <div className="inline-flex items-center gap-2 text-primary font-mono text-xs uppercase tracking-wider font-semibold">
                <Kanban className="h-4 w-4" />
                <span>Feature 03 · Visual Workflow</span>
              </div>
              <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight text-foreground">
                Kanban: Calm, high-density stage visibility.
              </h2>
              <p className="text-sm sm:text-base text-muted-foreground leading-relaxed">
                A fluid Kanban board engineered for developer speed. Move work across stages without loading spinners, visualize work-in-progress (WIP), and monitor background subagents moving tasks through milestone review gates in real-time.
              </p>
              <div className="space-y-2.5 pt-2 text-xs text-muted-foreground">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                  <span>WIP visibility across Backlog, In Progress, Review, and Done</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                  <span>Filter by hashtag, assignee, milestone, or priority at keyboard speed</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                  <span>Smooth drag-and-drop or one-key stage advancement</span>
                </div>
              </div>
            </div>

            {/* Right Column: Visual Mock for Kanban */}
            <div className="lg:col-span-7">
              <div className="rounded-xl border border-border/90 bg-card p-4 sm:p-5 shadow-xs space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-border/70 text-xs">
                  <span className="font-semibold text-foreground flex items-center gap-1.5">
                    <Kanban className="h-3.5 w-3.5 text-primary" />
                    Active Sprint Board
                  </span>
                  <span className="font-mono text-muted-foreground text-[11px]">8 active items · 0 blocked</span>
                </div>

                {/* Kanban 4 Columns */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  {/* Column 1: Backlog */}
                  <div className="rounded-lg bg-muted/30 p-2 border border-border/60 space-y-2">
                    <div className="flex items-center justify-between text-[11px] font-mono font-semibold text-muted-foreground pb-1 border-b border-border/40">
                      <span>BACKLOG</span>
                      <span className="px-1.5 py-0.2 rounded bg-muted text-[10px]">2</span>
                    </div>
                    <div className="p-2 rounded bg-background border border-border/70 shadow-2xs space-y-1">
                      <div className="text-[11px] font-medium text-foreground leading-tight">SQLite index optimization</div>
                      <div className="flex items-center justify-between text-[10px] font-mono text-muted-foreground">
                        <span>#perf</span>
                        <span>TASK-108</span>
                      </div>
                    </div>
                    <div className="p-2 rounded bg-background border border-border/70 shadow-2xs space-y-1">
                      <div className="text-[11px] font-medium text-foreground leading-tight">Export to Markdown zip</div>
                      <div className="flex items-center justify-between text-[10px] font-mono text-muted-foreground">
                        <span>#export</span>
                        <span>TASK-112</span>
                      </div>
                    </div>
                  </div>

                  {/* Column 2: In Progress */}
                  <div className="rounded-lg bg-muted/30 p-2 border border-border/60 space-y-2">
                    <div className="flex items-center justify-between text-[11px] font-mono font-semibold text-primary pb-1 border-b border-border/40">
                      <span>IN PROGRESS</span>
                      <span className="px-1.5 py-0.2 rounded bg-primary/10 text-primary text-[10px]">1</span>
                    </div>
                    <div className="p-2 rounded bg-background border border-primary/40 shadow-2xs space-y-1">
                      <div className="text-[11px] font-medium text-foreground leading-tight">MCP Stdio Bridge</div>
                      <div className="flex items-center justify-between text-[10px] font-mono text-primary">
                        <span>#mcp</span>
                        <span className="font-semibold">TASK-104</span>
                      </div>
                      <div className="h-1 w-full bg-muted rounded-full overflow-hidden">
                        <div className="h-full bg-primary w-3/4" />
                      </div>
                    </div>
                  </div>

                  {/* Column 3: Review */}
                  <div className="rounded-lg bg-muted/30 p-2 border border-border/60 space-y-2">
                    <div className="flex items-center justify-between text-[11px] font-mono font-semibold text-amber-500 pb-1 border-b border-border/40">
                      <span>REVIEW</span>
                      <span className="px-1.5 py-0.2 rounded bg-amber-500/10 text-amber-500 text-[10px]">1</span>
                    </div>
                    <div className="p-2 rounded bg-background border border-border/70 shadow-2xs space-y-1">
                      <div className="text-[11px] font-medium text-foreground leading-tight">ONNX Vector Runtime</div>
                      <div className="flex items-center justify-between text-[10px] font-mono text-muted-foreground">
                        <span>#ai</span>
                        <span>TASK-101</span>
                      </div>
                    </div>
                  </div>

                  {/* Column 4: Done */}
                  <div className="rounded-lg bg-muted/30 p-2 border border-border/60 space-y-2">
                    <div className="flex items-center justify-between text-[11px] font-mono font-semibold text-emerald-500 pb-1 border-b border-border/40">
                      <span>DONE</span>
                      <span className="px-1.5 py-0.2 rounded bg-emerald-500/10 text-emerald-500 text-[10px]">4</span>
                    </div>
                    <div className="p-2 rounded bg-background/60 border border-border/50 text-muted-foreground space-y-1">
                      <div className="text-[11px] line-through leading-tight">Theme transition tokens</div>
                      <div className="text-[10px] font-mono">TASK-098</div>
                    </div>
                    <div className="p-2 rounded bg-background/60 border border-border/50 text-muted-foreground space-y-1">
                      <div className="text-[11px] line-through leading-tight">CLI help auto-generation</div>
                      <div className="text-[10px] font-mono">TASK-095</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ===================================================================
            CORE FEATURE 4: SAVED LINKS (Reading List & URL Bookmarking)
            =================================================================== */}
        <section id="features-links" className="scroll-mt-20 space-y-8 pt-4">
          <div className="grid grid-cols-1 gap-10 lg:grid-cols-12 lg:items-center">
            {/* Left Column: Visual Mock for Saved Links */}
            <div className="lg:col-span-7 order-2 lg:order-1">
              <div className="rounded-xl border border-border/90 bg-card p-5 shadow-xs space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-border/70">
                  <div className="flex items-center gap-2">
                    <Bookmark className="h-4 w-4 text-primary" />
                    <span className="font-semibold text-sm text-foreground">Saved Links & Reading List</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-mono">
                    <Search className="h-3 w-3" />
                    <span>Auto-tagged · Searchable</span>
                  </div>
                </div>

                <div className="space-y-2">
                  {[
                    {
                      title: "Model Context Protocol Specification",
                      url: "https://modelcontextprotocol.io/specification",
                      domain: "modelcontextprotocol.io",
                      tags: ["#mcp", "#spec", "#ai-agents"],
                      added: "Saved 2d ago",
                    },
                    {
                      title: "uv: Extremely Fast Python Package Installer and Resolver",
                      url: "https://github.com/astral-sh/uv",
                      domain: "github.com",
                      tags: ["#python", "#tools", "#cli"],
                      added: "Saved 4d ago",
                    },
                    {
                      title: "Local Vector Search with ONNX Embeddings in Rust",
                      url: "https://antigravity.dev/blog/onnx-embeddings-rust",
                      domain: "antigravity.dev",
                      tags: ["#embeddings", "#rust", "#search"],
                      added: "Saved 1w ago",
                    },
                  ].map((item) => (
                    <div
                      key={item.title}
                      className="p-3 rounded-lg border border-border/70 bg-muted/20 hover:bg-muted/40 transition-colors space-y-1.5"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="font-medium text-xs text-foreground hover:text-primary transition-colors flex items-center gap-1.5">
                          <Link2 className="h-3.5 w-3.5 text-primary shrink-0" />
                          <span>{item.title}</span>
                        </div>
                        <span className="font-mono text-[10px] text-muted-foreground shrink-0">{item.domain}</span>
                      </div>
                      <div className="flex items-center justify-between text-[10px] font-mono text-muted-foreground pt-1">
                        <div className="flex items-center gap-1.5">
                          {item.tags.map((t) => (
                            <span key={t} className="px-1.5 py-0.2 rounded bg-muted text-foreground">
                              {t}
                            </span>
                          ))}
                        </div>
                        <span>{item.added}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Right Column: Copy */}
            <div className="lg:col-span-5 space-y-4 order-1 lg:order-2">
              <div className="inline-flex items-center gap-2 text-primary font-mono text-xs uppercase tracking-wider font-semibold">
                <Bookmark className="h-4 w-4" />
                <span>Feature 04 · Reading & Research</span>
              </div>
              <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight text-foreground">
                Saved Links: Your personal developer web archive.
              </h2>
              <p className="text-sm sm:text-base text-muted-foreground leading-relaxed">
                Bookmark libraries, RFC proposals, blogs, and API references without tab overload or third-party cloud bookmarks. KnowMe extracts domains, auto-tags topics, and indexes snippets locally so you and your coding agents can reference them anytime.
              </p>
              <div className="space-y-2.5 pt-2 text-xs text-muted-foreground">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                  <span>Automatic domain extraction and title resolution</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                  <span>Hashtag filtering for quick domain categorisation</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                  <span>Available to AI agents as verified reading material via MCP tools</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ===================================================================
            CORE FEATURE 5: MEMOS (Fast Scratchpad & Hashtag Capture)
            =================================================================== */}
        <section id="features-memos" className="scroll-mt-20 space-y-8 pt-4">
          <div className="grid grid-cols-1 gap-10 lg:grid-cols-12 lg:items-center">
            {/* Left Column: Copy */}
            <div className="lg:col-span-5 space-y-4">
              <div className="inline-flex items-center gap-2 text-primary font-mono text-xs uppercase tracking-wider font-semibold">
                <Hash className="h-4 w-4" />
                <span>Feature 05 · Global Scratchpad</span>
              </div>
              <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight text-foreground">
                Memos: Rapid capture without workspace friction.
              </h2>
              <p className="text-sm sm:text-base text-muted-foreground leading-relaxed">
                Spontaneous engineering insights, quick code snippets, and bug reproductions don't belong in formal specs. Memos offer a zero-friction capture pad with instant hashtag taxonomy (<code className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded">#ideas</code>, <code className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded">#bugs</code>, <code className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded">#rfc</code>). Accessible globally, even without an active project.
              </p>
              <div className="space-y-2.5 pt-2 text-xs text-muted-foreground">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                  <span>Global access across projects for cross-cutting thoughts</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                  <span>Instant hashtag classification without folder hierarchies</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                  <span>Pin crucial thoughts to keep them top-of-mind</span>
                </div>
              </div>
            </div>

            {/* Right Column: Visual Mock for Memos */}
            <div className="lg:col-span-7">
              <div className="rounded-xl border border-border/90 bg-card p-5 shadow-xs space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-border/70">
                  <div className="flex items-center gap-2">
                    <Hash className="h-4 w-4 text-primary" />
                    <span className="font-semibold text-sm text-foreground">Global Engineering Memos</span>
                  </div>
                  <div className="flex items-center gap-1">
                    {["all", "ideas", "bugs", "rfc"].map((tag) => (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => setActiveMemoTag(tag)}
                        className={`text-[11px] font-mono px-2 py-0.5 rounded cursor-pointer transition-colors ${
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

                <div className="space-y-2.5">
                  {[
                    {
                      content: "Remember to enforce POSIX path separators when building subagent worktrees on Windows WSL. Prevents path truncation bugs.",
                      tag: "bugs",
                      date: "2 hours ago",
                      pinned: true,
                    },
                    {
                      content: "Idea for hybrid ranking: weight exact BM25 keyword matches 60% and cosine distance on ONNX embeddings 40% for optimal developer term precision.",
                      tag: "ideas",
                      date: "Yesterday",
                      pinned: false,
                    },
                    {
                      content: "RFC: Draft subagent lifecycle transition hooks so GitHub status checks update when crewmate runs pass or fail.",
                      tag: "rfc",
                      date: "3 days ago",
                      pinned: false,
                    },
                  ]
                    .filter((m) => activeMemoTag === "all" || m.tag === activeMemoTag)
                    .map((m) => (
                      <div
                        key={m.content}
                        className="p-3 rounded-lg border border-border/70 bg-muted/20 space-y-1.5"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-xs text-foreground leading-relaxed">{m.content}</p>
                          {m.pinned && (
                            <Pin className="h-3.5 w-3.5 text-primary shrink-0 fill-primary/30" />
                          )}
                        </div>
                        <div className="flex items-center justify-between text-[10px] font-mono text-muted-foreground pt-1 border-t border-border/40">
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
            CORE FEATURE 6: DOCS (Living Specs & Architecture Markdown)
            =================================================================== */}
        <section id="features-docs" className="scroll-mt-20 space-y-8 pt-4">
          <div className="grid grid-cols-1 gap-10 lg:grid-cols-12 lg:items-center">
            {/* Left Column: Visual Mock for Docs */}
            <div className="lg:col-span-7 order-2 lg:order-1">
              <div className="rounded-xl border border-border/90 bg-card p-5 shadow-xs space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-border/70">
                  <div className="flex items-center gap-2">
                    <FileCode2 className="h-4 w-4 text-primary" />
                    <span className="font-semibold text-sm text-foreground">docs/architecture/mcp-bridge.md</span>
                  </div>
                  <Badge variant="outline" className="text-[10px] font-mono text-primary border-primary/30">
                    APPROVED SPEC
                  </Badge>
                </div>

                {/* Editorial Doc View */}
                <div className="rounded-lg border border-border/70 bg-background/80 p-4 space-y-3 font-sans text-xs">
                  <div className="space-y-1">
                    <h4 className="text-base font-semibold text-foreground tracking-tight">
                      Model Context Protocol Stdio Transport Architecture
                    </h4>
                    <p className="text-[11px] text-muted-foreground font-mono">
                      Last edited by team · Linked with <span className="text-primary font-semibold">@task/TASK-104</span>
                    </p>
                  </div>

                  <p className="text-muted-foreground leading-relaxed">
                    This specification governs how AI coding harnesses (Claude Code, Cursor, Codex) establish low-latency bidirectional IPC over UNIX standard input/output pipes.
                  </p>

                  <div className="rounded bg-muted/60 p-2.5 font-mono text-[11px] border border-border/60 text-foreground space-y-1">
                    <div className="text-muted-foreground">// JSON-RPC stdio initialization</div>
                    <div className="text-primary">{"{ \"jsonrpc\": \"2.0\", \"method\": \"initialize\", \"id\": 1 }"}</div>
                    <div className="text-foreground">{"→ { \"capabilities\": { \"tools\": { \"listChanged\": true } } }"}</div>
                  </div>

                  <div className="flex items-center gap-3 pt-1 text-[11px] text-muted-foreground font-mono">
                    <span className="flex items-center gap-1">
                      <Tag className="h-3 w-3 text-primary" />
                      <span>References: @task/TASK-104, @doc/specs/subagents</span>
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Right Column: Copy */}
            <div className="lg:col-span-5 space-y-4 order-1 lg:order-2">
              <div className="inline-flex items-center gap-2 text-primary font-mono text-xs uppercase tracking-wider font-semibold">
                <FileText className="h-4 w-4" />
                <span>Feature 06 · Living Specifications</span>
              </div>
              <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight text-foreground">
                Docs: Durable specs and cross-referenced architecture.
              </h2>
              <p className="text-sm sm:text-base text-muted-foreground leading-relaxed">
                Markdown-native architecture decision records (ADRs), system designs, and onboarding blueprints versioned directly inside your Git repository. Deterministic <code className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded">@task/&lt;id&gt;</code> and <code className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded">@doc/&lt;path&gt;</code> anchors allow both developers and AI agents to navigate your codebase without hallucinating nonexistent paths.
              </p>
              <div className="space-y-2.5 pt-2 text-xs text-muted-foreground">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                  <span>Deterministic citation anchors with exact line-range accuracy</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                  <span>Spec status tagging (draft, approved, implemented)</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                  <span>Pure Markdown files stored in .know-me/docs/ on your disk</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ===================================================================
            WORKBENCH INTERACTIVE DEMO SECTION (Terminal & MCP stdio)
            =================================================================== */}
        <section id="workbench-demo" className="scroll-mt-20 space-y-8 pt-4">
          <div className="grid grid-cols-1 gap-12 lg:grid-cols-12 lg:items-start">
            {/* Left Column: Editorial Explanation of MCP Bridge */}
            <div className="lg:col-span-5 space-y-6">
              <div className="space-y-2">
                <p className="font-mono text-xs uppercase tracking-wider text-primary font-semibold">
                  Interactive Workbench
                </p>
                <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl text-foreground">
                  The stdio JSON-RPC MCP bridge in action.
                </h2>
                <p className="text-sm sm:text-base text-muted-foreground leading-relaxed">
                  Coding agents do not need brittle web scrapers or cloud APIs. KnowMe provides a standard Model Context Protocol server that communicates through UNIX pipes via standard I/O (<code className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded">stdin/stdout</code>).
                </p>
              </div>

              {/* Explanatory bullet points */}
              <div className="space-y-4 pt-2">
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-primary/10 text-primary shrink-0 mt-0.5">
                    <Zap className="h-4 w-4" />
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-foreground">Sub-millisecond Local IPC</h4>
                    <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                      Zero network roundtrips. Tools run on your machine and read directly from git-tracked markdown files.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-primary/10 text-primary shrink-0 mt-0.5">
                    <CheckCircle2 className="h-4 w-4" />
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-foreground">Structured Knowledge Packs</h4>
                    <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                      Instead of overwhelming your LLM with raw repository dumps, tools return curated context packs tailored to the active task.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-primary/10 text-primary shrink-0 mt-0.5">
                    <Layers className="h-4 w-4" />
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-foreground">Bidirectional Task Lifecycle</h4>
                    <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                      Agents inspect requirements, execute code in worktrees, and atomically update task statuses without leaving their context window.
                    </p>
                  </div>
                </div>
              </div>

              {/* Quick CLI command */}
              <div className="rounded-lg border border-border/80 bg-muted/30 p-3.5 space-y-2">
                <div className="text-xs font-medium text-foreground">Start the MCP server directly:</div>
                <div className="flex items-center justify-between rounded bg-background px-3 py-1.5 font-mono text-xs border border-border/60">
                  <span className="text-primary font-medium">$ knowme mcp serve</span>
                  <span className="text-[10px] text-muted-foreground">stdio transport</span>
                </div>
              </div>
            </div>

            {/* Right Column: Interactive Syntax-Highlighted Terminal Transcript */}
            <div className="lg:col-span-7">
              <div className="rounded-xl border border-border/90 bg-card overflow-hidden shadow-md">
                {/* Terminal Header & Tabs */}
                <div className="border-b border-border/80 bg-muted/40 p-3 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="h-3 w-3 rounded-full bg-destructive/60" />
                    <span className="h-3 w-3 rounded-full bg-warning/60" />
                    <span className="h-3 w-3 rounded-full bg-success/60" />
                    <span className="ml-2 font-mono text-xs font-medium text-foreground flex items-center gap-1.5">
                      <Terminal className="h-3.5 w-3.5 text-primary" />
                      mcp-terminal
                    </span>
                  </div>

                  {/* Request vs Response toggle */}
                  <div className="flex items-center rounded-md border border-border/80 bg-background/80 p-0.5 text-xs font-mono">
                    <button
                      type="button"
                      onClick={() => setDemoView("response")}
                      className={`px-2 py-1 rounded text-[11px] transition-colors cursor-pointer ${
                        demoView === "response"
                          ? "bg-primary text-primary-foreground font-medium"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      Output Payload
                    </button>
                    <button
                      type="button"
                      onClick={() => setDemoView("request")}
                      className={`px-2 py-1 rounded text-[11px] transition-colors cursor-pointer ${
                        demoView === "request"
                          ? "bg-primary text-primary-foreground font-medium"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      JSON-RPC Request
                    </button>
                  </div>
                </div>

                {/* Tool Selection Tabs */}
                <div className="flex items-center overflow-x-auto border-b border-border/70 bg-muted/20 px-3 py-2 gap-1.5 scrollbar-none">
                  {DEMO_TABS.map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setActiveTabId(tab.id)}
                      className={`font-mono text-xs px-2.5 py-1.5 rounded-md transition-all whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${
                        activeTabId === tab.id
                          ? "bg-background text-primary border border-border/80 font-semibold shadow-xs"
                          : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                      }`}
                    >
                      <span className={`h-1.5 w-1.5 rounded-full ${activeTabId === tab.id ? "bg-primary" : "bg-muted-foreground/50"}`} />
                      {tab.name}
                    </button>
                  ))}
                </div>

                {/* Terminal Content Body */}
                <div className="p-4 sm:p-5 font-mono text-xs space-y-3 bg-card">
                  {/* Tool description & Invocation line */}
                  <div className="flex items-center justify-between pb-2 border-b border-border/50 text-[11px] text-muted-foreground">
                    <span className="truncate max-w-[80%]">{activeTab.description}</span>
                    <button
                      type="button"
                      onClick={() =>
                        copyToClipboard(
                          demoView === "response" ? activeTab.responsePayload : activeTab.requestPayload,
                          "payload"
                        )
                      }
                      className="p-1 rounded hover:bg-muted/80 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                      title="Copy JSON Payload"
                    >
                      {copiedPayload ? (
                        <Check className="h-3.5 w-3.5 text-primary" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </div>

                  {/* Command invocation prompt */}
                  <div className="flex items-center gap-2 text-foreground font-medium bg-muted/40 px-3 py-1.5 rounded border border-border/60">
                    <span className="text-primary font-bold">agent&gt;</span>
                    <span className="text-primary truncate">{activeTab.toolCall}</span>
                  </div>

                  {/* Code Box */}
                  <div className="relative rounded-lg border border-border/70 bg-background/80 p-3.5 overflow-x-auto max-h-[340px]">
                    <pre className="text-[11.5px] font-mono leading-relaxed text-foreground">
                      {demoView === "response" ? activeTab.responsePayload : activeTab.requestPayload}
                    </pre>
                  </div>

                  {/* Stats Bar */}
                  <div className="flex flex-wrap items-center justify-between pt-2 text-[11px] text-muted-foreground font-mono">
                    <div className="flex items-center gap-4">
                      <span>Latency: <strong className="text-primary font-semibold">{activeTab.stats.time}</strong></span>
                      <span>Payload: <strong className="text-foreground">{activeTab.stats.tokens}</strong></span>
                    </div>
                    <div>
                      <span>Source: <strong className="text-foreground">{activeTab.stats.source}</strong></span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ===================================================================
            FAQ ACCORDION SECTION
            =================================================================== */}
        <section id="faq-section" className="scroll-mt-20 space-y-6 max-w-4xl mx-auto pt-4">
          <div className="text-center space-y-2">
            <p className="font-mono text-xs uppercase tracking-wider text-primary font-semibold">
              Clear Answers
            </p>
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl text-foreground">
              Frequently Asked Questions
            </h2>
            <p className="text-sm sm:text-base text-muted-foreground">
              Everything you need to know about KnowMe, data privacy, and the MCP ecosystem.
            </p>
          </div>

          <div className="rounded-xl border border-border/90 bg-card p-6 sm:p-8 shadow-xs">
            <Accordion type="single" collapsible defaultValue="item-1" className="w-full">
              <AccordionItem value="item-1">
                <AccordionTrigger className="text-base font-semibold text-foreground">
                  How does KnowMe protect my project's data privacy?
                </AccordionTrigger>
                <AccordionContent>
                  KnowMe is 100% local-first. All your tasks, memos, documentation, and reading lists are stored in plain Markdown and JSON files under your repository's local <code className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">.know-me/</code> folder. There is no remote cloud database, no tracking cookies, and no telemetry pings. When an AI agent connects via MCP, the communication happens entirely on your machine over local child process stdio pipes.
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="item-2">
                <AccordionTrigger className="text-base font-semibold text-foreground">
                  How does the Model Context Protocol (MCP) integration work?
                </AccordionTrigger>
                <AccordionContent>
                  The Model Context Protocol is an open standard established by Anthropic for connecting AI models to tools and data sources. KnowMe exposes an MCP server implementation that speaks JSON-RPC 2.0 over standard I/O (<code className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">stdio</code>). Coding agents like Claude Code, Cursor, Codex, and Hermes spawn the KnowMe binary as a sub-process, query tools like <code className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">knowme_retrieve</code>, and receive verified context without socket or network overhead.
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="item-3">
                <AccordionTrigger className="text-base font-semibold text-foreground">
                  How is KnowMe different from Notion, Linear, or Obsidian?
                </AccordionTrigger>
                <AccordionContent>
                  Unlike Notion or Linear, KnowMe does not lock your data into a proprietary cloud database with monthly subscription fees and slow remote APIs. Unlike Obsidian, KnowMe is purpose-built for engineering teams and AI-native coding agents: it includes first-class task lifecycles with acceptance criteria, Kanban boards, deterministic cross-references (<code className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">@task/&lt;id&gt;</code>, <code className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">@doc/&lt;path&gt;</code>), and an automated background subagent runner executing in isolated Git worktrees.
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="item-4">
                <AccordionTrigger className="text-base font-semibold text-foreground">
                  Which platforms, operating systems, and agents are supported?
                </AccordionTrigger>
                <AccordionContent>
                  KnowMe runs anywhere POSIX or Node/Bun is supported: macOS (Apple Silicon and Intel), Linux (x86_64 and aarch64), and Windows via WSL2. It integrates out of the box with Claude Code, Cursor, Codex CLI, Hermes Agent, OpenCode, and any custom harness implementing the MCP client specification.
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="item-5">
                <AccordionTrigger className="text-base font-semibold text-foreground">
                  Does KnowMe require a background server daemon to run?
                </AccordionTrigger>
                <AccordionContent>
                  No. The CLI commands read and write directly to your local disk. When you run the web UI, a lightweight local web server starts on localhost to serve the calm interface. When AI agents query via MCP, they spawn the CLI directly over stdio pipes without requiring any daemon to stay running in the background.
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </div>
        </section>

        {/* ===================================================================
            COLOPHON / FOOTER
            =================================================================== */}
        <footer className="border-t border-border/80 pt-12 pb-16 space-y-8">
          <div className="grid grid-cols-1 gap-8 md:grid-cols-4 lg:grid-cols-5">
            {/* Brand Colophon */}
            <div className="md:col-span-2 space-y-3">
              <div className="flex items-center gap-2.5">
                <img
                  src="/logo.png"
                  alt="KnowMe"
                  className="h-7 w-7 rounded-lg border border-border/80 object-cover"
                />
                <span className="font-semibold tracking-tight text-foreground text-sm">
                  KnowMe
                </span>
                <Badge variant="secondary" className="font-mono text-[10px] px-1.5 py-0">
                  v1.12
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed max-w-sm">
                Your personal knowledge database: projects, tasks, docs, memos, and reading lists in one calm, local-first place. Built for developers and AI coding agents.
              </p>
              <div className="pt-2 text-[11px] font-mono text-muted-foreground">
                Licensed under the <span className="text-foreground font-medium">MIT License</span>. Free to fork and self-host.
              </div>
            </div>

            {/* Links: Product */}
            <div className="space-y-2.5 text-xs">
              <div className="font-mono font-semibold uppercase tracking-wider text-foreground text-[11px]">
                Product Features
              </div>
              <ul className="space-y-2 text-muted-foreground">
                <li>
                  <button
                    type="button"
                    onClick={() => scrollToSection("features-projects")}
                    className="hover:text-foreground transition-colors cursor-pointer"
                  >
                    Projects Workspace
                  </button>
                </li>
                <li>
                  <button
                    type="button"
                    onClick={() => scrollToSection("features-tasks")}
                    className="hover:text-foreground transition-colors cursor-pointer"
                  >
                    Engineering Tasks
                  </button>
                </li>
                <li>
                  <button
                    type="button"
                    onClick={() => scrollToSection("features-kanban")}
                    className="hover:text-foreground transition-colors cursor-pointer"
                  >
                    Kanban Board
                  </button>
                </li>
                <li>
                  <button
                    type="button"
                    onClick={() => scrollToSection("features-links")}
                    className="hover:text-foreground transition-colors cursor-pointer"
                  >
                    Saved Links
                  </button>
                </li>
                <li>
                  <button
                    type="button"
                    onClick={() => scrollToSection("features-memos")}
                    className="hover:text-foreground transition-colors cursor-pointer"
                  >
                    Quick Memos
                  </button>
                </li>
                <li>
                  <button
                    type="button"
                    onClick={() => scrollToSection("features-docs")}
                    className="hover:text-foreground transition-colors cursor-pointer"
                  >
                    Living Docs & Specs
                  </button>
                </li>
              </ul>
            </div>

            {/* Links: Developers */}
            <div className="space-y-2.5 text-xs">
              <div className="font-mono font-semibold uppercase tracking-wider text-foreground text-[11px]">
                Developers
              </div>
              <ul className="space-y-2 text-muted-foreground">
                <li>
                  <a
                    href="https://github.com/knowns/know-me"
                    target="_blank"
                    rel="noreferrer"
                    className="hover:text-foreground transition-colors inline-flex items-center gap-1"
                  >
                    <span>GitHub Repository</span>
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </li>
                <li>
                  <a
                    href="https://modelcontextprotocol.io"
                    target="_blank"
                    rel="noreferrer"
                    className="hover:text-foreground transition-colors inline-flex items-center gap-1"
                  >
                    <span>Model Context Protocol</span>
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </li>
                <li>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(installCommand, "install")}
                    className="hover:text-foreground transition-colors inline-flex items-center gap-1 cursor-pointer"
                  >
                    <span>Install Script</span>
                    <Copy className="h-3 w-3" />
                  </button>
                </li>
              </ul>
            </div>

            {/* System Info */}
            <div className="space-y-2.5 text-xs">
              <div className="font-mono font-semibold uppercase tracking-wider text-foreground text-[11px]">
                System Status
              </div>
              <div className="space-y-1.5 font-mono text-[11px] text-muted-foreground">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                  <span>Local Engine: Active</span>
                </div>
                <div>Storage: .know-me/ disk</div>
                <div>Protocol: MCP JSON-RPC 2.0</div>
              </div>
            </div>
          </div>

          {/* Bottom Bar */}
          <div className="border-t border-border/60 pt-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-muted-foreground">
            <div>
              © 2026 KnowMe Authors. Open source under MIT.
            </div>
            <div className="flex items-center gap-4">
              <a
                href="http://localhost:6421"
                target="_blank"
                rel="noreferrer"
                className="hover:text-foreground transition-colors cursor-pointer font-medium text-primary"
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
