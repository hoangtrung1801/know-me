import { useState, useRef, type ReactNode } from "react";
import { ClipboardCheck, Check, Loader2 } from "lucide-react";
import { extractTextFromChildren, slugifyHeading, type HeadingMeta } from "./headingUtils";

/** Copyable code block wrapper. */
export function CopyablePre({ children, ...props }: { children?: ReactNode }) {
  const [copied, setCopied] = useState(false);
  const preRef = useRef<HTMLPreElement>(null);

  const handleCopy = () => {
    const text = preRef.current?.textContent || "";
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="group relative">
      <button
        type="button"
        onClick={handleCopy}
        className="absolute top-2 right-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-md bg-muted hover:bg-muted/80 border border-border text-muted-foreground hover:text-foreground"
        title="Copy code"
      >
        {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <ClipboardCheck className="w-3.5 h-3.5" />}
      </button>
      <pre ref={preRef} className="p-4 rounded-lg overflow-x-auto text-sm hljs-pre" {...props}>
        {children}
      </pre>
    </div>
  );
}

/** Copyable table wrapper with markdown export. */
export function CopyableTable({ children, ...props }: { children?: ReactNode }) {
  const [copied, setCopied] = useState(false);
  const tableRef = useRef<HTMLTableElement>(null);

  const handleCopyTable = () => {
    if (!tableRef.current) return;
    const rows = tableRef.current.querySelectorAll("tr");
    const markdownRows: string[] = [];
    rows.forEach((row, rowIndex) => {
      const cells = row.querySelectorAll("th, td");
      const cellTexts = Array.from(cells).map((cell) => cell.textContent?.trim() || "");
      markdownRows.push(`| ${cellTexts.join(" | ")} |`);
      if (rowIndex === 0) {
        markdownRows.push(`| ${cellTexts.map(() => "---").join(" | ")} |`);
      }
    });
    navigator.clipboard.writeText(markdownRows.join("\n")).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="table-wrapper group relative my-4 overflow-x-auto rounded-lg border border-border">
      <button
        type="button"
        onClick={handleCopyTable}
        className="absolute top-2 right-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-md bg-muted hover:bg-muted/80 border border-border text-muted-foreground hover:text-foreground"
        title="Copy as Markdown"
      >
        {copied ? <Check className="w-4 h-4 text-green-500" /> : <ClipboardCheck className="w-4 h-4" />}
      </button>
      <table ref={tableRef} className="w-full border-collapse text-sm" {...props}>
        {children}
      </table>
    </div>
  );
}

/** Heading with stable identity — reads mutable state via refs. */
export function StableHeading({
  level,
  children,
  headingMetaRef,
  headingRenderIndexRef,
  showHeadingAnchorsRef,
  onHeadingAnchorClickRef,
  ...props
}: {
  level: number;
  children?: ReactNode;
  headingMetaRef: React.RefObject<HeadingMeta[]>;
  headingRenderIndexRef: React.MutableRefObject<number>;
  showHeadingAnchorsRef: React.RefObject<boolean>;
  onHeadingAnchorClickRef: React.RefObject<((id: string) => void) | undefined>;
}) {
  const Tag = `h${level}` as "h2" | "h3" | "h4";
  if (!showHeadingAnchorsRef.current) {
    return <Tag {...props}>{children}</Tag>;
  }

  const text = extractTextFromChildren(children);
  const meta = headingMetaRef.current[headingRenderIndexRef.current];
  headingRenderIndexRef.current += 1;

  const number = meta?.number ?? "";
  const id = meta?.id ?? slugifyHeading(text);

  const headingClassName =
    level <= 3
      ? "group relative scroll-mt-4 flex items-baseline gap-2"
      : "group relative scroll-mt-4 flex items-baseline gap-1.5";

  return (
    <Tag id={id} data-heading-slug={slugifyHeading(text)} className={headingClassName} {...props}>
      {number && (
        <span className="inline-block text-[0.72em] font-semibold text-muted-foreground/50 select-none leading-none translate-y-[1px]">
          {number}
        </span>
      )}
      <span className="min-w-0">{children}</span>
      <a
        href={`#${id}`}
        className="ml-1 text-muted-foreground/0 group-hover:text-muted-foreground/50 hover:!text-foreground transition-colors no-underline leading-none"
        aria-label={`Link to section ${number}${text ? ` ${text}` : ""}`}
        onClick={(e) => {
          if (onHeadingAnchorClickRef.current) {
            e.preventDefault();
            onHeadingAnchorClickRef.current(id);
          }
        }}
      >
        #
      </a>
    </Tag>
  );
}

/** Mermaid diagram loading placeholder. */
export function MermaidLoading() {
  return (
    <div className="my-4 p-4 rounded-lg border bg-muted/30 animate-pulse">
      <div className="h-32 flex items-center justify-center text-muted-foreground gap-2">
        <Loader2 className="w-4 h-4 animate-spin" />
        Loading diagram...
      </div>
    </div>
  );
}
