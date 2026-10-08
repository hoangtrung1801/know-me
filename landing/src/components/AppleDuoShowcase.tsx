import { useState, type MouseEvent } from "react";
import {
  Bot,
  CheckCircle2,
  Cpu,
  FileText,
  FolderGit2,
  Kanban,
  Layers,
  Sparkles,
  Terminal,
  Zap,
  ArrowRight,
  Split,
  Eye,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";

type ViewMode = "duo" | "human" | "agent";

export function AppleDuoShowcase() {
  const [viewMode, setViewMode] = useState<ViewMode>("duo");
  const [activeTaskChecked, setActiveTaskChecked] = useState<boolean[]>([true, true, false]);

  return (
    <div className="w-full space-y-6">
      {/* Perspective Switcher (Apple Segments) */}
      <div className="flex justify-center">
        <div className="inline-flex p-1 rounded-full apple-glass-pill text-xs font-mono">
          <button
            type="button"
            onClick={() => setViewMode("duo")}
            className={`px-4 py-1.5 rounded-full transition-all duration-200 cursor-pointer flex items-center gap-1.5 ${
              viewMode === "duo"
                ? "bg-white/15 text-white font-semibold shadow-xs"
                : "text-[#86868b] hover:text-white"
            }`}
          >
            <Split className="h-3.5 w-3.5" />
            <span>Duo Perspective</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode("human")}
            className={`px-4 py-1.5 rounded-full transition-all duration-200 cursor-pointer flex items-center gap-1.5 ${
              viewMode === "human"
                ? "bg-white/15 text-white font-semibold shadow-xs"
                : "text-[#86868b] hover:text-white"
            }`}
          >
            <Eye className="h-3.5 w-3.5" />
            <span>Human Workspace</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode("agent")}
            className={`px-4 py-1.5 rounded-full transition-all duration-200 cursor-pointer flex items-center gap-1.5 ${
              viewMode === "agent"
                ? "bg-white/15 text-white font-semibold shadow-xs"
                : "text-[#86868b] hover:text-white"
            }`}
          >
            <Cpu className="h-3.5 w-3.5" />
            <span>AI Agent Core</span>
          </button>
        </div>
      </div>

      {/* Dual Device Frame */}
      <div className="apple-device-frame rounded-[28px] sm:rounded-[36px] p-3 sm:p-5 glass-reflection relative overflow-hidden">
        {/* Subtle Ambient Radial Highlight */}
        <div className="pointer-events-none absolute inset-0 bg-radial from-white/[0.04] via-transparent to-transparent opacity-60" />

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 relative z-10">
          {/* Side A: Human Workspace */}
          {(viewMode === "duo" || viewMode === "human") && (
            <div
              className={`${
                viewMode === "duo" ? "lg:col-span-6" : "lg:col-span-12"
              } rounded-2xl bg-[#09090d]/90 border border-white/10 p-4 sm:p-5 space-y-4 shadow-xl transition-all duration-300`}
            >
              {/* Header */}
              <div className="flex items-center justify-between border-b border-white/10 pb-3">
                <div className="flex items-center gap-2">
                  <div className="flex gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full bg-white/20" />
                    <span className="h-2.5 w-2.5 rounded-full bg-white/20" />
                    <span className="h-2.5 w-2.5 rounded-full bg-white/20" />
                  </div>
                  <span className="font-mono text-xs text-[#86868b] ml-1">
                    Human Workspace · Web UI
                  </span>
                </div>
                <Badge
                  variant="outline"
                  className="text-[10px] font-mono border-white/15 text-white bg-white/5"
                >
                  Localhost:6421
                </Badge>
              </div>

              {/* Kanban & Task Snapshot */}
              <div className="space-y-3 font-sans">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-white flex items-center gap-1.5">
                    <Kanban className="h-3.5 w-3.5 text-[#2997ff]" />
                    Sprint Board
                  </span>
                  <span className="font-mono text-[#86868b] text-[11px]">
                    4 columns · 8 tasks
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div className="p-2.5 rounded-xl bg-white/[0.03] border border-white/5 space-y-1">
                    <div className="text-[10px] font-mono text-[#86868b] font-semibold">
                      IN PROGRESS
                    </div>
                    <div className="text-white font-medium text-[11.5px] truncate">
                      TASK-104: MCP Stdio Bridge
                    </div>
                    <div className="text-[10px] font-mono text-[#2997ff]">
                      crewmate-4 (75%)
                    </div>
                  </div>

                  <div className="p-2.5 rounded-xl bg-white/[0.03] border border-white/5 space-y-1">
                    <div className="text-[10px] font-mono text-[#86868b] font-semibold">
                      REVIEW
                    </div>
                    <div className="text-white font-medium text-[11.5px] truncate">
                      TASK-101: ONNX Embeddings
                    </div>
                    <div className="text-[10px] font-mono text-amber-400">
                      milestone gate
                    </div>
                  </div>

                  <div className="p-2.5 rounded-xl bg-white/[0.03] border border-white/5 space-y-1">
                    <div className="text-[10px] font-mono text-[#86868b] font-semibold">
                      DONE
                    </div>
                    <div className="text-white/60 font-medium text-[11.5px] line-through truncate">
                      TASK-098: Theme Tokens
                    </div>
                    <div className="text-[10px] font-mono text-emerald-400">
                      verified
                    </div>
                  </div>
                </div>
              </div>

              {/* Living Spec Markdown Preview */}
              <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/10 space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-white font-medium text-xs">
                    <FileText className="h-3.5 w-3.5 text-[#2997ff]" />
                    <span>docs/architecture/mcp-bridge.md</span>
                  </div>
                  <span className="text-[10px] font-mono text-[#86868b]">
                    Git Markdown
                  </span>
                </div>

                <p className="text-[#86868b] text-[11px] leading-relaxed">
                  Establishes bidirectional JSON-RPC pipes over child process stdin/stdout with deterministic anchors.
                </p>

                <div className="flex items-center gap-2 pt-1 font-mono text-[10px]">
                  <span className="px-1.5 py-0.5 rounded bg-white/10 text-white font-semibold">
                    @task/TASK-104
                  </span>
                  <span className="text-[#86868b]">→ Connected</span>
                </div>
              </div>

              <div className="flex items-center justify-between text-[11px] font-mono text-[#86868b] pt-1">
                <span className="flex items-center gap-1.5">
                  <FolderGit2 className="h-3.5 w-3.5 text-[#2997ff]" />
                  Storage: .know-me/ disk
                </span>
                <span className="text-white font-medium">100% Offline</span>
              </div>
            </div>
          )}

          {/* Side B: AI Agent Core */}
          {(viewMode === "duo" || viewMode === "agent") && (
            <div
              className={`${
                viewMode === "duo" ? "lg:col-span-6" : "lg:col-span-12"
              } rounded-2xl bg-[#060608]/95 border border-white/10 p-4 sm:p-5 space-y-4 shadow-xl transition-all duration-300 font-mono text-xs`}
            >
              {/* Header */}
              <div className="flex items-center justify-between border-b border-white/10 pb-3">
                <div className="flex items-center gap-2">
                  <Bot className="h-4 w-4 text-[#2997ff]" />
                  <span className="font-mono text-xs text-white font-medium">
                    AI Agent Core · MCP stdio
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse-glow" />
                  <span className="font-mono text-[10.5px] text-emerald-400 font-semibold">
                    0ms IPC latency
                  </span>
                </div>
              </div>

              {/* Agent Tool Call Bubble */}
              <div className="p-3 rounded-xl bg-white/[0.03] border border-white/10 space-y-2">
                <div className="flex items-center gap-2 text-white font-semibold text-[11.5px]">
                  <span className="text-[#2997ff]">agent&gt;</span>
                  <span>knowme_retrieve(task="TASK-104")</span>
                </div>
                <div className="text-[10.5px] text-[#86868b] font-sans">
                  Query resolved via stdio JSON-RPC 2.0 pipe from local disk:
                </div>

                <div className="rounded-lg bg-black/60 p-2.5 font-mono text-[10.5px] border border-white/5 space-y-1 text-white">
                  <div className="text-[#86868b]"># Acceptance Criteria Verified:</div>
                  <div className="flex items-center gap-1.5 text-emerald-400">
                    <CheckCircle2 className="h-3 w-3 shrink-0" />
                    <span>Stdio pipes active over stdin/stdout</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-emerald-400">
                    <CheckCircle2 className="h-3 w-3 shrink-0" />
                    <span>Zero cloud roundtrips (local cache hit)</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-white/60">
                    <span className="h-2.5 w-2.5 rounded-full border border-white/40" />
                    <span>Milestone review gate pending</span>
                  </div>
                </div>
              </div>

              {/* Structured Context Pack Metrics */}
              <div className="grid grid-cols-3 gap-2 text-[10px]">
                <div className="p-2 rounded-lg bg-white/[0.02] border border-white/5">
                  <span className="text-[#86868b] block">RETRIEVAL</span>
                  <span className="text-emerald-400 font-semibold text-[11px]">8ms</span>
                </div>
                <div className="p-2 rounded-lg bg-white/[0.02] border border-white/5">
                  <span className="text-[#86868b] block">TOKENS</span>
                  <span className="text-white font-semibold text-[11px]">1,420</span>
                </div>
                <div className="p-2 rounded-lg bg-white/[0.02] border border-white/5">
                  <span className="text-[#86868b] block">SCORE</span>
                  <span className="text-[#2997ff] font-semibold text-[11px]">0.98</span>
                </div>
              </div>

              {/* Agent compatibility */}
              <div className="flex items-center justify-between text-[10.5px] text-[#86868b] pt-1">
                <span>Claude Code · Cursor · Codex · Hermes</span>
                <span className="text-white font-medium">Auto-detected</span>
              </div>
            </div>
          )}
        </div>

        {/* Bottom Duo Interconnect Ribbon */}
        <div className="mt-4 pt-3 border-t border-white/10 flex flex-wrap items-center justify-between gap-3 text-xs font-mono text-[#86868b]">
          <div className="flex items-center gap-2 text-white">
            <Zap className="h-3.5 w-3.5 text-[#2997ff]" />
            <span>The Duo Bridge: Human edits task → Agent executes in worktree → Status syncs atomically</span>
          </div>
          <span className="text-[11px] text-[#86868b]">POSIX stdio pipes</span>
        </div>
      </div>
    </div>
  );
}

export default AppleDuoShowcase;
