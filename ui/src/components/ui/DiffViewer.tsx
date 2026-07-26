import { useMemo } from "react";
import { diffLines } from "diff";
import { cn } from "../../lib/utils";

const CONTEXT = 3;

interface DiffViewerProps {
  oldValue?: string;
  newValue?: string;
  className?: string;
  filePath?: string;
}

type LineEntry =
  | { kind: "add"; text: string; newNum: number }
  | { kind: "remove"; text: string; oldNum: number }
  | { kind: "context"; text: string; oldNum: number; newNum: number };

type Segment = { lines: LineEntry[] };

function buildSegments(old: string, next: string): Segment[] {
  const hunks = diffLines(old, next);
  const allLines: LineEntry[] = [];
  let oldLine = 1;
  let newLine = 1;

  for (const hunk of hunks) {
    const lines = hunk.value.replace(/\n$/, "").split("\n");
    if (hunk.removed) {
      for (const text of lines) allLines.push({ kind: "remove", text, oldNum: oldLine++ });
    } else if (hunk.added) {
      for (const text of lines) allLines.push({ kind: "add", text, newNum: newLine++ });
    } else {
      for (const text of lines) allLines.push({ kind: "context", text, oldNum: oldLine++, newNum: newLine++ });
    }
  }

  const showSet = new Set<number>();
  for (let i = 0; i < allLines.length; i++) {
    if (allLines[i].kind !== "context") {
      for (let j = Math.max(0, i - CONTEXT); j <= Math.min(allLines.length - 1, i + CONTEXT); j++) {
        showSet.add(j);
      }
    }
  }

  if (showSet.size === 0) return [];

  const segments: Segment[] = [];
  let current: LineEntry[] | null = null;
  let prevIdx = -2;

  for (let i = 0; i < allLines.length; i++) {
    if (!showSet.has(i)) {
      if (current) { segments.push({ lines: current }); current = null; }
      prevIdx = -2;
      continue;
    }
    if (current === null || i !== prevIdx + 1) {
      if (current) segments.push({ lines: current });
      current = [];
    }
    current.push(allLines[i]);
    prevIdx = i;
  }
  if (current) segments.push({ lines: current });

  return segments;
}

function newFileSegments(value: string): Segment[] {
  const lines = value.replace(/\n$/, "").split("\n");
  return [{ lines: lines.map((text, i) => ({ kind: "add" as const, text, newNum: i + 1 })) }];
}

function deletedFileSegments(value: string): Segment[] {
  const lines = value.replace(/\n$/, "").split("\n");
  return [{ lines: lines.map((text, i) => ({ kind: "remove" as const, text, oldNum: i + 1 })) }];
}

function LineNum({ n }: { n?: number }) {
  return (
    <span className="mr-3 inline-block w-7 shrink-0 select-none text-right opacity-35 tabular-nums">
      {n ?? ""}
    </span>
  );
}

export function DiffViewer({ oldValue, newValue, className = "" }: DiffViewerProps) {
  const hasOld = Boolean(oldValue?.trim());
  const hasNew = Boolean(newValue?.trim());

  const segments = useMemo<Segment[]>(() => {
    if (!hasOld && !hasNew) return [];
    if (!hasOld) return newFileSegments(newValue ?? "");
    if (!hasNew) return deletedFileSegments(oldValue ?? "");
    return buildSegments(oldValue!, newValue!);
  }, [oldValue, newValue, hasOld, hasNew]);

  if (!hasOld && !hasNew) {
    return <div className={cn("p-2 text-xs text-muted-foreground", className)}>No content</div>;
  }
  if (segments.length === 0) {
    return <div className={cn("p-2 text-xs text-muted-foreground", className)}>No changes</div>;
  }

  return (
    <div className={cn("overflow-hidden rounded-md border border-border font-mono text-xs", className)}>
      {segments.map((seg, si) => (
        <div key={si}>
          {si > 0 && (
            <div className="flex select-none items-center gap-2 bg-muted/30 px-2 py-0.5 text-[10px] text-muted-foreground/60">
              <span className="w-7 text-right">···</span>
              <span>···</span>
            </div>
          )}
          {seg.lines.map((line, li) => {
            if (line.kind === "remove") {
              return (
                <div key={li} className="flex bg-red-50 px-2 py-px text-red-700 dark:bg-red-950/40 dark:text-red-300">
                  <LineNum n={line.oldNum} />
                  <span className="mr-2 select-none opacity-70">-</span>
                  <span className="min-w-0 flex-1 whitespace-pre-wrap break-words">{line.text}</span>
                </div>
              );
            }
            if (line.kind === "add") {
              return (
                <div key={li} className="flex bg-green-50 px-2 py-px text-green-700 dark:bg-green-950/40 dark:text-green-300">
                  <LineNum n={line.newNum} />
                  <span className="mr-2 select-none opacity-70">+</span>
                  <span className="min-w-0 flex-1 whitespace-pre-wrap break-words">{line.text}</span>
                </div>
              );
            }
            return (
              <div key={li} className="flex px-2 py-px text-foreground/60">
                <LineNum n={line.oldNum} />
                <span className="mr-2 select-none opacity-0">·</span>
                <span className="min-w-0 flex-1 whitespace-pre-wrap break-words">{line.text}</span>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
