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
              className={`group relative rounded-3xl p-7 apple-card border border-[#dbe4e2] hover:border-[#176b60] transition-all duration-200 flex flex-col justify-between overflow-hidden shadow-xs hover:shadow-lg`}
            >
              {/* Subtle hover gradient wash */}
              <div className={`absolute inset-0 bg-gradient-to-b ${feat.accent} opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none`} />

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
              </div>

              <div className="relative pt-6 mt-6 border-t border-[#dbe4e2] flex items-center text-xs font-semibold text-[#176b60] group-hover:text-[#11534b] transition-colors duration-150">
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
