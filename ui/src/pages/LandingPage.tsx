import { useState, useCallback, type MouseEvent } from "react";
import { useNavigate } from "@tanstack/react-router";
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
} from "lucide-react";
import { Button } from "@/ui/components/ui/button";
import { Badge } from "@/ui/components/ui/badge";
import { ThemeToggle } from "@/ui/components/atoms/ThemeToggle";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/ui/components/ui/accordion";
import { useTheme } from "@/ui/App";
import logoImage from "../public/logo.png";

interface LandingPageProps {
  onLaunchWorkspace?: () => void;
  isDark?: boolean;
  onToggleTheme?: (event: MouseEvent<HTMLButtonElement>) => void;
}

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

export function LandingPage({
  onLaunchWorkspace,
  isDark: propIsDark,
  onToggleTheme: propOnToggleTheme,
}: LandingPageProps) {
  const navigate = useNavigate();
  const themeContext = useTheme();

  const isDark = propIsDark !== undefined ? propIsDark : themeContext.isDark;
  const toggleTheme = propOnToggleTheme || themeContext.toggle;

  const [copiedInstall, setCopiedInstall] = useState(false);
  const [copiedPayload, setCopiedPayload] = useState(false);
  const [activeTabId, setActiveTabId] = useState("retrieve");
  const [demoView, setDemoView] = useState<"response" | "request">("response");

  const installCommand = "curl -fsSL https://knowme.dev/install.sh | sh";

  const handleLaunch = useCallback(() => {
    if (onLaunchWorkspace) {
      onLaunchWorkspace();
    } else {
      navigate({ to: "/" });
    }
  }, [onLaunchWorkspace, navigate]);

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

  return (
    <div className="relative min-h-screen h-full w-full overflow-y-auto bg-background text-foreground selection:bg-accent selection:text-accent-foreground">
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
            <button
              type="button"
              onClick={handleLaunch}
              className="flex items-center gap-2.5 text-left group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md"
            >
              <img
                src={logoImage}
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
            </button>
          </div>

          {/* Nav Links */}
          <nav className="flex items-center gap-2 sm:gap-4">
            <a
              href="https://github.com/knowns/know-me"
              target="_blank"
              rel="noreferrer"
              className="hidden sm:inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1.5 rounded-md hover:bg-muted/60"
            >
              <GitBranch className="h-3.5 w-3.5" />
              <span>GitHub</span>
            </a>

            <button
              type="button"
              onClick={() => {
                const el = document.getElementById("workbench-demo");
                el?.scrollIntoView({ behavior: "smooth" });
              }}
              className="hidden sm:inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1.5 rounded-md hover:bg-muted/60"
            >
              <Terminal className="h-3.5 w-3.5" />
              <span>MCP Protocol</span>
            </button>

            <button
              type="button"
              onClick={() => {
                const el = document.getElementById("faq-section");
                el?.scrollIntoView({ behavior: "smooth" });
              }}
              className="hidden sm:inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1.5 rounded-md hover:bg-muted/60"
            >
              <BookOpen className="h-3.5 w-3.5" />
              <span>FAQ</span>
            </button>

            {/* Theme Toggle */}
            <ThemeToggle
              isDark={isDark}
              onToggle={toggleTheme}
              size="sm"
              className="text-muted-foreground hover:text-foreground"
            />

            {/* Launch Workspace CTA */}
            <Button
              size="sm"
              onClick={handleLaunch}
              className="gap-1.5 shadow-xs font-medium cursor-pointer"
            >
              <span>Launch Workspace</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
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
                  <Button
                    size="lg"
                    onClick={handleLaunch}
                    className="gap-2 font-medium cursor-pointer"
                  >
                    <span>Open Workspace</span>
                    <ArrowRight className="h-4 w-4" />
                  </Button>

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
                    className="shrink-0 p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-background/80 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
            3. BENTO GRID FEATURES (6 irregular tiles)
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
            4. WORKBENCH INTERACTIVE DEMO SECTION (Terminal & MCP stdio)
            =================================================================== */}
        <section id="workbench-demo" className="scroll-mt-20 space-y-8">
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
                      className={`px-2 py-1 rounded text-[11px] transition-colors ${
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
                      className={`px-2 py-1 rounded text-[11px] transition-colors ${
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
                      className="p-1 rounded hover:bg-muted/80 text-muted-foreground hover:text-foreground transition-colors"
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
            5. FAQ ACCORDION SECTION
            =================================================================== */}
        <section id="faq-section" className="scroll-mt-20 space-y-6 max-w-4xl mx-auto">
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
            6. COLOPHON / FOOTER
            =================================================================== */}
        <footer className="border-t border-border/80 pt-12 pb-16 space-y-8">
          <div className="grid grid-cols-1 gap-8 md:grid-cols-4 lg:grid-cols-5">
            {/* Brand Colophon */}
            <div className="md:col-span-2 space-y-3">
              <div className="flex items-center gap-2.5">
                <img
                  src={logoImage}
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
                Product
              </div>
              <ul className="space-y-2 text-muted-foreground">
                <li>
                  <button
                    type="button"
                    onClick={handleLaunch}
                    className="hover:text-foreground transition-colors cursor-pointer"
                  >
                    Launch Workspace
                  </button>
                </li>
                <li>
                  <button
                    type="button"
                    onClick={() => {
                      const el = document.getElementById("workbench-demo");
                      el?.scrollIntoView({ behavior: "smooth" });
                    }}
                    className="hover:text-foreground transition-colors cursor-pointer"
                  >
                    Interactive Workbench
                  </button>
                </li>
                <li>
                  <button
                    type="button"
                    onClick={() => {
                      const el = document.getElementById("faq-section");
                      el?.scrollIntoView({ behavior: "smooth" });
                    }}
                    className="hover:text-foreground transition-colors cursor-pointer"
                  >
                    FAQ & Architecture
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
              <button
                type="button"
                onClick={handleLaunch}
                className="hover:text-foreground transition-colors cursor-pointer font-medium text-primary"
              >
                Go to Workspace →
              </button>
            </div>
          </div>
        </footer>
      </main>
    </div>
  );
}

export default LandingPage;
