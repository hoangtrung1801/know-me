import { motion } from "framer-motion";
import { useRef } from "react";
import { SpotlightCard } from "./reactbits/SpotlightCard";
import { AnimatedBeam } from "./magicui/AnimatedBeam";
import { 
  Database, 
  Terminal, 
  GitFork, 
  Cpu, 
  Lock, 
  Search, 
  Layers, 
  Workflow, 
  Sparkles,
  CheckCircle2,
  Share2
} from "lucide-react";

const features = [
  {
    icon: Database,
    title: "Local-First Sovereign Memory",
    category: "STORAGE ARCHITECTURE",
    description: "Every task, specification, memo, and link lives as clean Markdown and JSON in your repository (.know-me/). Zero proprietary cloud silos.",
    accent: "from-[#e0eeea] to-white",
    border: "border-[#dbe4e2]",
    badge: "Markdown + JSON",
  },
  {
    icon: Cpu,
    title: "Model Context Protocol Native",
    category: "AI AGENT INTEGRATION",
    description: "First-class stdio MCP server for Claude Desktop, Cursor, Codex, OpenCode, and Cline. Expose tasks and documentation as deterministic tools.",
    accent: "from-[#e0eeea] to-white",
    border: "border-[#dbe4e2]",
    badge: "MCP Stdio",
  },
  {
    icon: Search,
    title: "BM25 & Semantic Hybrid Retrieval",
    category: "DISCOVERY & SEARCH",
    description: "Find related architectural decisions, past task rationale, and relevant documents in milliseconds. Rebuildable search indexes stored locally.",
    accent: "from-[#e0eeea] to-white",
    border: "border-[#dbe4e2]",
    badge: "< 8ms Hybrid Search",
  },
  {
    icon: Workflow,
    title: "Fluid Visual Kanban & Docs",
    category: "HUMAN EXPERIENCE",
    description: "A fast, responsive web workspace for Kanban boards, specifications, memos, links, and knowledge graphs with drag-and-drop tactile feel.",
    accent: "from-[#e0eeea] to-white",
    border: "border-[#dbe4e2]",
    badge: "Web Workspace",
  },
  {
    icon: GitFork,
    title: "Git-Native Versioning & Audit",
    category: "TEAM COLLABORATION",
    description: "Track architectural shifts and completed tasks using git diff, git log, and pull requests. AI edits commit side-by-side with source code.",
    accent: "from-[#e0eeea] to-white",
    border: "border-[#dbe4e2]",
    badge: "PR & Diff Friendly",
  },
  {
    icon: Lock,
    title: "Zero Token Waste & Zero Leaks",
    category: "PRIVACY & EFFICIENCY",
    description: "Never dump your entire codebase into agent prompts again. Seed exact, high-confidence context using atomic @doc and @task references.",
    accent: "from-[#e0eeea] to-white",
    border: "border-[#dbe4e2]",
    badge: "Grounded Memory",
  },
];

function McpBeamVisual() {
  const containerRef = useRef<HTMLDivElement>(null);
  const fromRef = useRef<HTMLDivElement>(null);
  const midRef = useRef<HTMLDivElement>(null);
  const toRef = useRef<HTMLDivElement>(null);

  return (
    <div
      ref={containerRef}
      className="relative flex items-center justify-between p-3 my-2 rounded-xl bg-[#f4f7f7] border border-[#dbe4e2] overflow-hidden text-[10px] font-mono"
    >
      <div ref={fromRef} className="z-10 px-2 py-1 rounded-md bg-white border border-[#dbe4e2] shadow-xs text-[#202d31]">
        .know-me/
      </div>
      <div ref={midRef} className="z-10 px-2 py-1 rounded-md bg-[#e0eeea] border border-[#176b60]/30 font-bold text-[#176b60]">
        MCP Stdio
      </div>
      <div ref={toRef} className="z-10 px-2 py-1 rounded-md bg-white border border-[#dbe4e2] shadow-xs text-[#202d31]">
        AI Agent
      </div>
      <AnimatedBeam containerRef={containerRef} fromRef={fromRef} toRef={midRef} duration={3} />
      <AnimatedBeam containerRef={containerRef} fromRef={midRef} toRef={toRef} duration={3} delay={1.5} />
    </div>
  );
}

export function Features() {
  return (
    <section id="features" className="relative py-28 px-4 sm:px-6 max-w-7xl mx-auto">
      {/* Section Header */}
      <div className="text-center max-w-3xl mx-auto space-y-4 mb-16">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#f4f7f7] border border-[#dbe4e2] text-xs font-mono text-[#176b60]">
          <Sparkles className="w-3.5 h-3.5 text-[#176b60]" />
          <span>TITANIUM-GRADE CAPABILITIES</span>
        </div>
        <h2 className="text-4xl sm:text-6xl font-black tracking-[-0.03em] text-titanium leading-tight">
          Engineered for Dual Dominance.
        </h2>
        <p className="text-lg sm:text-xl text-[#5c706f] font-medium">
          Whether you are steering strategy from a keyboard or an AI subagent is executing from the terminal, KnowMe gives both complete mastery.
        </p>
      </div>

      {/* Bento Grid with Spotlight Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {features.map((feat, index) => {
          const Icon = feat.icon;
          const isMcpCard = feat.title.includes("Model Context Protocol");
          return (
            <motion.div
              key={feat.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-50px" }}
              transition={{ type: "spring", bounce: 0, duration: 0.5, delay: index * 0.08 }}
              whileHover={{ y: -4, transition: { duration: 0.15 } }}
              className="h-full"
            >
              <SpotlightCard
                spotlightColor="rgba(23, 107, 96, 0.14)"
                spotlightSize={320}
                className="group h-full rounded-3xl p-7 border border-[#dbe4e2] hover:border-[#176b60] transition-all duration-200 flex flex-col justify-between overflow-hidden shadow-xs hover:shadow-lg bg-white"
              >
                <div className="relative space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="w-12 h-12 rounded-2xl bg-[#f4f7f7] border border-[#dbe4e2] flex items-center justify-center text-[#176b60] group-hover:scale-105 group-hover:bg-[#e0eeea] transition-all duration-200 shadow-xs">
                      <Icon className="w-6 h-6 text-[#176b60]" />
                    </div>
                    <span className="text-[10px] font-mono font-semibold px-2.5 py-1 rounded-full bg-[#f4f7f7] text-[#176b60] border border-[#dbe4e2]">
                      {feat.badge}
                    </span>
                  </div>

                  <div className="space-y-1.5">
                    <span className="text-[11px] font-mono uppercase tracking-widest text-[#5c706f] font-semibold block">
                      {feat.category}
                    </span>
                    <h3 className="text-xl font-bold text-[#202d31] tracking-tight leading-snug group-hover:text-[#176b60] transition-colors">
                      {feat.title}
                    </h3>
                  </div>

                  <p className="text-sm text-[#5c706f] leading-relaxed font-normal">
                    {feat.description}
                  </p>

                  {isMcpCard && <McpBeamVisual />}
                </div>

                <div className="relative pt-6 mt-6 border-t border-[#dbe4e2] flex items-center text-xs font-semibold text-[#176b60] group-hover:text-[#11534b] transition-colors duration-150">
                  <span>Learn specification</span>
                  <span className="ml-1.5 group-hover:translate-x-1 transition-transform duration-150">→</span>
                </div>
              </SpotlightCard>
            </motion.div>
          );
        })}
      </div>
    </section>
  );
}
