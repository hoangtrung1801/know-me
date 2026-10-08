import { motion } from "framer-motion";
import { ArrowRight, ChevronRight, Terminal, Sparkles, Cpu, Layers } from "lucide-react";

export function Hero() {
  return (
    <section className="relative min-h-[90vh] flex flex-col items-center justify-center pt-32 pb-20 px-6 overflow-hidden">
      {/* Subtle Apple Radial Glows */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[400px] bg-gradient-to-b from-blue-500/10 via-purple-500/5 to-transparent blur-[120px] pointer-events-none rounded-full" />
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[900px] h-[300px] bg-radial from-white/[0.04] to-transparent blur-[90px] pointer-events-none" />

      {/* Titanium Subtitle Pill */}
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", bounce: 0, duration: 0.6 }}
        className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full apple-glass text-xs font-medium text-zinc-300 border border-white/10 mb-8 shadow-sm"
      >
        <span className="flex h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
        <span className="tracking-wide">Introducing the KnowMe Duo Engine</span>
        <ChevronRight className="w-3.5 h-3.5 text-zinc-500" />
      </motion.div>

      {/* Main Apple Bold Display Headline */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", bounce: 0, duration: 0.7, delay: 0.1 }}
        className="text-center max-w-4xl mx-auto space-y-4"
      >
        <h1 className="text-5xl sm:text-7xl lg:text-8xl font-black tracking-[-0.04em] leading-[0.98] sm:leading-[0.95] text-titanium">
          Two Minds.
          <br />
          One Memory.
        </h1>
        <p className="text-xl sm:text-2xl lg:text-3xl font-medium tracking-tight text-zinc-400 max-w-2xl mx-auto leading-snug">
          A seamless local-first operating layer for humans who craft and AI agents that build.
        </p>
      </motion.div>

      {/* Titanium spec badges */}
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", bounce: 0, duration: 0.6, delay: 0.25 }}
        className="mt-8 flex flex-wrap items-center justify-center gap-3 sm:gap-6 text-xs text-zinc-400 font-mono"
      >
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-zinc-900/60 border border-white/5">
          <Layers className="w-3.5 h-3.5 text-blue-400" />
          <span>Local Markdown & JSON</span>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-zinc-900/60 border border-white/5">
          <Terminal className="w-3.5 h-3.5 text-purple-400" />
          <span>MCP Stdio Agent Core</span>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-zinc-900/60 border border-white/5">
          <Cpu className="w-3.5 h-3.5 text-emerald-400" />
          <span>Zero Black Boxes</span>
        </div>
      </motion.div>

      {/* CTAs */}
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", bounce: 0, duration: 0.6, delay: 0.35 }}
        className="mt-10 flex flex-col sm:flex-row items-center gap-4"
      >
        <a
          href="#duo"
          className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-7 py-3.5 rounded-full text-sm font-semibold text-black bg-white hover:bg-zinc-200 transition-all duration-150 shadow-lg shadow-white/10 active:scale-95"
        >
          <span>Explore Apple Duo Showcase</span>
          <ArrowRight className="w-4 h-4" />
        </a>

        <div className="w-full sm:w-auto flex items-center justify-center gap-3 px-5 py-3 rounded-full bg-zinc-900/80 border border-white/10 text-zinc-300 font-mono text-xs">
          <span className="text-zinc-500">$</span>
          <span>curl -sSL get.knowme.dev | sh</span>
          <button
            type="button"
            onClick={() => navigator.clipboard.writeText("curl -sSL get.knowme.dev | sh")}
            className="text-[10px] text-zinc-400 hover:text-white px-2 py-0.5 rounded bg-white/10 uppercase tracking-wider font-sans font-semibold active:scale-90 transition-transform"
          >
            Copy
          </button>
        </div>
      </motion.div>

      {/* Bottom Scroll Cue */}
      <motion.div 
        animate={{ y: [0, 6, 0] }}
        transition={{ repeat: Infinity, duration: 2.2, ease: "easeInOut" }}
        className="mt-16 text-zinc-500 text-xs flex flex-col items-center gap-1.5"
      >
        <span className="text-[11px] font-medium tracking-wide uppercase">Toggle The Two Perspectives</span>
        <div className="w-4 h-7 rounded-full border border-zinc-700 flex items-start justify-center p-1">
          <div className="w-1 h-1.5 bg-zinc-400 rounded-full animate-bounce" />
        </div>
      </motion.div>
    </section>
  );
}
