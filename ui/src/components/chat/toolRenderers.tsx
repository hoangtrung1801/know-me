import { memo } from "react";

import type { ChatMessage } from "../../models/chat";
import { DiffViewer } from "../ui/DiffViewer";

type ToolCallItem = NonNullable<ChatMessage["toolCalls"]>[number];

export interface ToolRenderContext {
	toolName: string;
	toolArgs?: Record<string, unknown>;
	result?: string;
	metadata?: Record<string, unknown>;
	command?: string;
	status?: ToolCallItem["status"];
}

function stringifyInline(value: unknown): string | undefined {
	if (typeof value === "string") return value;
	if (typeof value === "number" || typeof value === "boolean") return String(value);
	return undefined;
}

function readMetadataLines(metadata: Record<string, unknown> | undefined): string[] | undefined {
	const lineRanges = Array.isArray(metadata?.lineRanges) ? metadata.lineRanges : [];
	if (lineRanges.length > 0) {
		return lineRanges
			.map((range) => {
				if (!range || typeof range !== "object") return "";
				const record = range as Record<string, unknown>;
				const start = stringifyInline(record.start);
				const end = stringifyInline(record.end);
				const text = stringifyInline(record.text);
				if (!text) return "";
				const label = start && end ? `${start}-${end}` : start || end || "";
				return `${label}${label ? ": " : ""}${text}`;
			})
			.filter(Boolean);
	}

	const lines = Array.isArray(metadata?.lines) ? metadata.lines : [];
	if (lines.length === 0) return undefined;
	return lines
		.map((line) => {
			if (typeof line === "string") return line;
			if (!line || typeof line !== "object") return "";
			const record = line as Record<string, unknown>;
			const number = stringifyInline(record.number) || stringifyInline(record.line);
			const text = stringifyInline(record.text) || stringifyInline(record.content);
			if (!text) return "";
			return `${number ? `${number}: ` : ""}${text}`;
		})
		.filter(Boolean);
}

function splitOutputLines(result?: string): string[] {
	return (result || "")
		.split(/\r?\n/)
		.map((line) => line.trimEnd())
		.filter((line) => line.length > 0);
}

const ToolFrame = memo(function ToolFrame({
	title,
	children,
}: {
	title?: string;
	children: React.ReactNode;
}) {
	return (
		<div className="rounded-md bg-muted/25 px-2.5 py-2">
			{title && <div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{title}</div>}
			{children}
		</div>
	);
	});

const ReadRenderer = memo(function ReadRenderer({ toolArgs, result, metadata }: ToolRenderContext) {
	const filePath = stringifyInline(toolArgs?.filePath) || stringifyInline(toolArgs?.file_path) || stringifyInline(toolArgs?.path);
	const lines = readMetadataLines(metadata);
	const fallbackLines = splitOutputLines(result);
	const displayLines = lines && lines.length > 0 ? lines : fallbackLines;

	return (
		<div className="space-y-2">
			{filePath && <div className="truncate px-1 font-mono text-[10px] text-muted-foreground">{filePath}</div>}
			<ToolFrame title="Preview">
				<pre className="max-h-80 overflow-y-auto whitespace-pre-wrap break-all font-mono text-xs text-foreground/90">
					{displayLines.length > 0 ? displayLines.join("\n") : result || "(no output)"}
				</pre>
			</ToolFrame>
		</div>
	);
	});

const GrepRenderer = memo(function GrepRenderer({ toolArgs, result }: ToolRenderContext) {
	const query = stringifyInline(toolArgs?.pattern) || stringifyInline(toolArgs?.query);
	const include = stringifyInline(toolArgs?.include);
	const lines = splitOutputLines(result);

	return (
		<div className="space-y-2">
			{(query || include) && (
				<div className="flex flex-wrap gap-2 px-1 text-[10px] text-muted-foreground">
					{query && <span className="rounded bg-background/60 px-1.5 py-0.5 font-mono">query={query}</span>}
					{include && <span className="rounded bg-background/60 px-1.5 py-0.5 font-mono">include={include}</span>}
				</div>
			)}
			<ToolFrame title="Matches">
				<pre className="max-h-80 overflow-y-auto whitespace-pre-wrap break-all font-mono text-xs text-foreground/90">
					{lines.length > 0 ? lines.join("\n") : result || "(no matches)"}
				</pre>
			</ToolFrame>
		</div>
	);
	});

