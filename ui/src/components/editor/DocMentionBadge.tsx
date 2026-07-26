import { useState, useEffect, useMemo } from "react";
import { FileText } from "lucide-react";
import { getDoc } from "../../api/client";
import { navigateTo } from "../../lib/navigation";
import { docMentionClass, docMentionBrokenClass, semanticFragmentClass } from "./mentionUtils";

/**
 * Parse doc mention suffix — extracts line, range, or heading from docPath.
 * Supports both mention-style (:10-20) and URL-style (?L=10-20) suffixes.
 */
export function parseDocFragment(raw: string): {
  path: string;
  line?: number;
  startLine?: number;
  endLine?: number;
  heading?: string;
} {
  // Mention-style suffixes (:line, :start-end)
  const rangeMatch = raw.match(/^(.+?):(\d+)-(\d+)$/);
  if (rangeMatch && rangeMatch[1] && rangeMatch[2] && rangeMatch[3])
    return { path: rangeMatch[1], startLine: +rangeMatch[2], endLine: +rangeMatch[3] };
  const lineMatch = raw.match(/^(.+?):(\d+)$/);
  if (lineMatch && lineMatch[1] && lineMatch[2])
    return { path: lineMatch[1], line: +lineMatch[2] };
  const headingMatch = raw.match(/^(.+?)#([a-zA-Z0-9_-]+(?:[a-zA-Z0-9_. -]*)?)$/);
  if (headingMatch && headingMatch[1] && headingMatch[2])
    return { path: headingMatch[1], heading: headingMatch[2] };

  // URL-style suffixes (?L=line, ?L=start-end) — defensive fallback
  const urlRangeMatch = raw.match(/^(.+?)\?L=(\d+)-(\d+)$/);
  if (urlRangeMatch && urlRangeMatch[1] && urlRangeMatch[2] && urlRangeMatch[3])
    return { path: urlRangeMatch[1], startLine: +urlRangeMatch[2], endLine: +urlRangeMatch[3] };
  const urlLineMatch = raw.match(/^(.+?)\?L=(\d+)$/);
  if (urlLineMatch && urlLineMatch[1] && urlLineMatch[2])
    return { path: urlLineMatch[1], line: +urlLineMatch[2] };

  return { path: raw };
}

export function docFragmentToQuery(frag: ReturnType<typeof parseDocFragment>): string {
  if (frag.startLine != null && frag.endLine != null) return `?L=${frag.startLine}-${frag.endLine}`;
  if (frag.line != null) return `?L=${frag.line}`;
  if (frag.heading) return `#${frag.heading}`;
  return "";
}

export function docFragmentDisplay(frag: ReturnType<typeof parseDocFragment>): string {
  if (frag.startLine != null && frag.endLine != null) return `:${frag.startLine}-${frag.endLine}`;
  if (frag.line != null) return `:${frag.line}`;
  if (frag.heading) return `#${frag.heading}`;
  return "";
}

/**
 * Doc mention badge that fetches and displays the doc title.
 * Supports line (:42), range (:10-20), and heading (#overview) suffixes.
 */
export function DocMentionBadge({
  docPath,
  onDocLinkClick,
}: {
  docPath: string;
  onDocLinkClick?: (path: string) => void;
}) {
  const frag = useMemo(() => parseDocFragment(docPath), [docPath]);
  const [title, setTitle] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [actualPath, setActualPath] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    getDoc(frag.path)
      .then((doc) => {
        if (!cancelled && doc) {
          setTitle(doc.title || null);
          setActualPath(doc.path);
          setNotFound(false);
          setLoading(false);
        } else if (!cancelled) {
          setNotFound(true);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setTitle(null);
          setNotFound(true);
          setLoading(false);
        }
      });

    return () => { cancelled = true; };
  }, [frag.path]);

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (notFound) return;
    const targetPath = actualPath || frag.path;
    const query = docFragmentToQuery(frag);
    if (onDocLinkClick) {
      onDocLinkClick(`${targetPath}${query}`);
    } else {
      navigateTo(`/docs/${targetPath}${query}`);
    }
  };

  const shortPath = frag.path.replace(/\.md$/, "").split("/").pop() || frag.path;
  const suffix = docFragmentDisplay(frag);
  const mentionClass = notFound ? docMentionBrokenClass : docMentionClass;

  return (
    <span
      role={notFound ? undefined : "link"}
      className={mentionClass}
      data-doc-path={frag.path}
      onClick={handleClick}
      title={notFound ? `Document not found: ${frag.path}` : title ? `${title}${suffix}` : undefined}
    >
      <FileText className="w-3 h-3 shrink-0 opacity-60" />
      {loading ? (
        <>
          <span className="max-w-[220px] truncate opacity-60">{shortPath}</span>
          {suffix && <span className={semanticFragmentClass}>{suffix}</span>}
        </>
      ) : title ? (
        <>
          <span className="max-w-[220px] truncate">{title}</span>
          {suffix && <span className={semanticFragmentClass}>{suffix}</span>}
        </>
      ) : (
        <>
          <span className="max-w-[220px] truncate">{shortPath}</span>
          {suffix && <span className={semanticFragmentClass}>{suffix}</span>}
        </>
      )}
    </span>
  );
}
