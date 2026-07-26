import type { ReactNode } from "react";

export function extractTextFromChildren(children: ReactNode): string {
  if (typeof children === "string") return children;
  if (typeof children === "number") return String(children);
  if (!children) return "";
  if (Array.isArray(children)) return children.map(extractTextFromChildren).join("");
  if (typeof children === "object" && "props" in children) {
    return extractTextFromChildren((children as { props: { children?: ReactNode } }).props.children);
  }
  return "";
}

export function slugifyHeading(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function getHeadingNumber(counts: number[], level: number): string {
  const depth = Math.max(0, level - 2);

  for (let i = 0; i < depth; i += 1) {
    if (counts[i] === 0) counts[i] = 1;
  }

  counts[depth] = (counts[depth] || 0) + 1;

  for (let i = depth + 1; i < counts.length; i += 1) {
    counts[i] = 0;
  }

  return counts.slice(0, depth + 1).join(".");
}

export interface HeadingMeta {
  level: number;
  text: string;
  number: string;
  id: string;
}

export function parseHeadingMeta(markdown: string): HeadingMeta[] {
  const items: HeadingMeta[] = [];
  const lines = markdown.split("\n");
  let inCodeBlock = false;
  const counts = [0, 0, 0];

  for (const line of lines) {
    if (line.trimStart().startsWith("```")) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (inCodeBlock) continue;

    const match = line.match(/^(#{2,4})\s+(.+)/);
    if (!match?.[1] || !match[2]) continue;

    const level = match[1].length;
    const text = match[2]
      .replace(/\*\*(.+?)\*\*/g, "$1")
      .replace(/\*(.+?)\*/g, "$1")
      .replace(/`(.+?)`/g, "$1")
      .replace(/\[(.+?)\]\(.+?\)/g, "$1")
      .trim();
    const number = getHeadingNumber(counts, level);
    const slug = slugifyHeading(text);

    items.push({
      level,
      text,
      number,
      id: slug || number,
    });
  }

  return items;
}
