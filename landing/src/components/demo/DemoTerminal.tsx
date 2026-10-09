import { useState, useRef, useEffect } from "react";
import { Terminal, Play, RotateCcw, ArrowRight } from "lucide-react";
import type { DemoState } from "../../lib/demoTypes";

export interface DemoTerminalProps {
  state: DemoState;
  command: string;
  onCommandChange: (value: string) => void;
  onRun: (command: string) => void;
  onNext: () => void;
  onReset: () => void;
}

export function DemoTerminal({
  state,
  command,
  onCommandChange,
  onRun,
  onNext,
  onReset,
}: DemoTerminalProps) {
  const outputRef = useRef<HTMLDivElement>(null);

  // Auto-scroll output transcript when a new command runs
  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [state.transcript]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!command.trim()) return;
    onRun(command);
  };

  return (
    <div className="flex flex-col h-full bg-[var(--landing-terminal)] text-[var(--landing-terminal-text)] rounded-2xl border border-white/10 shadow-xl overflow-hidden font-mono text-xs sm:text-sm">
      {/* Terminal Title Bar */}
      <div className="flex items-center justify-between px-4 py-3 bg-white/5 border-b border-white/10 select-none">
        <div className="flex items-center gap-2">
          <div className="flex gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500/80" />
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500/80" />
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/80" />
          </div>
          <span className="ml-2 font-sans font-medium text-xs text-white/60">
            knowme CLI · stdio agent core
          </span>
        </div>
        <button
          type="button"
          onClick={onReset}
          className="flex items-center gap-1 px-2.5 py-1 rounded bg-white/10 hover:bg-white/20 text-white/80 hover:text-white text-xs transition-colors cursor-pointer"
          title="Reset sample state"
        >
          <RotateCcw className="w-3 h-3" />
          <span>Reset</span>
        </button>
      </div>

      {/* Terminal Output Log */}
      <div
        ref={outputRef}
        data-lenis-prevent
        className="flex-1 p-4 space-y-3 overflow-y-auto max-h-[320px] sm:max-h-[380px] font-mono scrollbar-thin text-xs"
        role="log"
        aria-live="polite"
      >
        {state.transcript.map((entry) => (
          <div key={entry.id} className="space-y-1">
            <div className="flex items-center gap-2 text-white/50 text-[11px]">
              <span className="text-[var(--landing-terminal-accent)]">$</span>
              <span className="text-white/90 font-bold">{entry.command}</span>
              <span className="ml-auto text-[10px]">{entry.timestamp}</span>
            </div>
            <div
              className={`pl-4 py-1 border-l-2 text-xs leading-relaxed ${
                entry.status === "error"
                  ? "border-rose-500 text-rose-300 bg-rose-500/10 rounded-r px-2"
                  : entry.status === "info"
                  ? "border-cyan-500 text-cyan-200"
                  : "border-emerald-500 text-emerald-300"
              }`}
            >
              {entry.summary}
            </div>
          </div>
        ))}
      </div>

      {/* Terminal Input Form */}
      <form
        onSubmit={handleSubmit}
        className="p-3 bg-white/5 border-t border-white/10 flex items-center gap-2"
      >
        <div className="flex items-center gap-2 flex-1 px-3 py-2 rounded-xl bg-black/40 border border-white/10 focus-within:border-[var(--landing-terminal-accent)] transition-colors">
          <span className="text-[var(--landing-terminal-accent)] font-bold select-none">$</span>
          <input
            type="text"
            value={command}
            onChange={(e) => onCommandChange(e.target.value)}
            placeholder="Type or select a sample command..."
            maxLength={500}
            spellCheck={false}
            autoCorrect="off"
            autoCapitalize="off"
            className="w-full bg-transparent text-white outline-none placeholder:text-white/30 text-xs sm:text-sm font-mono"
          />
        </div>

        <button
          type="submit"
          disabled={!command.trim()}
          className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[var(--landing-primary)] hover:bg-[var(--landing-primary-hover)] text-white font-medium text-xs sm:text-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer shadow-md shadow-[var(--landing-primary)]/20 active:scale-95"
        >
          <Play className="w-3.5 h-3.5 fill-current" />
          <span className="hidden sm:inline">Run</span>
        </button>

        <button
          type="button"
          onClick={onNext}
          title="Load next workflow command"
          className="flex items-center gap-1 px-3 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs sm:text-sm transition-colors cursor-pointer"
        >
          <span className="hidden sm:inline">Next</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </form>
    </div>
  );
}
