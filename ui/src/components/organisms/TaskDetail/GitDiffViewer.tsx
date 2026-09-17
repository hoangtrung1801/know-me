import React, { useMemo, useState, useCallback } from "react";
import {
  ChevronDown,
  ChevronRight,
  Copy,
  Check,
  FileCode,
  FileText,
  Plus,
  Trash2,
  Maximize2,
  Minimize2,
} from "lucide-react";
import { Badge } from "../../ui/badge";
import { Button } from "../../ui/button";

export type DiffFileStatus = "added" | "deleted" | "modified" | "untracked";

export interface DiffLine {
  type: "add" | "delete" | "context" | "hunk-header";
  content: string;
  oldLineNumber?: number;
  newLineNumber?: number;
}

export interface DiffHunk {
  header: string;
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
  lines: DiffLine[];
}

export interface DiffFile {
  oldPath: string;
  newPath: string;
  status: DiffFileStatus;
  additions: number;
  deletions: number;
  hunks: DiffHunk[];
  isBinary?: boolean;
}

export interface GitDiffViewerProps {
  diff?: string;
  dirtyFiles?: string[];
  className?: string;
}

export function parseUnifiedDiff(rawDiff: string, dirtyFiles?: string[]): {
  files: DiffFile[];
  totalAdditions: number;
  totalDeletions: number;
} {
  const files: DiffFile[] = [];
  let currentFile: DiffFile | null = null;
  let currentHunk: DiffHunk | null = null;
  let curOld = 0;
  let curNew = 0;

  const lines = rawDiff.split("\n");
  let inUntrackedSection = false;
  const untrackedFromDiff: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.startsWith("# Modified/Untracked files:")) {
      inUntrackedSection = true;
      continue;
    }
    if (inUntrackedSection) {
      if (line.startsWith("#   ")) {
        const path = line.slice(4).trim();
        if (path) untrackedFromDiff.push(path);
      }
      continue;
    }

    if (line.startsWith("diff --git ")) {
      if (currentFile) {
        files.push(currentFile);
      }
      const match = line.match(/^diff --git a\/(.+) b\/(.+)$/);
      const oldPath = match ? match[1] : "";
      const newPath = match ? match[2] : "";

      currentFile = {
        oldPath: oldPath || newPath,
        newPath: newPath || oldPath,
        status: "modified",
        additions: 0,
        deletions: 0,
        hunks: [],
      };
      currentHunk = null;
      continue;
    }

    if (!currentFile) {
      continue;
    }

    if (line.startsWith("new file mode")) {
      currentFile.status = "added";
      continue;
    }
    if (line.startsWith("deleted file mode")) {
      currentFile.status = "deleted";
      continue;
    }
    if (line.startsWith("--- /dev/null")) {
      currentFile.status = "added";
      continue;
    }
    if (line.startsWith("+++ /dev/null")) {
      currentFile.status = "deleted";
      continue;
    }
    if (line.startsWith("Binary files ") && line.includes("differ")) {
      currentFile.isBinary = true;
      continue;
    }

    const hunkMatch = line.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)$/);
    if (hunkMatch) {
      curOld = parseInt(hunkMatch[1], 10);
      const oldCount = hunkMatch[2] !== undefined ? parseInt(hunkMatch[2], 10) : 1;
      curNew = parseInt(hunkMatch[3], 10);
      const newCount = hunkMatch[4] !== undefined ? parseInt(hunkMatch[4], 10) : 1;

      currentHunk = {
        header: line,
        oldStart: curOld,
        oldCount,
        newStart: curNew,
        newCount,
        lines: [],
      };
      currentFile.hunks.push(currentHunk);
      continue;
    }

    if (!currentHunk) {
      continue;
    }

    if (line.startsWith("+")) {
      currentHunk.lines.push({
        type: "add",
        content: line.slice(1),
        newLineNumber: curNew,
      });
      curNew++;
      currentFile.additions++;
    } else if (line.startsWith("-")) {
      currentHunk.lines.push({
        type: "delete",
        content: line.slice(1),
        oldLineNumber: curOld,
      });
      curOld++;
      currentFile.deletions++;
    } else if (line.startsWith(" ")) {
      currentHunk.lines.push({
        type: "context",
        content: line.slice(1),
        oldLineNumber: curOld,
        newLineNumber: curNew,
      });
      curOld++;
      curNew++;
    } else if (line.startsWith("\\ No newline at end of file")) {
      // Skip git warning line from diff representation
    }
  }

  if (currentFile) {
    files.push(currentFile);
  }

  // Merge dirtyFiles and untracked files not already present in the parsed files list
  const allUntracked = new Set<string>([...untrackedFromDiff, ...(dirtyFiles || [])]);
  for (const untracked of allUntracked) {
    const exists = files.some(
      (f) => f.newPath === untracked || f.oldPath === untracked
    );
    if (!exists) {
      files.push({
        oldPath: untracked,
        newPath: untracked,
        status: "untracked",
        additions: 0,
        deletions: 0,
        hunks: [],
      });
    }
  }

  let totalAdditions = 0;
  let totalDeletions = 0;
  for (const file of files) {
    totalAdditions += file.additions;
    totalDeletions += file.deletions;
  }

  return { files, totalAdditions, totalDeletions };
}

