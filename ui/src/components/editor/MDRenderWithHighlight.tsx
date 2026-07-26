import { useMemo, useRef, useEffect, forwardRef } from "react";
import MDRender from "./MDRender";

interface MDRenderWithHighlightProps {
  content: string;
  lineHighlight?: { start: number; end: number } | null;
  className?: string;
  onDocLinkClick?: (path: string) => void;
  onTaskLinkClick?: (taskId: string) => void;
  showHeadingAnchors?: boolean;
  onHeadingAnchorClick?: (id: string) => void;
  /** Called when user dismisses the highlight (e.g. clicking X) */
  onDismissHighlight?: () => void;
}

/**
 * Expand [start, end] (1-based) to fully contain any fenced code block or
 * table that overlaps the range, so we never split mid-block.
 */
function expandToBlockBoundaries(lines: string[], start: number, end: number): { start: number; end: number } {
  let s = start - 1; // convert to 0-based
  let e = end - 1;

  // Walk backwards from s to find any unclosed fenced code block
  let fenceDepth = 0;
  for (let i = s; i >= 0; i--) {
    if (/^(`{3,}|~{3,})/.test(lines[i])) {
      fenceDepth++;
      if (fenceDepth % 2 === 1) {
        // Odd count means we're inside a block that opened at i
        s = i;
        // Find the closing fence
        const opener = lines[i].match(/^(`{3,}|~{3,})/)?.[1] ?? "```";
        for (let j = i + 1; j < lines.length; j++) {
          if (lines[j].startsWith(opener) && lines[j].trim() === opener) {
            e = Math.max(e, j);
            break;
          }
        }
        break;
      }
    }
  }

  // Expand end to close any unclosed fenced block within [s, e]
  let inFence = false;
  let fenceMarker = "";
  for (let i = s; i <= e; i++) {
    const m = lines[i].match(/^(`{3,}|~{3,})/);
    if (m) {
      if (!inFence) {
        inFence = true;
        fenceMarker = m[1];
      } else if (lines[i].startsWith(fenceMarker) && lines[i].trim() === fenceMarker) {
        inFence = false;
        fenceMarker = "";
      }
    }
  }
  if (inFence) {
    // Find closing fence
    for (let i = e + 1; i < lines.length; i++) {
      if (lines[i].startsWith(fenceMarker) && lines[i].trim() === fenceMarker) {
        e = i;
        break;
      }
    }
  }

  // Expand to include full table: if any line in range is a table row, include
  // contiguous table lines above and below
  const isTableRow = (l: string) => /^\s*\|/.test(l) || /\|/.test(l);
  if (lines.slice(s, e + 1).some(isTableRow)) {
    while (s > 0 && isTableRow(lines[s - 1])) s--;
    while (e < lines.length - 1 && isTableRow(lines[e + 1])) e++;
  }

  return { start: s + 1, end: e + 1 }; // back to 1-based
}

/**
 * MDRender with optional line-range highlight.
 * Splits markdown into before/highlighted/after sections and renders them
 * with the highlighted section visually emphasized and the rest dimmed.
 */
export const MDRenderWithHighlight = forwardRef<HTMLDivElement, MDRenderWithHighlightProps>(
  ({ content, lineHighlight, className = "", onDocLinkClick, onTaskLinkClick, showHeadingAnchors, onHeadingAnchorClick, onDismissHighlight }, ref) => {
    const highlightRef = useRef<HTMLDivElement>(null);

    const parts = useMemo(() => {
      if (!lineHighlight || !content) return null;
      const lines = content.split("\n");
      const rawStart = Math.max(1, lineHighlight.start);
      const rawEnd = Math.min(lines.length, lineHighlight.end);
      if (rawStart > lines.length) return null;

      const { start, end } = expandToBlockBoundaries(lines, rawStart, rawEnd);
      const origLabel = rawStart === rawEnd ? `Line ${rawStart}` : `Lines ${rawStart}–${rawEnd}`;

      return {
        before: lines.slice(0, start - 1).join("\n"),
        highlighted: lines.slice(start - 1, end).join("\n"),
        after: lines.slice(end).join("\n"),
        label: origLabel,
      };
    }, [content, lineHighlight]);

    // Scroll highlighted section into view
    useEffect(() => {
      if (parts && highlightRef.current) {
        requestAnimationFrame(() =>
          highlightRef.current?.scrollIntoView({ behavior: "smooth", block: "center" })
        );
      }
    }, [parts]);

    // Expose the highlight element via forwarded ref
    useEffect(() => {
      if (ref && typeof ref === "object") {
        (ref as React.MutableRefObject<HTMLDivElement | null>).current = highlightRef.current;
      }
    }, [ref]);

    const sharedProps = { onDocLinkClick, onTaskLinkClick, showHeadingAnchors, onHeadingAnchorClick };

    if (!parts) {
      return <MDRender markdown={content} className={className} {...sharedProps} />;
    }

    return (
      <div className={className}>
        {parts.before && (
          <div className="opacity-40 pointer-events-none select-none">
            <MDRender markdown={parts.before} {...sharedProps} />
          </div>
        )}

        <div ref={highlightRef} className="relative rounded-lg border border-amber-300/60 bg-amber-50/50 dark:border-amber-500/30 dark:bg-amber-950/20 px-4 py-2 my-2">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-medium text-amber-700 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/60 px-1.5 py-0.5 rounded">
              {parts.label}
            </span>
            {onDismissHighlight && (
              <button
                type="button"
                onClick={onDismissHighlight}
                className="text-[10px] text-amber-600 hover:text-amber-800 dark:text-amber-400 dark:hover:text-amber-200 transition-colors"
              >
                Dismiss
              </button>
            )}
          </div>
          <MDRender markdown={parts.highlighted} {...sharedProps} />
        </div>

        {parts.after && (
          <div className="opacity-40 pointer-events-none select-none">
            <MDRender markdown={parts.after} {...sharedProps} />
          </div>
        )}
      </div>
    );
  }
);

MDRenderWithHighlight.displayName = "MDRenderWithHighlight";
