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
      {/* Background radial spotlight */}
      <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[600px] rounded-full blur-[140px] pointer-events-none transition-colors duration-700 ${
        activePerspective === "human" ? "bg-blue-600/10" : "bg-purple-600/10"
      }`} />

      {/* Section Header */}
      <div className="text-center max-w-3xl mx-auto space-y-4 mb-14">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-zinc-900 border border-white/10 text-xs font-mono text-zinc-400">
          <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
          <span>DUAL PERSPECTIVE ARCHITECTURE</span>
        </div>
        <h2 className="text-4xl sm:text-6xl font-black tracking-[-0.03em] text-titanium leading-tight">
          The Duo Architecture.
        </h2>
        <p className="text-lg sm:text-xl text-zinc-400 font-medium">
          The same atomic record simultaneously serves human vision and autonomous agent cognition. 
          Switch the lens to see how both experience KnowMe.
        </p>

        {/* Dual Mode Switcher Pill */}
        <div className="pt-4 flex justify-center">
          <div className="apple-glass-pill p-1.5 rounded-full flex items-center gap-1 border border-white/15">
            <button
              type="button"
              onClick={() => setActivePerspective("human")}
              className={`flex items-center gap-2.5 px-6 py-2.5 rounded-full text-xs sm:text-sm font-semibold transition-all duration-200 active:scale-95 ${
                activePerspective === "human"
                  ? "bg-white text-black shadow-lg shadow-white/10"
                  : "text-zinc-400 hover:text-white"
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
                  ? "bg-white text-black shadow-lg shadow-white/10"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              <Bot className="w-4 h-4" />
              <span>AI Agent Core</span>
            </button>
          </div>
        </div>
      </div>

      {/* Duo Interactive Device Frame */}
      <div className="relative rounded-3xl p-1 bg-gradient-to-b from-white/20 via-white/5 to-transparent shadow-2xl">
        <div className="bg-[#09090b] rounded-[22px] border border-white/10 p-4 sm:p-8 overflow-hidden min-h-[580px] flex flex-col justify-between">
          {/* Frame Top Bar */}
          <div className="flex items-center justify-between pb-6 border-b border-white/10 mb-6">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-red-500/80" />
              <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
              <div className="w-3 h-3 rounded-full bg-green-500/80" />
              <span className="ml-3 text-xs font-mono text-zinc-400 hidden sm:inline-block">
                knowme://workspace/orchestration-core
              </span>
            </div>

            <div className="flex items-center gap-3">
              <span className="text-xs font-mono px-2.5 py-1 rounded-md bg-white/5 text-zinc-300 border border-white/10">
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
                        <Kanban className="w-4 h-4 text-blue-400" />
                        <h4 className="text-sm font-bold text-white tracking-tight">Interactive Kanban Board</h4>
                      </div>
                      <span className="text-xs text-zinc-400 font-mono">Project: Core Engine</span>
                    </div>

                    {/* Columns Preview */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      {/* In Progress Column */}
                      <div className="rounded-xl bg-black/40 border border-white/5 p-3 space-y-2.5">
                        <div className="flex items-center justify-between text-xs font-semibold text-zinc-400">
                          <span className="flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-amber-400" />
                            In Progress
                          </span>
                          <span className="text-[11px] px-1.5 rounded bg-white/10 text-zinc-300 font-mono">1</span>
                        </div>
                        <div className="rounded-lg bg-zinc-900/90 border border-white/10 p-3 space-y-2 shadow-sm hover:border-white/20 transition-all cursor-pointer">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 font-bold">
                              KM-104
                            </span>
                            <span className="text-[10px] text-zinc-400 flex items-center gap-1">
                              <Clock className="w-3 h-3" /> P1
                            </span>
                          </div>
                          <p className="text-xs font-semibold text-white leading-snug">
                            Implement Apple Duo spring transitions & pill nav
                          </p>
                          <div className="flex items-center justify-between pt-1 text-[11px] text-zinc-400 border-t border-white/5">
                            <span className="flex items-center gap-1 text-emerald-400">
                              <CheckCircle2 className="w-3 h-3" /> 4/4 criteria
                            </span>
                            <span className="font-mono text-[10px]">@doc/spec-duo</span>
                          </div>
                        </div>
                      </div>

                      {/* In Review Column */}
                      <div className="rounded-xl bg-black/40 border border-white/5 p-3 space-y-2.5">
                        <div className="flex items-center justify-between text-xs font-semibold text-zinc-400">
                          <span className="flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-purple-400" />
                            In Review
                          </span>
                          <span className="text-[11px] px-1.5 rounded bg-white/10 text-zinc-300 font-mono">1</span>
                        </div>
                        <div className="rounded-lg bg-zinc-900/90 border border-white/10 p-3 space-y-2 shadow-sm">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 font-bold">
                              KM-103
                            </span>
                            <span className="text-[10px] text-zinc-400">Autonomous</span>
                          </div>
                          <p className="text-xs font-semibold text-white leading-snug">
                            MCP Protocol validation for stdio subagents
                          </p>
                          <div className="flex items-center justify-between pt-1 text-[11px] text-zinc-400 border-t border-white/5">
                            <span className="text-zinc-500">Agent: Firstmate</span>
                            <span className="text-emerald-400 text-[10px]">Verified</span>
                          </div>
                        </div>
                      </div>

                      {/* Done Column */}
                      <div className="rounded-xl bg-black/40 border border-white/5 p-3 space-y-2.5">
                        <div className="flex items-center justify-between text-xs font-semibold text-zinc-400">
                          <span className="flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-emerald-400" />
                            Done
                          </span>
                          <span className="text-[11px] px-1.5 rounded bg-white/10 text-zinc-300 font-mono">2</span>
                        </div>
                        <div className="rounded-lg bg-zinc-900/60 border border-white/5 p-3 space-y-1 opacity-80">
                          <span className="text-[10px] font-mono text-zinc-500">KM-101</span>
                          <p className="text-xs font-medium text-zinc-300">Local-first SQLite & Markdown sync</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Document preview snippet */}
                  <div className="apple-card rounded-2xl p-5 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <FileText className="w-4 h-4 text-emerald-400" />
                        <h4 className="text-sm font-bold text-white tracking-tight">Durable Knowledge Spec</h4>
                      </div>
                      <span className="text-xs text-zinc-500 font-mono">docs/architecture/duo-core.md</span>
                    </div>
                    <div className="p-3.5 rounded-xl bg-black/60 border border-white/5 font-mono text-xs text-zinc-300 space-y-1.5 leading-relaxed">
                      <p className="text-purple-300 font-bold"># Architecture: Single Source of Truth</p>
                      <p className="text-zinc-400">Tasks, documents, and quick memos are stored as plain Markdown & JSON in <span className="text-zinc-200">.know-me/</span>.</p>
                      <p className="text-zinc-500">→ Humans navigate via rich browser UI; AI coding agents consume via atomic MCP tools.</p>
                    </div>
                  </div>
                </div>

                {/* Right: Human Highlights */}
                <div className="lg:col-span-4 flex flex-col justify-between apple-card rounded-2xl p-6 border-blue-500/20 bg-gradient-to-b from-blue-950/20 to-transparent">
                  <div className="space-y-4">
                    <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-blue-400">
                      <Users className="w-5 h-5" />
                    </div>
                    <h3 className="text-xl font-bold text-white tracking-tight">
                      Designed for Human Clarity
                    </h3>
                    <p className="text-sm text-zinc-300 leading-relaxed">
                      No opaque agent side-effects. Inspect every plan, approve delivery gates, and manipulate tasks across tactile boards with Apple-grade polish.
                    </p>
                    <ul className="space-y-2.5 text-xs text-zinc-400 pt-2">
                      <li className="flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-blue-400" />
                        <span>Interactive Kanban & Filtered Workspaces</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-blue-400" />
                        <span>Instant Markdown Specs with live preview</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-blue-400" />
                        <span>Full Git auditability — commit alongside code</span>
                      </li>
                    </ul>
                  </div>

                  <div className="pt-6 border-t border-white/10">
                    <span className="text-[11px] font-mono text-blue-300 uppercase tracking-wider block mb-1">Human Command</span>
                    <code className="text-xs font-mono text-zinc-300 bg-black/50 px-2.5 py-1.5 rounded-lg border border-white/10 block">
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
                    <div className="flex items-center justify-between text-xs pb-2 border-b border-white/10">
                      <div className="flex items-center gap-2 text-purple-400 font-bold">
                        <Terminal className="w-4 h-4" />
                        <span>MCP Protocol Engine · stdio:knowme</span>
                      </div>
                      <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-semibold">
                        STATUS: ACTIVE
                      </span>
                    </div>

                    {/* Stdio JSON RPC logs */}
                    <div className="p-4 rounded-xl bg-black/80 border border-white/10 text-[11px] sm:text-xs space-y-2.5 text-zinc-300 max-h-[340px] overflow-x-auto leading-relaxed">
                      <div className="text-zinc-500 font-mono">// 1. Autonomous Agent bootstraps session</div>
                      <p className="text-zinc-400">
                        <span className="text-purple-400">&gt; knowme retrieve</span> &quot;Apple Duo landing specifications&quot; --json
                      </p>
                      <div className="pl-3 border-l-2 border-purple-500/40 text-zinc-300 space-y-1">
                        <p className="text-zinc-400">{`{`}</p>
                        <p className="pl-2"><span className="text-cyan-300">&quot;resolved_context&quot;</span>: [</p>
                        <p className="pl-4 text-emerald-300">&#123; &quot;ref&quot;: &quot;@doc/spec-duo&quot;, &quot;score&quot;: 0.98, &quot;path&quot;: &quot;landing/DESIGN.md&quot; &#125;,</p>
                        <p className="pl-4 text-emerald-300">&#123; &quot;ref&quot;: &quot;@task/104&quot;, &quot;status&quot;: &quot;in_progress&quot;, &quot;priority&quot;: 1 &#125;</p>
                        <p className="pl-2">],</p>
                        <p className="pl-2"><span className="text-cyan-300">&quot;grounding&quot;</span>: &quot;Single-source-of-truth established without re-explaining.&quot;</p>
                        <p className="text-zinc-400">{`}`}</p>
                      </div>

                      <div className="text-zinc-500 font-mono pt-2">// 2. Execution updates task atomically</div>
                      <p className="text-zinc-400">
                        <span className="text-emerald-400">&gt; knowme task update</span> 104 --criteria-check &quot;1,2,3,4&quot;
                      </p>
                      <p className="text-emerald-300 text-[11px]">
                        ✓ Task 104 synchronized: UI updated in 4ms, Git diff staged.
                      </p>
                    </div>
                  </div>

                  {/* Schema validation bar */}
                  <div className="grid grid-cols-3 gap-3">
                    <div className="apple-card p-3 rounded-xl border-white/10 text-center">
                      <span className="text-[10px] text-zinc-500 font-mono block">PROTOCOL</span>
                      <span className="text-xs font-bold text-white font-mono">Model Context Protocol</span>
                    </div>
                    <div className="apple-card p-3 rounded-xl border-white/10 text-center">
                      <span className="text-[10px] text-zinc-500 font-mono block">LATENCY</span>
                      <span className="text-xs font-bold text-emerald-400 font-mono">&lt; 8ms local stdio</span>
                    </div>
                    <div className="apple-card p-3 rounded-xl border-white/10 text-center">
                      <span className="text-[10px] text-zinc-500 font-mono block">HALLUCINATIONS</span>
                      <span className="text-xs font-bold text-purple-400 font-mono">Eliminated via @refs</span>
                    </div>
                  </div>
                </div>

                {/* Right: Agent Core Highlights */}
                <div className="lg:col-span-4 flex flex-col justify-between apple-card rounded-2xl p-6 border-purple-500/20 bg-gradient-to-b from-purple-950/20 to-transparent">
                  <div className="space-y-4">
                    <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/30 flex items-center justify-center text-purple-400">
                      <Bot className="w-5 h-5" />
                    </div>
                    <h3 className="text-xl font-bold text-white tracking-tight">
                      Built for Agent Precision
                    </h3>
                    <p className="text-sm text-zinc-300 leading-relaxed">
                      AI coding models never guess what your project does. Every agent prompt is seeded with grounded references: <span className="text-purple-300 font-mono">@doc</span>, <span className="text-purple-300 font-mono">@task</span>, and linked decisions.
                    </p>
                    <ul className="space-y-2.5 text-xs text-zinc-400 pt-2">
                      <li className="flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-purple-400" />
                        <span>Standard MCP stdio transport (Claude, Cursor, Codex)</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-purple-400" />
                        <span>Semantic & BM25 hybrid context retrieval</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-purple-400" />
                        <span>Eliminates 30-minute agent onboarding prompts</span>
                      </li>
                    </ul>
                  </div>

                  <div className="pt-6 border-t border-white/10">
                    <span className="text-[11px] font-mono text-purple-300 uppercase tracking-wider block mb-1">Agent Shell Hook</span>
                    <code className="text-xs font-mono text-zinc-300 bg-black/50 px-2.5 py-1.5 rounded-lg border border-white/10 block">
                      knowme retrieve --context-pack
                    </code>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Bottom Dual Bar Note */}
          <div className="mt-8 pt-4 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between text-xs text-zinc-500 gap-3">
            <div className="flex items-center gap-2">
              <Zap className="w-3.5 h-3.5 text-amber-400" />
              <span>Zero sync delay: the CLI, web app, and agent stdio connect to identical on-disk memory.</span>
            </div>
            <div className="flex items-center gap-4 font-mono text-[11px]">
              <span className="text-zinc-400">60 FPS Fluid Transitions</span>
              <span className="text-zinc-400">Tactile Feedback</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
