import { forwardRef } from "react";

interface DocsLineHighlightProps {
  content: string;
  lineHighlight: { start: number; end: number };
  onDismiss: () => void;
}

export const DocsLineHighlight = forwardRef<HTMLDivElement, DocsLineHighlightProps>(
  ({ content, lineHighlight, onDismiss }, ref) => {
    const lines = content.split("\n");
    const start = Math.max(1, lineHighlight.start);
    const end = Math.min(lines.length, lineHighlight.end);
    const excerptLines = lines.slice(start - 1, end);
    if (excerptLines.length === 0) return null;

    return (
      <div ref={ref} className="mb-6 rounded-xl border border-amber-300/50 bg-amber-50/60 dark:border-amber-500/30 dark:bg-amber-950/20 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2 border-b border-amber-300/30 dark:border-amber-500/20">
          <span className="text-xs font-medium text-amber-800 dark:text-amber-300">
            {start === end ? `Line ${start}` : `Lines ${start}–${end}`}
          </span>
          <button
            type="button"
            onClick={onDismiss}
            className="text-xs text-amber-600 hover:text-amber-800 dark:text-amber-400 dark:hover:text-amber-200 transition-colors"
          >
            Dismiss
          </button>
        </div>
        <div className="overflow-x-auto">
          <pre className="text-sm leading-6 p-0 m-0 bg-transparent">
            <code>
              {excerptLines.map((line, i) => (
                <div
                  key={start + i}
                  className="flex bg-amber-100/60 dark:bg-amber-900/20"
                >
                  <span className="select-none shrink-0 w-12 text-right pr-3 pl-3 text-amber-500/70 dark:text-amber-500/50 text-xs leading-6 font-mono">
                    {start + i}
                  </span>
                  <span className="flex-1 pr-4 whitespace-pre-wrap break-all font-mono">
                    {line || "\u00A0"}
                  </span>
                </div>
              ))}
            </code>
          </pre>
        </div>
      </div>
    );
  }
);

DocsLineHighlight.displayName = "DocsLineHighlight";
