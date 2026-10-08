import { motion } from "framer-motion";
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
    accent: "from-blue-500/20 to-transparent",
    border: "border-blue-500/30",
    badge: "Markdown + JSON",
  },
  {
    icon: Cpu,
    title: "Model Context Protocol Native",
    category: "AI AGENT INTEGRATION",
    description: "First-class stdio MCP server for Claude Desktop, Cursor, Codex, OpenCode, and Cline. Expose tasks and documentation as deterministic tools.",
    accent: "from-purple-500/20 to-transparent",
    border: "border-purple-500/30",
    badge: "MCP Stdio",
  },
  {
    icon: Search,
    title: "BM25 & Semantic Hybrid Retrieval",
    category: "DISCOVERY & SEARCH",
    description: "Find related architectural decisions, past task rationale, and relevant documents in milliseconds. Rebuildable search indexes stored locally.",
    accent: "from-emerald-500/20 to-transparent",
    border: "border-emerald-500/30",
    badge: "< 8ms Hybrid Search",
  },
  {
    icon: Workflow,
    title: "Fluid Visual Kanban & Docs",
    category: "HUMAN EXPERIENCE",
    description: "A fast, responsive web workspace for Kanban boards, specifications, memos, links, and knowledge graphs with drag-and-drop tactile feel.",
    accent: "from-amber-500/20 to-transparent",
    border: "border-amber-500/30",
    badge: "Web Workspace",
  },
  {
    icon: GitFork,
    title: "Git-Native Versioning & Audit",
    category: "TEAM COLLABORATION",
    description: "Track architectural shifts and completed tasks using git diff, git log, and pull requests. AI edits commit side-by-side with source code.",
    accent: "from-cyan-500/20 to-transparent",
    border: "border-cyan-500/30",
    badge: "PR & Diff Friendly",
  },
  {
    icon: Lock,
    title: "Zero Token Waste & Zero Leaks",
    category: "PRIVACY & EFFICIENCY",
    description: "Never dump your entire codebase into agent prompts again. Seed exact, high-confidence context using atomic @doc and @task references.",
    accent: "from-rose-500/20 to-transparent",
    border: "border-rose-500/30",
    badge: "Grounded Memory",
  },
];

export function Features() {
  return (
    <section id="features" className="relative py-28 px-4 sm:px-6 max-w-7xl mx-auto">
      {/* Section Header */}
      <div className="text-center max-w-3xl mx-auto space-y-4 mb-16">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-zinc-900 border border-white/10 text-xs font-mono text-zinc-400">
          <Sparkles className="w-3.5 h-3.5 text-zinc-300" />
          <span>TITANIUM-GRADE CAPABILITIES</span>
        </div>
        <h2 className="text-4xl sm:text-6xl font-black tracking-[-0.03em] text-titanium leading-tight">
          Engineered for Dual Dominance.
        </h2>
        <p className="text-lg sm:text-xl text-zinc-400 font-medium">
          Whether you are steering strategy from a keyboard or an AI subagent is executing from the terminal, KnowMe gives both complete mastery.
        </p>
      </div>

      {/* Apple Bento Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {features.map((feat, index) => {
          const Icon = feat.icon;
          return (
            <motion.div
              key={feat.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-50px" }}
              transition={{ type: "spring", bounce: 0, duration: 0.5, delay: index * 0.08 }}
              whileHover={{ y: -4, transition: { duration: 0.15 } }}
              className={`group relative rounded-3xl p-7 apple-card border border-white/10 hover:border-white/20 transition-all duration-200 flex flex-col justify-between overflow-hidden`}
            >
              {/* Subtle hover gradient wash */}
              <div className={`absolute inset-0 bg-gradient-to-b ${feat.accent} opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none`} />

              <div className="relative space-y-4">
                <div className="flex items-center justify-between">
                  <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-white group-hover:scale-105 group-hover:bg-white/10 transition-all duration-200 shadow-sm">
                    <Icon className="w-6 h-6 text-zinc-200" />
                  </div>
                  <span className="text-[10px] font-mono font-semibold px-2.5 py-1 rounded-full bg-white/5 text-zinc-400 border border-white/10">
                    {feat.badge}
                  </span>
                </div>

                <div className="space-y-1.5">
                  <span className="text-[11px] font-mono uppercase tracking-widest text-zinc-400 font-semibold block">
                    {feat.category}
                  </span>
                  <h3 className="text-xl font-bold text-white tracking-tight leading-snug">
                    {feat.title}
                  </h3>
                </div>

                <p className="text-sm text-zinc-400 leading-relaxed font-normal">
                  {feat.description}
                </p>
              </div>

              <div className="relative pt-6 mt-6 border-t border-white/5 flex items-center text-xs font-semibold text-zinc-400 group-hover:text-white transition-colors duration-150">
                <span>Learn specification</span>
                <span className="ml-1.5 group-hover:translate-x-1 transition-transform duration-150">→</span>
              </div>
            </motion.div>
          );
        })}
      </div>
    </section>
  );
}