export function GitDiffViewer({
  diff = "",
  dirtyFiles = [],
  className = "",
}: GitDiffViewerProps) {
  const { files, totalAdditions, totalDeletions } = useMemo(
    () => parseUnifiedDiff(diff, dirtyFiles),
    [diff, dirtyFiles]
  );

  const [expandedFiles, setExpandedFiles] = useState<Record<string, boolean>>({});
  const [copied, setCopied] = useState(false);

  const isFileExpanded = useCallback(
    (filePath: string) => {
      if (expandedFiles[filePath] !== undefined) {
        return expandedFiles[filePath];
      }
      return true; // default expanded
    },
    [expandedFiles]
  );

  const toggleFile = (filePath: string) => {
    setExpandedFiles((prev) => ({
      ...prev,
      [filePath]: !isFileExpanded(filePath),
    }));
  };

  const expandAll = () => {
    const next: Record<string, boolean> = {};
    for (const file of files) {
      next[file.newPath] = true;
    }
    setExpandedFiles(next);
  };

  const collapseAll = () => {
    const next: Record<string, boolean> = {};
    for (const file of files) {
      next[file.newPath] = false;
    }
    setExpandedFiles(next);
  };

  const handleCopyDiff = async () => {
    if (!diff) return;
    try {
      await navigator.clipboard.writeText(diff);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard write fallback
    }
  };

  if (files.length === 0) {
    return (
      <div className={`rounded-md border border-border/40 p-4 text-center text-sm text-muted-foreground ${className}`}>
        No changes detected in workspace.
      </div>
    );
  }

  return (
    <div className={`space-y-3 ${className}`}>
      {/* Summary Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/60 bg-muted/20 px-3 py-2 text-sm">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-foreground">
            {files.length} {files.length === 1 ? "file" : "files"} changed
          </span>
          {totalAdditions > 0 && (
            <span className="inline-flex items-center rounded bg-emerald-500/10 px-1.5 py-0.5 font-mono text-xs font-semibold text-emerald-700 dark:text-emerald-400">
              +{totalAdditions}
            </span>
          )}
          {totalDeletions > 0 && (
            <span className="inline-flex items-center rounded bg-rose-500/10 px-1.5 py-0.5 font-mono text-xs font-semibold text-rose-700 dark:text-rose-400">
              -{totalDeletions}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
            onClick={expandAll}
            title="Expand all files"
          >
            <Maximize2 className="mr-1 h-3.5 w-3.5" /> Expand all
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
            onClick={collapseAll}
            title="Collapse all files"
          >
            <Minimize2 className="mr-1 h-3.5 w-3.5" /> Collapse all
          </Button>
          {diff && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={handleCopyDiff}
              title="Copy unified diff"
            >
              {copied ? (
                <>
                  <Check className="mr-1 h-3.5 w-3.5 text-emerald-600" /> Copied
                </>
              ) : (
                <>
                  <Copy className="mr-1 h-3.5 w-3.5" /> Copy diff
                </>
              )}
            </Button>
          )}
        </div>
      </div>

      {/* File Accordions */}
      <div className="space-y-2">
        {files.map((file) => {
          const expanded = isFileExpanded(file.newPath);
          const lastSlash = file.newPath.lastIndexOf("/");
          const dir = lastSlash >= 0 ? file.newPath.slice(0, lastSlash + 1) : "";
          const filename = lastSlash >= 0 ? file.newPath.slice(lastSlash + 1) : file.newPath;

          return (
            <div
              key={file.newPath}
              className="overflow-hidden rounded-md border border-border/70 bg-card text-card-foreground shadow-xs"
            >
              {/* File Header */}
              <button
                type="button"
                className="flex w-full cursor-pointer items-center justify-between gap-2 bg-muted/40 px-3 py-2 text-left text-xs font-mono transition-colors hover:bg-muted/70"
                onClick={() => toggleFile(file.newPath)}
                aria-expanded={expanded}
              >
                <div className="flex min-w-0 items-center gap-2">
                  {expanded ? (
                    <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                  )}
                  {file.status === "added" && (
                    <span title="Added file">
                      <Plus className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                    </span>
                  )}
                  {file.status === "deleted" && (
                    <span title="Deleted file">
                      <Trash2 className="h-4 w-4 shrink-0 text-rose-600 dark:text-rose-400" />
                    </span>
                  )}
                  {file.status === "modified" && (
                    <span title="Modified file">
                      <FileCode className="h-4 w-4 shrink-0 text-sky-600 dark:text-sky-400" />
                    </span>
                  )}
                  {file.status === "untracked" && (
                    <span title="Untracked file">
                      <FileText className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                    </span>
                  )}
                  <div className="truncate">
                    {dir && <span className="text-muted-foreground/70">{dir}</span>}
                    <span className="font-semibold text-foreground">{filename}</span>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2 font-mono text-[11px]">
                  {file.status === "untracked" && (
                    <Badge variant="outline" className="text-[10px] text-amber-700 dark:text-amber-300">
                      untracked
                    </Badge>
                  )}
                  {file.status === "added" && (
                    <Badge variant="outline" className="text-[10px] text-emerald-700 dark:text-emerald-300">
                      new
                    </Badge>
                  )}
                  {file.status === "deleted" && (
                    <Badge variant="outline" className="text-[10px] text-rose-700 dark:text-rose-300">
                      deleted
                    </Badge>
                  )}
                  {file.additions > 0 && (
                    <span className="text-emerald-600 dark:text-emerald-400">+{file.additions}</span>
                  )}
                  {file.deletions > 0 && (
                    <span className="text-rose-600 dark:text-rose-400">-{file.deletions}</span>
                  )}
                </div>
              </button>

              {/* File Body */}
              {expanded && (
                <div className="border-t border-border/40">
                  {file.isBinary ? (
                    <div className="p-3 text-xs italic text-muted-foreground">
                      Binary file differs.
                    </div>
                  ) : file.status === "untracked" ? (
                    <div className="p-3 text-xs text-muted-foreground">
                      Untracked file in workspace.
                    </div>
                  ) : file.hunks.length === 0 ? (
                    <div className="p-3 text-xs italic text-muted-foreground">
                      Empty file or file mode changed without content diff.
                    </div>
                  ) : (
                    <div className="max-h-[500px] overflow-auto font-mono text-xs">
                      {file.hunks.map((hunk, hunkIdx) => (
                        <div key={hunkIdx}>
                          {/* Hunk Header */}
                          <div className="border-y border-sky-500/20 bg-sky-500/10 px-3 py-1 font-mono text-[11px] text-sky-700 select-none dark:text-sky-300">
                            {hunk.header}
                          </div>

                          {/* Hunk Lines */}
                          <div className="divide-y divide-border/10">
                            {hunk.lines.map((line, lineIdx) => {
                              const isAdd = line.type === "add";
                              const isDel = line.type === "delete";

                              return (
                                <div
                                  key={lineIdx}
                                  className={`flex items-stretch leading-5 transition-colors ${
                                    isAdd
                                      ? "bg-emerald-500/10 text-emerald-950 dark:text-emerald-100 hover:bg-emerald-500/15"
                                      : isDel
                                      ? "bg-rose-500/10 text-rose-950 dark:text-rose-100 hover:bg-rose-500/15"
                                      : "text-foreground/80 hover:bg-muted/40"
                                  }`}
                                >
                                  {/* Line Numbers */}
                                  <span className="w-10 shrink-0 select-none pr-2 text-right font-mono text-[10px] text-muted-foreground/50 tabular-nums">
                                    {line.oldLineNumber ?? ""}
                                  </span>
                                  <span className="w-10 shrink-0 select-none pr-2 text-right font-mono text-[10px] text-muted-foreground/50 tabular-nums">
                                    {line.newLineNumber ?? ""}
                                  </span>

                                  {/* Marker Sign */}
                                  <span
                                    className={`w-5 shrink-0 select-none text-center font-mono text-[11px] font-bold ${
                                      isAdd
                                        ? "text-emerald-700 dark:text-emerald-400"
                                        : isDel
                                        ? "text-rose-700 dark:text-rose-400"
                                        : "text-muted-foreground/30"
                                    }`}
                                  >
                                    {isAdd ? "+" : isDel ? "-" : " "}
                                  </span>

                                  {/* Line Content */}
                                  <span className="flex-1 overflow-x-auto whitespace-pre pr-4 font-mono text-xs select-text">
                                    {line.content || " "}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
