import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Users, 
  Bot, 
  Kanban, 
  FileText, 
  Terminal, 
  Database, 
  CheckCircle2, 
  Clock, 
  GitBranch, 
  Search, 
  Cpu, 
  ShieldCheck, 
  Zap,
  ArrowRight,
  Code2
} from "lucide-react";

type Perspective = "human" | "agent";

export function AppleDuoShowcase() {
  const [activePerspective, setActivePerspective] = useState<Perspective>("human");

  return (
    <section id="duo" className="relative py-28 px-4 sm:px-6 max-w-7xl mx-auto overflow-hidden">
      {/* Background radial spotlight with Know-Me Teal theme */}
      <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[850px] h-[650px] rounded-full blur-[140px] pointer-events-none transition-colors duration-700 ${
        activePerspective === "human" ? "bg-[#e0eeea]/80" : "bg-[#eaf0ef]/90"
      }`} />

      {/* Section Header */}
      <div className="text-center max-w-3xl mx-auto space-y-4 mb-14">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#f4f7f7] border border-[#dbe4e2] text-xs font-mono text-[#176b60]">
          <span className="w-1.5 h-1.5 rounded-full bg-[#176b60] animate-pulse" />
          <span>DUAL PERSPECTIVE ARCHITECTURE</span>
        </div>
        <h2 className="text-4xl sm:text-6xl font-black tracking-[-0.03em] text-titanium leading-tight">
          The Duo Architecture.
        </h2>
        <p className="text-lg sm:text-xl text-[#5c706f] font-medium">
          The same atomic record simultaneously serves human vision and autonomous agent cognition. 
          Switch the lens to see how both experience KnowMe.
        </p>

        {/* Dual Mode Switcher Pill */}
        <div className="pt-4 flex justify-center">
          <div className="apple-glass-pill p-1.5 rounded-full flex items-center gap-1 border border-[#dbe4e2]">
            <button
              type="button"
              onClick={() => setActivePerspective("human")}
              className={`flex items-center gap-2.5 px-6 py-2.5 rounded-full text-xs sm:text-sm font-semibold transition-all duration-200 active:scale-95 ${
                activePerspective === "human"
                  ? "bg-[#176b60] text-white shadow-md shadow-[#176b60]/20"
                  : "text-[#5c706f] hover:text-[#202d31]"
              }`}
            >
              <Users className="w-4 h-4" />
              <span>Human Workspace</span>
            </button>
            <button
              type="button"
              onClick={() => setActivePerspective("agent")}
              className={`flex items-center gap-2.5 px-6 py-2.5 rounded-full text-xs sm:text-sm font-semibold transition-all duration-200 active:scale-95 ${
                activePerspective === "agent"
                  ? "bg-[#176b60] text-white shadow-md shadow-[#176b60]/20"
                  : "text-[#5c706f] hover:text-[#202d31]"
              }`}
            >
              <Bot className="w-4 h-4" />
              <span>AI Agent Core</span>
            </button>
          </div>
        </div>
      </div>

      {/* Duo Interactive Device Frame */}
      <div className="relative rounded-3xl p-1 bg-gradient-to-b from-[#176b60]/20 via-[#dbe4e2]/60 to-[#dbe4e2]/20 shadow-xl">
        <div className="bg-[#ffffff] rounded-[22px] border border-[#dbe4e2] p-4 sm:p-8 overflow-hidden min-h-[580px] flex flex-col justify-between shadow-sm">
          {/* Frame Top Bar */}
          <div className="flex items-center justify-between pb-6 border-b border-[#dbe4e2] mb-6">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-red-400" />
              <div className="w-3 h-3 rounded-full bg-amber-400" />
              <div className="w-3 h-3 rounded-full bg-[#176b60]" />
              <span className="ml-3 text-xs font-mono text-[#5c706f] hidden sm:inline-block">
                knowme://workspace/orchestration-core
              </span>
            </div>

            <div className="flex items-center gap-3">
              <span className="text-xs font-mono px-2.5 py-1 rounded-md bg-[#e0eeea] text-[#176b60] font-semibold border border-[#176b60]/20">
                {activePerspective === "human" ? "VIEW: VISUAL WORKSPACE" : "VIEW: AGENT STDIO PROTOCOL"}
              </span>
            </div>
          </div>

          {/* Perspective Dynamic Content with Apple Spring Transition */}
          <AnimatePresence mode="wait">
            {activePerspective === "human" ? (
              <motion.div
                key="human"
                initial={{ opacity: 0, x: -30, filter: "blur(8px)" }}
                animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
                exit={{ opacity: 0, x: 30, filter: "blur(8px)" }}
                transition={{ type: "spring", bounce: 0, duration: 0.45 }}
                className="grid grid-cols-1 lg:grid-cols-12 gap-6 flex-1 items-stretch"
              >
                {/* Left: Kanban Board & Doc Cards */}
                <div className="lg:col-span-8 flex flex-col gap-5">
                  <div className="apple-card rounded-2xl p-5 space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Kanban className="w-4 h-4 text-[#176b60]" />
                        <h4 className="text-sm font-bold text-[#202d31] tracking-tight">Interactive Kanban Board</h4>
                      </div>
                      <span className="text-xs text-[#5c706f] font-mono">Project: Core Engine</span>
                    </div>

                    {/* Columns Preview */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      {/* In Progress Column */}
                      <div className="rounded-xl bg-[#f4f7f7] border border-[#dbe4e2] p-3 space-y-2.5">
                        <div className="flex items-center justify-between text-xs font-semibold text-[#202d31]">
                          <span className="flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-[#176b60]" />
                            In Progress
                          </span>
                          <span className="text-[11px] px-1.5 rounded bg-[#e0eeea] text-[#176b60] font-mono font-bold">1</span>
                        </div>
                        <div className="rounded-lg bg-white border border-[#dbe4e2] p-3 space-y-2 shadow-xs hover:border-[#176b60] transition-all cursor-pointer">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#e0eeea] text-[#176b60] font-bold">
                              KM-104
                            </span>
                            <span className="text-[10px] text-[#5c706f] flex items-center gap-1">
                              <Clock className="w-3 h-3" /> P1
                            </span>
                          </div>
                          <p className="text-xs font-semibold text-[#202d31] leading-snug">
                            Implement Apple Duo spring transitions & pill nav
                          </p>
                          <div className="flex items-center justify-between pt-1 text-[11px] text-[#5c706f] border-t border-[#dbe4e2]">
                            <span className="flex items-center gap-1 text-[#176b60] font-medium">
                              <CheckCircle2 className="w-3 h-3" /> 4/4 criteria
                            </span>
                            <span className="font-mono text-[10px]">@doc/spec-duo</span>
                          </div>
                        </div>
                      </div>

                      {/* In Review Column */}
                      <div className="rounded-xl bg-[#f4f7f7] border border-[#dbe4e2] p-3 space-y-2.5">
                        <div className="flex items-center justify-between text-xs font-semibold text-[#202d31]">
                          <span className="flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-amber-500" />
                            In Review
                          </span>
                          <span className="text-[11px] px-1.5 rounded bg-amber-100 text-amber-800 font-mono font-bold">1</span>
                        </div>
                        <div className="rounded-lg bg-white border border-[#dbe4e2] p-3 space-y-2 shadow-xs">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 font-bold">
                              KM-103
                            </span>
                            <span className="text-[10px] text-[#5c706f]">Autonomous</span>
                          </div>
                          <p className="text-xs font-semibold text-[#202d31] leading-snug">
                            MCP Protocol validation for stdio subagents
                          </p>
                          <div className="flex items-center justify-between pt-1 text-[11px] text-[#5c706f] border-t border-[#dbe4e2]">
                            <span className="text-[#5c706f]">Agent: Firstmate</span>
                            <span className="text-[#176b60] text-[10px] font-bold">Verified</span>
                          </div>
                        </div>
                      </div>

                      {/* Done Column */}
                      <div className="rounded-xl bg-[#f4f7f7] border border-[#dbe4e2] p-3 space-y-2.5">
                        <div className="flex items-center justify-between text-xs font-semibold text-[#202d31]">
                          <span className="flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-[#176b60]" />
                            Done
                          </span>
                          <span className="text-[11px] px-1.5 rounded bg-[#e0eeea] text-[#176b60] font-mono font-bold">2</span>
                        </div>
                        <div className="rounded-lg bg-white border border-[#dbe4e2] p-3 space-y-1 opacity-75">
                          <span className="text-[10px] font-mono text-[#5c706f]">KM-101</span>
                          <p className="text-xs font-medium text-[#202d31]">Local-first SQLite & Markdown sync</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Document preview snippet */}
                  <div className="apple-card rounded-2xl p-5 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <FileText className="w-4 h-4 text-[#176b60]" />
                        <h4 className="text-sm font-bold text-[#202d31] tracking-tight">Durable Knowledge Spec</h4>
                      </div>
                      <span className="text-xs text-[#5c706f] font-mono">docs/architecture/duo-core.md</span>
                    </div>
                    <div className="p-3.5 rounded-xl bg-[#f4f7f7] border border-[#dbe4e2] font-mono text-xs text-[#202d31] space-y-1.5 leading-relaxed">
                      <p className="text-[#176b60] font-bold"># Architecture: Single Source of Truth</p>
                      <p className="text-[#5c706f]">Tasks, documents, and quick memos are stored as plain Markdown & JSON in <span className="text-[#202d31] font-semibold">.know-me/</span>.</p>
                      <p className="text-[#5c706f]">→ Humans navigate via rich browser UI; AI coding agents consume via atomic MCP tools.</p>
                    </div>
                  </div>
                </div>

                {/* Right: Human Highlights */}
                <div className="lg:col-span-4 flex flex-col justify-between apple-card rounded-2xl p-6 border-[#176b60]/20 bg-gradient-to-b from-[#e0eeea]/30 to-white">
                  <div className="space-y-4">
                    <div className="w-10 h-10 rounded-xl bg-[#e0eeea] border border-[#176b60]/20 flex items-center justify-center text-[#176b60]">
                      <Users className="w-5 h-5" />
                    </div>
                    <h3 className="text-xl font-bold text-[#202d31] tracking-tight">
                      Designed for Human Clarity
                    </h3>
                    <p className="text-sm text-[#5c706f] leading-relaxed">
                      No opaque agent side-effects. Inspect every plan, approve delivery gates, and manipulate tasks across tactile boards with Apple-grade polish.
                    </p>
                    <ul className="space-y-2.5 text-xs text-[#202d31] pt-2">
                      <li className="flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-[#176b60]" />
                        <span>Interactive Kanban & Filtered Workspaces</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-[#176b60]" />
                        <span>Instant Markdown Specs with live preview</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-[#176b60]" />
                        <span>Full Git auditability — commit alongside code</span>
                      </li>
                    </ul>
                  </div>

                  <div className="pt-6 border-t border-[#dbe4e2]">
                    <span className="text-[11px] font-mono text-[#176b60] uppercase tracking-wider block mb-1 font-bold">Human Command</span>
                    <code className="text-xs font-mono text-[#202d31] bg-[#f4f7f7] px-2.5 py-1.5 rounded-lg border border-[#dbe4e2] block">
                      knowme browser --open
                    </code>
                  </div>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="agent"
                initial={{ opacity: 0, x: 30, filter: "blur(8px)" }}
                animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
                exit={{ opacity: 0, x: -30, filter: "blur(8px)" }}
                transition={{ type: "spring", bounce: 0, duration: 0.45 }}
                className="grid grid-cols-1 lg:grid-cols-12 gap-6 flex-1 items-stretch"
              >
                {/* Left: Agent Terminal / MCP Stdio stream */}
                <div className="lg:col-span-8 flex flex-col gap-4">
                  <div className="apple-card rounded-2xl p-5 space-y-3 font-mono">
                    <div className="flex items-center justify-between text-xs pb-2 border-b border-[#dbe4e2]">
                      <div className="flex items-center gap-2 text-[#176b60] font-bold">
                        <Terminal className="w-4 h-4" />
                        <span>MCP Protocol Engine · stdio:knowme</span>
                      </div>
                      <span className="text-[10px] px-2 py-0.5 rounded bg-[#e0eeea] text-[#176b60] font-semibold border border-[#176b60]/20">
                        STATUS: ACTIVE
                      </span>
                    </div>

                    {/* Stdio JSON RPC logs */}
                    <div className="p-4 rounded-xl bg-[#f4f7f7] border border-[#dbe4e2] text-[11px] sm:text-xs space-y-2.5 text-[#202d31] max-h-[340px] overflow-x-auto leading-relaxed">
                      <div className="text-[#5c706f] font-mono">// 1. Autonomous Agent bootstraps session</div>
                      <p className="text-[#202d31]">
                        <span className="text-[#176b60] font-bold">&gt; knowme retrieve</span> &quot;Apple Duo landing specifications&quot; --json
                      </p>
                      <div className="pl-3 border-l-2 border-[#176b60]/40 text-[#202d31] space-y-1">
                        <p className="text-[#5c706f]">{`{`}</p>
                        <p className="pl-2"><span className="text-[#176b60] font-semibold">&quot;resolved_context&quot;</span>: [</p>
                        <p className="pl-4 text-[#176b60]">&#123; &quot;ref&quot;: &quot;@doc/spec-duo&quot;, &quot;score&quot;: 0.98, &quot;path&quot;: &quot;landing/DESIGN.md&quot; &#125;,</p>
                        <p className="pl-4 text-[#176b60]">&#123; &quot;ref&quot;: &quot;@task/104&quot;, &quot;status&quot;: &quot;in_progress&quot;, &quot;priority&quot;: 1 &#125;</p>
                        <p className="pl-2">],</p>
                        <p className="pl-2"><span className="text-[#176b60] font-semibold">&quot;grounding&quot;</span>: &quot;Single-source-of-truth established without re-explaining.&quot;</p>
                        <p className="text-[#5c706f]">{`}`}</p>
                      </div>

                      <div className="text-[#5c706f] font-mono pt-2">// 2. Execution updates task atomically</div>
                      <p className="text-[#202d31]">
                        <span className="text-[#176b60] font-bold">&gt; knowme task update</span> 104 --criteria-check &quot;1,2,3,4&quot;
                      </p>
                      <p className="text-[#176b60] text-[11px] font-semibold">
                        ✓ Task 104 synchronized: UI updated in 4ms, Git diff staged.
                      </p>
                    </div>
                  </div>

                  {/* Schema validation bar */}
                  <div className="grid grid-cols-3 gap-3">
                    <div className="apple-card p-3 rounded-xl border-[#dbe4e2] text-center">
                      <span className="text-[10px] text-[#5c706f] font-mono block">PROTOCOL</span>
                      <span className="text-xs font-bold text-[#202d31] font-mono">Model Context Protocol</span>
                    </div>
                    <div className="apple-card p-3 rounded-xl border-[#dbe4e2] text-center">
                      <span className="text-[10px] text-[#5c706f] font-mono block">LATENCY</span>
                      <span className="text-xs font-bold text-[#176b60] font-mono">&lt; 8ms local stdio</span>
                    </div>
                    <div className="apple-card p-3 rounded-xl border-[#dbe4e2] text-center">
                      <span className="text-[10px] text-[#5c706f] font-mono block">HALLUCINATIONS</span>
                      <span className="text-xs font-bold text-[#176b60] font-mono">Eliminated via @refs</span>
                    </div>
                  </div>
                </div>

                {/* Right: Agent Core Highlights */}
                <div className="lg:col-span-4 flex flex-col justify-between apple-card rounded-2xl p-6 border-[#176b60]/20 bg-gradient-to-b from-[#e0eeea]/30 to-white">
                  <div className="space-y-4">
                    <div className="w-10 h-10 rounded-xl bg-[#e0eeea] border border-[#176b60]/20 flex items-center justify-center text-[#176b60]">
                      <Bot className="w-5 h-5" />
                    </div>
                    <h3 className="text-xl font-bold text-[#202d31] tracking-tight">
                      Built for Agent Precision
                    </h3>
                    <p className="text-sm text-[#5c706f] leading-relaxed">
                      AI coding models never guess what your project does. Every agent prompt is seeded with grounded references: <span className="text-[#176b60] font-mono font-semibold">@doc</span>, <span className="text-[#176b60] font-mono font-semibold">@task</span>, and linked decisions.
                    </p>
                    <ul className="space-y-2.5 text-xs text-[#202d31] pt-2">
                      <li className="flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-[#176b60]" />
                        <span>Standard MCP stdio transport (Claude, Cursor, Codex)</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-[#176b60]" />
                        <span>Semantic & BM25 hybrid context retrieval</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-[#176b60]" />
                        <span>Eliminates 30-minute agent onboarding prompts</span>
                      </li>
                    </ul>
                  </div>

                  <div className="pt-6 border-t border-[#dbe4e2]">
                    <span className="text-[11px] font-mono text-[#176b60] uppercase tracking-wider block mb-1 font-bold">Agent Shell Hook</span>
                    <code className="text-xs font-mono text-[#202d31] bg-[#f4f7f7] px-2.5 py-1.5 rounded-lg border border-[#dbe4e2] block">
                      knowme retrieve --context-pack
                    </code>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Bottom Dual Bar Note */}
          <div className="mt-8 pt-4 border-t border-[#dbe4e2] flex flex-col sm:flex-row items-center justify-between text-xs text-[#5c706f] gap-3">
            <div className="flex items-center gap-2">
              <Zap className="w-3.5 h-3.5 text-[#176b60]" />
              <span>Zero sync delay: the CLI, web app, and agent stdio connect to identical on-disk memory.</span>
            </div>
            <div className="flex items-center gap-4 font-mono text-[11px]">
              <span className="text-[#5c706f]">60 FPS Fluid Transitions</span>
              <span className="text-[#176b60] font-semibold">Tactile Feedback</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
