import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { useClipboard } from "../hooks/useClipboard";
import { cn } from "../lib/utils";

export interface InstallCommandProps {
  command: string;
  label?: string;
  className?: string;
}

export function InstallCommand({
  command,
  label = "Copy install command",
  className,
}: InstallCommandProps) {
  const { status, copy } = useClipboard();
  const [showTooltip, setShowTooltip] = useState(false);

  const handleCopy = () => {
    copy(command);
  };

  return (
    <div
      className={cn(
        "group relative flex items-center justify-between gap-3 px-4 py-2.5 rounded-xl",
        "bg-[var(--landing-terminal)] text-[var(--landing-terminal-text)] border border-white/10 shadow-md",
        "font-mono text-xs sm:text-sm selection:bg-[var(--landing-primary)] selection:text-white",
        className
      )}
    >
      <div className="flex items-center gap-2 overflow-x-auto select-all pr-2 scrollbar-none">
        <span className="text-[var(--landing-primary)] font-bold select-none">$</span>
        <code className="whitespace-nowrap">{command}</code>
      </div>

      <button
        type="button"
        onClick={handleCopy}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        aria-label={label}
        className={cn(
          "relative z-10 flex items-center justify-center min-w-[36px] min-h-[36px] sm:min-w-[40px] sm:min-h-[40px] px-2.5 py-1.5 rounded-lg",
          "bg-white/10 hover:bg-white/20 active:bg-white/30 text-white transition-colors cursor-pointer",
          status === "copied" && "bg-[var(--landing-primary)] text-white hover:bg-[var(--landing-primary)]"
        )}
      >
        {status === "copied" ? (
          <Check className="w-4 h-4 text-white" aria-hidden="true" />
        ) : (
          <Copy className="w-4 h-4 text-white/80 group-hover:text-white" aria-hidden="true" />
        )}
        <span className="sr-only">
          {status === "copied" ? "Copied to clipboard" : status === "error" ? "Select text to copy" : label}
        </span>
      </button>

      {/* Accessible live status */}
      <span className="sr-only" role="status" aria-live="polite">
        {status === "copied" ? "Command copied to clipboard" : ""}
      </span>
    </div>
  );
}
