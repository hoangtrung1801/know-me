import type { LucideIcon } from "lucide-react";
import {
  Database,
  CheckSquare,
  FileText,
  Search,
  Cpu,
  Bookmark,
} from "lucide-react";
import {
  TASK_MANAGEMENT_URL,
  REFERENCE_SYSTEM_URL,
  COMMANDS_URL,
  WEB_UI_URL,
  MCP_GUIDE_URL,
  USER_GUIDE_URL,
} from "../config/landing";

export interface ProductSlide {
  id: string;
  label: string;
  description: string;
  image: string;
  width: number;
  height: number;
}

export const productSlides: readonly ProductSlide[] = [
  {
    id: "dashboard",
    label: "Workspace",
    description: "Your local projects, tasks, and knowledge in one unified overview.",
    image: "/screenshots/screenshot-dashboard.png",
    width: 2880,
    height: 1800,
  },
  {
    id: "kanban",
    label: "Kanban",
    description: "Visual columns and drag-and-drop workflow backed directly by markdown files.",
    image: "/screenshots/screenshot-kanban.png",
    width: 2880,
    height: 1800,
  },
  {
    id: "docs",
    label: "Documents",
    description: "Specifications, architectural notes, and references kept alongside code.",
    image: "/screenshots/screenshot-docs.png",
    width: 2880,
    height: 1800,
  },
  {
    id: "tasks",
    label: "Tasks",
    description: "Detailed acceptance criteria, dependencies, and state tracking.",
    image: "/screenshots/screenshot-tasks.png",
    width: 2880,
    height: 1800,
  },
  {
    id: "graph",
    label: "Graph",
    description: "Visual relationships between tasks, docs, and cross-project references.",
    image: "/screenshots/screenshot-graph.png",
    width: 2880,
    height: 1800,
  },
  {
    id: "chat",
    label: "Chat",
    description: "Interactive AI agent sessions grounded in your exact workspace files.",
    image: "/screenshots/screenshot-chat.png",
    width: 2880,
    height: 1800,
  },
] as const;

export interface FeatureItem {
  id: string;
  title: string;
  description: string;
  icon: LucideIcon;
  href?: string;
}

export const features: readonly FeatureItem[] = [
  {
    id: "local-ownership",
    title: "100% Local Ownership",
    description:
      "All tasks, documents, and project context live in plain Markdown and JSON files in your repository (.know-me/). Version them with Git; no cloud lock-in.",
    icon: Database,
    href: USER_GUIDE_URL,
  },
  {
    id: "acceptance-criteria",
    title: "Verifiable Task Criteria",
    description:
      "Tasks feature strict acceptance criteria. AI agents verify and check criteria programmatically before declaring work complete.",
    icon: CheckSquare,
    href: TASK_MANAGEMENT_URL,
  },
  {
    id: "connected-docs",
    title: "Specifications & References",
    description:
      "Keep technical design documents right beside your tasks. Cross-reference them seamlessly with @task/id and @doc/path identifiers.",
    icon: FileText,
    href: REFERENCE_SYSTEM_URL,
  },
  {
    id: "search-retrieval",
    title: "Hybrid Search & Retrieval",
    description:
      "Quick keyword lookups and ranked context packs deliver exact context to agents without bloat or hallucination.",
    icon: Search,
    href: COMMANDS_URL,
  },
  {
    id: "unified-surfaces",
    title: "Web UI, CLI & MCP Core",
    description:
      "Access your workspace through a responsive browser interface, fast terminal CLI, or standard Model Context Protocol stdio server.",
    icon: Cpu,
    href: MCP_GUIDE_URL,
  },
  {
    id: "global-memos",
    title: "Cross-Project Memos & Links",
    description:
      "Capture fleeting ideas, links, and quick notes globally (~/.know-me/) that persist across projects and worktrees.",
    icon: Bookmark,
    href: WEB_UI_URL,
  },
] as const;

export interface FAQItem {
  id: string;
  question: string;
  answer: string;
}

export const faqs: readonly FAQItem[] = [
  {
    id: "what-stores",
    question: "What does KnowMe store in my project?",
    answer:
      "KnowMe stores tasks, specifications, and project metadata in human-readable Markdown and JSON inside `<repo>/.know-me/`. Everything is version-controlled with Git alongside your source code.",
  },
  {
    id: "storage-scope",
    question: "What is the difference between project and global storage?",
    answer:
      "Project-specific tasks and documents live inside `<repo>/.know-me/`. Global developer memos, bookmarks, and cross-project references live in `~/.know-me/` so they are accessible from any directory or terminal.",
  },
  {
    id: "mcp-connect",
    question: "How do AI agents connect to KnowMe?",
    answer:
      "KnowMe provides a standard Model Context Protocol (MCP) server over stdio via `knowme mcp --stdio`. Tools like Claude Desktop, Cursor, Codex, and OpenCode invoke tools to search, inspect docs, and edit tasks deterministically.",
  },
  {
    id: "retrieval-modes",
    question: "How does the retrieve command prevent context-window bloat?",
    answer:
      "Instead of dumping entire repositories, `knowme retrieve` creates concise, ranked context packs citing exact tasks and document excerpts, keeping prompts compact and verifiable.",
  },
  {
    id: "platforms",
    question: "What platforms and operating systems are supported?",
    answer:
      "KnowMe is distributed as a single standalone binary for macOS, Linux, and Windows, as well as an npm global package via `npm install -g @hoangtrung1801/knowme`.",
  },
  {
    id: "license",
    question: "Is KnowMe open source?",
    answer:
      "Yes, KnowMe is released under the permissive MIT license. You can inspect the Go core, web workspace, and documentation on GitHub.",
  },
] as const;
