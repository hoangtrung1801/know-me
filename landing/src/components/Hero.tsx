import { ArrowRight, ChevronRight, Terminal, Layers, Cpu, ShieldCheck } from "lucide-react";
import { InstallCommand } from "./InstallCommand";
import { BorderBeam } from "./magicui/BorderBeam";
import { TextAnimate } from "./magicui/TextAnimate";
import { INSTALL_COMMAND } from "../config/landing";

export function Hero() {
  return (
    <section className="relative min-h-[85vh] flex flex-col items-center justify-center pt-32 pb-20 px-4 sm:px-6 overflow-hidden">
      {/* Subtle static radial glow behind hero */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[400px] bg-gradient-to-b from-[var(--landing-primary-soft)]/60 via-transparent to-transparent blur-[120px] pointer-events-none rounded-full" />

      {/* Titanium pill */}
      <div className="inline-flex items-center gap-2.5 px-4 py-1.5 rounded-full bg-[var(--landing-surface)] text-xs font-medium text-[var(--landing-text)] border border-[var(--landing-border)] mb-8 shadow-xs">
        <img
          src="/logo-48.png"
          width={16}
          height={16}
          className="w-4 h-4 rounded-xs object-contain"
        />
        <span className="flex h-2 w-2 rounded-full bg-[var(--landing-primary)] animate-pulse" />
        <span className="tracking-wide">Local-First · CLI + MCP Core · MIT Licensed</span>
      </div>

      {/* Main Bold Display Headline */}
      <div className="text-center max-w-4xl mx-auto space-y-4">
        <h1 className="text-4xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight text-[var(--landing-text)] leading-[1.05]">
          Two minds.
          <br />
          One memory.
        </h1>
        <p className="text-lg sm:text-xl lg:text-2xl font-normal text-[var(--landing-muted)] max-w-2xl mx-auto leading-relaxed">
          Keep tasks, documents, and project context in one local workspace—for you and your AI tools.
        </p>
      </div>

      {/* Feature Badges */}
      <div className="mt-8 flex flex-wrap items-center justify-center gap-2.5 sm:gap-4 text-xs font-mono text-[var(--landing-text)]">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[var(--landing-surface)] border border-[var(--landing-border)] shadow-xs">
          <Layers className="w-3.5 h-3.5 text-[var(--landing-primary)]" />
          <span>Local Markdown & JSON</span>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[var(--landing-surface)] border border-[var(--landing-border)] shadow-xs">
          <Terminal className="w-3.5 h-3.5 text-[var(--landing-primary)]" />
          <span>MCP Stdio Agent Core</span>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[var(--landing-surface)] border border-[var(--landing-border)] shadow-xs">
          <ShieldCheck className="w-3.5 h-3.5 text-[var(--landing-primary)]" />
          <span>Git-Versioned State</span>
        </div>
      </div>

      {/* CTAs */}
      <div className="mt-10 flex flex-col sm:flex-row items-center gap-4 w-full max-w-md mx-auto">
        <a
          href="#get-started"
          className="w-full sm:w-auto flex-1 inline-flex items-center justify-center gap-2 px-7 py-3 rounded-full text-sm font-semibold text-white bg-[var(--landing-primary)] hover:bg-[var(--landing-primary-hover)] transition-all shadow-md shadow-[var(--landing-primary)]/20 active:scale-95 cursor-pointer"
        >
          <span>Install KnowMe</span>
          <ArrowRight className="w-4 h-4" />
        </a>

        <a
          href="#showcase"
          className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full text-sm font-semibold text-[var(--landing-text)] bg-[var(--landing-surface)] hover:bg-[var(--landing-surface-muted)] border border-[var(--landing-border)] transition-all active:scale-95 cursor-pointer"
        >
          <span>Try Workflow</span>
          <ChevronRight className="w-4 h-4 text-[var(--landing-muted)]" />
        </a>
      </div>

      {/* Hero Install Command Snippet */}
      <div className="mt-6 w-full max-w-md mx-auto">
        <InstallCommand command={INSTALL_COMMAND} label="Copy npm installation command" />
      </div>
    </section>
  );
}
