import { ArrowUpRight, Terminal, Sparkles, CheckCircle2 } from "lucide-react";
import { InstallCommand } from "./InstallCommand";
import { INSTALL_COMMAND, QUICK_START_URL, MCP_GUIDE_URL } from "../config/landing";

export function InstallCTA() {
  return (
    <section id="get-started" className="relative py-24 px-4 sm:px-6 max-w-5xl mx-auto">
      <div className="relative rounded-3xl p-8 sm:p-14 text-center border border-[var(--landing-border)] bg-[var(--landing-surface)] shadow-lg overflow-hidden">
        {/* Subtle decorative background gradient */}
        <div className="absolute inset-0 bg-radial from-[var(--landing-primary-soft)]/50 via-transparent to-transparent pointer-events-none" />

        <div className="relative max-w-2xl mx-auto space-y-6">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[var(--landing-surface-muted)] border border-[var(--landing-border)] text-xs font-mono text-[var(--landing-primary)] font-medium">
            <Sparkles className="w-3.5 h-3.5" />
            <span>GET STARTED IN SECONDS</span>
          </div>

          <h2 className="text-3xl sm:text-5xl font-bold tracking-tight text-[var(--landing-text)] leading-tight">
            Ready to ground your AI tools?
          </h2>

          <p className="text-base sm:text-lg text-[var(--landing-muted)]">
            Install the CLI, initialize your repository, and experience connected local workspace memory.
          </p>

          {/* Primary install command */}
          <div className="pt-2 max-w-lg mx-auto">
            <InstallCommand command={INSTALL_COMMAND} label="Copy npm installation command" />
          </div>

          {/* Next steps */}
          <div className="pt-6 grid grid-cols-1 sm:grid-cols-2 gap-4 text-left max-w-lg mx-auto font-mono text-xs">
            <div className="p-3.5 rounded-xl bg-[var(--landing-surface-muted)] border border-[var(--landing-border)] space-y-1">
              <div className="text-[var(--landing-muted)] font-sans text-[11px] font-semibold uppercase tracking-wider">
                Step 1 · Initialize
              </div>
              <div className="flex items-center gap-2 text-[var(--landing-text)] font-bold">
                <span className="text-[var(--landing-primary)] select-none">$</span>
                <code>knowme init</code>
              </div>
              <p className="font-sans text-[11px] text-[var(--landing-muted)]">
                Creates .know-me/ in your git project.
              </p>
            </div>

            <div className="p-3.5 rounded-xl bg-[var(--landing-surface-muted)] border border-[var(--landing-border)] space-y-1">
              <div className="text-[var(--landing-muted)] font-sans text-[11px] font-semibold uppercase tracking-wider">
                Step 2 · Web Workspace
              </div>
              <div className="flex items-center gap-2 text-[var(--landing-text)] font-bold">
                <span className="text-[var(--landing-primary)] select-none">$</span>
                <code>knowme browser --open</code>
              </div>
              <p className="font-sans text-[11px] text-[var(--landing-muted)]">
                Opens the local visual Kanban UI.
              </p>
            </div>
          </div>

          {/* Documentation links */}
          <div className="pt-4 flex flex-wrap items-center justify-center gap-4 text-xs font-medium">
            <a
              href={QUICK_START_URL}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-[var(--landing-primary)] hover:underline"
            >
              <span>Quick start guide</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </a>
            <span className="text-[var(--landing-border)] select-none">·</span>
            <a
              href={MCP_GUIDE_URL}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-[var(--landing-primary)] hover:underline"
            >
              <span>Configure Claude, Cursor & MCP</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