const GlobRenderer = memo(function GlobRenderer({ toolArgs, result }: ToolRenderContext) {
	const pattern = stringifyInline(toolArgs?.pattern);
	const path = stringifyInline(toolArgs?.path);
	const items = splitOutputLines(result);

	return (
		<div className="space-y-2">
			{(pattern || path) && (
				<div className="flex flex-wrap gap-2 px-1 text-[10px] text-muted-foreground">
					{pattern && <span className="rounded bg-background/60 px-1.5 py-0.5 font-mono">pattern={pattern}</span>}
					{path && <span className="rounded bg-background/60 px-1.5 py-0.5 font-mono">path={path}</span>}
				</div>
			)}
			<ToolFrame title="Files">
				<div className="max-h-80 overflow-y-auto font-mono text-xs text-foreground/90">
					{items.length > 0 ? items.map((item) => <div key={item}>{item}</div>) : <div>(no files)</div>}
				</div>
			</ToolFrame>
		</div>
	);
	});

const BashRenderer = memo(function BashRenderer({ command, toolArgs, result, status }: ToolRenderContext) {
	const displayCommand = command || stringifyInline(toolArgs?.command) || stringifyInline(toolArgs?.cmd) || "bash";
	const workdir = stringifyInline(toolArgs?.workdir);
	return (
		<div className="space-y-2">
			<ToolFrame title="Command">
				<pre className="whitespace-pre-wrap break-all font-mono text-xs text-foreground/90">{displayCommand}</pre>
			</ToolFrame>
			{workdir && <div className="truncate px-1 font-mono text-[10px] text-muted-foreground">{workdir}</div>}
			<ToolFrame title={status === "loading" ? "Running" : "Output"}>
				<pre className="max-h-80 overflow-y-auto whitespace-pre-wrap break-all font-mono text-xs text-foreground/90">
					{result || (status === "loading" ? "(waiting for output)" : "(no output)")}
				</pre>
			</ToolFrame>
		</div>
	);
	});

const PatchRenderer = memo(function PatchRenderer({ toolArgs, metadata }: ToolRenderContext) {
	const files = Array.isArray(metadata?.files) ? (metadata.files as Record<string, unknown>[]) : [];
	const filediff = metadata?.filediff as Record<string, unknown> | undefined;
	const oldText =
		typeof filediff?.before === "string"
			? filediff.before
			: typeof toolArgs?.oldString === "string"
				? toolArgs.oldString
				: typeof toolArgs?.old_string === "string"
					? toolArgs.old_string
					: undefined;
	const newText =
		typeof filediff?.after === "string"
			? filediff.after
			: typeof toolArgs?.newString === "string"
				? toolArgs.newString
				: typeof toolArgs?.new_string === "string"
					? toolArgs.new_string
					: typeof toolArgs?.content === "string"
						? toolArgs.content
						: undefined;

	const diffFiles = files.length > 0
		? files
			.map((file) => ({
				path: typeof file.relativePath === "string" ? file.relativePath : typeof file.filePath === "string" ? file.filePath : undefined,
				oldValue: typeof file.before === "string" ? file.before : undefined,
				newValue: typeof file.after === "string" ? file.after : undefined,
			}))
			.filter((file) => file.oldValue || file.newValue)
		: [{ path: stringifyInline(toolArgs?.filePath) || stringifyInline(toolArgs?.path), oldValue: oldText, newValue: newText }].filter(
			(file) => file.oldValue || file.newValue,
		);

	return (
		<div className="space-y-2">
			{diffFiles.map((file, index) => (
				<div key={`${file.path || "patch"}-${index}`} className="space-y-1">
					{file.path && <div className="truncate px-1 font-mono text-[10px] text-muted-foreground">{file.path}</div>}
					<div className="max-h-80 overflow-y-auto rounded-md">
						<DiffViewer oldValue={file.oldValue} newValue={file.newValue} />
					</div>
				</div>
			))}
		</div>
	);
	});

const renderers: Array<{
	match: RegExp;
	render: (context: ToolRenderContext) => React.ReactNode;
}> = [
	{ match: /^(read|read_file)$/i, render: (context) => <ReadRenderer {...context} /> },
	{ match: /^(grep|search)$/i, render: (context) => <GrepRenderer {...context} /> },
	{ match: /^(glob|list_directory)$/i, render: (context) => <GlobRenderer {...context} /> },
	{ match: /^(bash|shell|exec_command|functions\.exec_command)$/i, render: (context) => <BashRenderer {...context} /> },
	{ match: /^(write|patch|apply_patch|edit|replace)$/i, render: (context) => <PatchRenderer {...context} /> },
];

export function renderToolDetails(context: ToolRenderContext): React.ReactNode | null {
	const entry = renderers.find((renderer) => renderer.match.test(context.toolName));
	return entry ? entry.render(context) : null;
}
