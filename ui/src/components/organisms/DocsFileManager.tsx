import { useMemo, useState, useEffect } from "react";
import {
	FileText,
	FolderOpen,
	ChevronRight,
	ChevronLeft,
	ClipboardCheck,
	Filter,
	Plus,
	Package,
	Tag,
	Search,
	X,
	GitBranch,
	Package2,
	FolderGit2,
} from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { navigateTo } from "../../lib/navigation";
import { cn, toDisplayPath, isSpec, parseACProgress, type Doc } from "../../lib/utils";
import { importApi, type Import } from "../../api/client";

interface FolderEntry {
	type: "folder";
	name: string;
	fullPath: string;
	docCount: number;
	specProgress?: { completed: number; total: number };
}

interface FileEntry {
	type: "file";
	doc: Doc;
}

type Entry = FolderEntry | FileEntry;

/**
 * Extract import source from doc
 * Tries doc.source first, then falls back to path prefix for imported docs
 */
function getImportSource(doc: Doc): string {
	if (doc.source) return doc.source;
	
	// For imported docs without explicit source, extract from path prefix
	// Format: {import-name}/{actual-path}
	if (doc.isImported && doc.path.includes("/")) {
		const prefix = doc.path.split("/")[0];
		return prefix || "unknown";
	}
	
	return "unknown";
}

/**
 * Detect import source type from source string
 */
function detectSourceType(source: string): "git" | "npm" | "local" | "unknown" {
	if (!source) return "unknown";
	
	// Git: github.com, gitlab.com, bitbucket.org, or .git URLs
	if (source.includes("github.com") || source.includes("gitlab.com") || 
	    source.includes("bitbucket.org") || source.endsWith(".git")) {
		return "git";
	}
	
	// NPM: starts with @ (scoped) or looks like package name
	if (source.startsWith("@") || /^[a-z0-9-]+$/.test(source)) {
		return "npm";
	}
	
	// Local: starts with ./ or ../ or is absolute path
	if (source.startsWith("./") || source.startsWith("../") || source.startsWith("/")) {
		return "local";
	}
	
	return "unknown";
}

/**
 * Get icon and color for import source type
 */
function getSourceTypeIcon(type: "git" | "npm" | "local" | "unknown") {
	switch (type) {
		case "git":
			return { Icon: GitBranch, color: "text-orange-500", bgColor: "bg-orange-100 dark:bg-orange-950/40" };
		case "npm":
			return { Icon: Package2, color: "text-red-500", bgColor: "bg-red-100 dark:bg-red-950/40" };
		case "local":
			return { Icon: FolderGit2, color: "text-blue-500", bgColor: "bg-blue-100 dark:bg-blue-950/40" };
		default:
			return { Icon: Package, color: "text-gray-500", bgColor: "bg-gray-100 dark:bg-gray-950/40" };
	}
}

interface DocsFileManagerProps {
	onCreateDoc: () => void;
	docs: Doc[];
	currentFolder: string | null;
	navigateToFolder: (folder: string | null) => void;
	setSelectedDoc: (doc: Doc | null) => void;
	showSpecsOnly: boolean;
	setShowSpecsOnly: (show: boolean) => void;
	searchQuery: string;
	onSearchQueryChange: (value: string) => void;
	selectedDocPath?: string | null;
	onItemSelect?: () => void;
	className?: string;
}

export function DocsFileManager({
	onCreateDoc,
	docs,
	currentFolder,
	navigateToFolder,
	setSelectedDoc,
	showSpecsOnly,
	setShowSpecsOnly,
	searchQuery,
	onSearchQueryChange,
	selectedDocPath,
	onItemSelect,
	className,
}: DocsFileManagerProps) {
	const normalizedQuery = searchQuery.trim().toLowerCase();
	const isSearching = normalizedQuery.length > 0;

	const matchesSearch = (doc: Doc) => {
		if (!isSearching) return true;
		const haystack = [
			doc.metadata.title,
			doc.path,
			doc.folder,
			doc.metadata.description || "",
			...(doc.metadata.tags || []),
		]
			.join(" ")
			.toLowerCase();
		return haystack.includes(normalizedQuery);
	};

	// Derive entries for current folder
	const entries = useMemo(() => {
		if (isSearching) {
			const filteredDocs = docs
				.filter((d) => !d.isImported)
				.filter((d) => (showSpecsOnly ? isSpec(d) : true))
				.filter(matchesSearch)
				.sort((a, b) => {
					const orderA = a.metadata.order;
					const orderB = b.metadata.order;
					if (orderA !== undefined && orderB !== undefined) return orderA - orderB;
					if (orderA !== undefined) return -1;
					if (orderB !== undefined) return 1;
					return a.path.localeCompare(b.path);
				});

			return filteredDocs.map((doc) => ({ type: "file", doc }) as Entry);
		}

		const result: Entry[] = [];
		const subfolders = new Map<string, Doc[]>();
		const files: Doc[] = [];

		const localDocs = docs.filter((d) => !d.isImported);
		const filtered = showSpecsOnly ? localDocs.filter((d) => isSpec(d)) : localDocs;

		for (const doc of filtered) {
			const docFolder = doc.folder || "";

			if (currentFolder === null) {
				// Root view
				if (!docFolder) {
					// Root-level file
					files.push(doc);
				} else {
					// Get top-level folder
					const topFolder = docFolder.split("/")[0]!;
					if (!subfolders.has(topFolder)) {
						subfolders.set(topFolder, []);
					}
					subfolders.get(topFolder)!.push(doc);
				}
			} else {
				// Inside a folder
				if (docFolder === currentFolder) {
					// Direct child file
					files.push(doc);
				} else if (docFolder.startsWith(currentFolder + "/")) {
					// Nested - get next subfolder segment
					const remainder = docFolder.slice(currentFolder.length + 1);
					const nextSegment = remainder.split("/")[0]!;
					const subPath = `${currentFolder}/${nextSegment}`;
					if (!subfolders.has(subPath)) {
						subfolders.set(subPath, []);
					}
					subfolders.get(subPath)!.push(doc);
				}
			}
		}

		// Build folder entries
		for (const [folderPath, folderDocs] of subfolders) {
			const folderName = folderPath.split("/").pop()!;
			const specDocs = folderDocs.filter((d) => isSpec(d));
			let specProgress: { completed: number; total: number } | undefined;
			if (specDocs.length > 0) {
				let totalAcs = 0;
				let completedAcs = 0;
				for (const spec of specDocs) {
					const progress = parseACProgress(spec.content);
					totalAcs += progress.total;
					completedAcs += progress.completed;
				}
				if (totalAcs > 0) {
					specProgress = { completed: completedAcs, total: totalAcs };
				}
			}

			result.push({
				type: "folder",
				name: folderName,
				fullPath: folderPath,
				docCount: folderDocs.length,
				specProgress,
			});
		}

		// Sort folders alphabetically
		result.sort((a, b) => {
			if (a.type === "folder" && b.type === "folder") {
				return a.name.localeCompare(b.name);
			}
			return 0;
		});

		// Add file entries after folders
		const sortedFiles = [...files].sort((a, b) => {
			const orderA = a.metadata.order;
			const orderB = b.metadata.order;
			if (orderA !== undefined && orderB !== undefined) return orderA - orderB;
			if (orderA !== undefined) return -1;
			if (orderB !== undefined) return 1;
			return a.metadata.title.localeCompare(b.metadata.title);
		});

		for (const doc of sortedFiles) {
			result.push({ type: "file", doc });
		}

		return result;
	}, [currentFolder, docs, isSearching, normalizedQuery, showSpecsOnly]);

	// Track current import source being viewed (like a folder)
	const [viewingImportSource, setViewingImportSource] = useState<string | null>(null);
	
	// Cache imports metadata (source URL, type, etc.)
	const [importsMap, setImportsMap] = useState<Map<string, Import>>(new Map());
	
	// Fetch imports metadata on mount
	useEffect(() => {
		importApi.list().then(({ imports }) => {
			const map = new Map<string, Import>();
			imports.forEach((imp) => map.set(imp.name, imp));
			setImportsMap(map);
		}).catch((err) => {
			console.error("Failed to fetch imports:", err);
		});
	}, []);

	// Auto-sync viewingImportSource when viewing an imported doc
	useEffect(() => {
		// Only auto-sync when viewing an imported doc (don't clear when null)
		if (selectedDocPath) {
			const doc = docs.find((d) => d.path === selectedDocPath);
			if (doc?.isImported) {
				const targetSource = getImportSource(doc);
				if (targetSource !== "unknown" && targetSource !== viewingImportSource) {
					setViewingImportSource(targetSource);
				}
			}
		}
	}, [selectedDocPath, docs, viewingImportSource]);

	// Imported docs grouped by source
	const importGroups = useMemo(() => {
		// Only show in root view, when searching, or when viewing an import source
		if (!isSearching && currentFolder !== null && !viewingImportSource) return [];
		
		const imported = docs
			.filter((d) => d.isImported)
			.filter((d) => (showSpecsOnly ? isSpec(d) : true))
			.filter(matchesSearch);
		if (imported.length === 0) return [];
		
		const groups: { source: string; docs: Doc[] }[] = [];
		const map = new Map<string, Doc[]>();
		for (const doc of imported) {
			const source = getImportSource(doc);
			if (!map.has(source)) map.set(source, []);
			map.get(source)!.push(doc);
		}
		for (const [source, sourceDocs] of map) {
			groups.push({
				source,
				docs: sourceDocs.sort((a, b) => a.metadata.title.localeCompare(b.metadata.title)),
			});
		}
		return groups.sort((a, b) => a.source.localeCompare(b.source));
	}, [currentFolder, docs, isSearching, normalizedQuery, showSpecsOnly, viewingImportSource]);

	// If viewing an import source, show only its docs
	const importSourceDocs = useMemo(() => {
		if (!viewingImportSource) return null;
		const group = importGroups.find((g) => g.source === viewingImportSource);
		return group ? group.docs : null;
	}, [viewingImportSource, importGroups]);

	// Navigate back to root (clear both folder and import source view)
	const navigateToRoot = () => {
		navigateToFolder(null);
		setViewingImportSource(null);
	};

	// Navigate to import source (like entering a folder)
	const navigateToImportSource = (source: string) => {
		navigateToFolder(null); // Clear folder navigation
		setViewingImportSource(source);
	};

	const handleDocClick = (doc: Doc) => {
		setSelectedDoc(doc);
		navigateTo(`/docs/${toDisplayPath(doc.path)}`);
		// Keep import source view active when clicking docs from import source
		// This allows easy navigation between imported docs
		onItemSelect?.();
	};

	return (
		<div className={cn("h-full flex flex-col", className)}>
			{/* Back button when inside a folder or import source */}
			{(currentFolder !== null || viewingImportSource !== null) && !isSearching && (
				<button
					type="button"
					onClick={currentFolder !== null ? () => {
						// Navigate to parent folder or root
						const parts = currentFolder.split("/");
						if (parts.length > 1) {
							navigateToFolder(parts.slice(0, -1).join("/"));
						} else {
							navigateToFolder(null);
							if (viewingImportSource) setViewingImportSource(null);
						}
					} : navigateToRoot}
					className="flex items-center gap-1.5 mb-2 px-1 py-1 text-xs text-muted-foreground hover:text-foreground transition-colors rounded-lg hover:bg-accent/40 w-fit"
				>
					<ChevronLeft className="w-3.5 h-3.5" />
					<span>
						{currentFolder
							? currentFolder.includes("/")
								? currentFolder.split("/").slice(-2, -1)[0]
								: viewingImportSource || "docs"
							: "docs"}
					</span>
				</button>
			)}

			<div className="mb-3">
				<div className="relative">
					<Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/70" />
					<Input
						value={searchQuery}
						onChange={(e) => onSearchQueryChange(e.target.value)}
						placeholder="Search docs, paths, tags..."
						className="pl-9 pr-9 h-9 rounded-xl border-border/50 bg-background/70 shadow-none focus-visible:ring-1"
					/>
					{searchQuery && (
						<button
							type="button"
							onClick={() => onSearchQueryChange("")}
							className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground transition-colors"
							aria-label="Clear search"
						>
							<X className="w-3.5 h-3.5" />
						</button>
					)}
				</div>
			</div>

			{/* Toolbar */}
			<div className="flex items-center gap-2 mb-4">
				<Button
					variant={showSpecsOnly ? "default" : "outline"}
					size="sm"
					onClick={() => setShowSpecsOnly(!showSpecsOnly)}
					title={showSpecsOnly ? "Show all documents" : "Show specs only"}
					className={cn(
						"h-8 rounded-full px-3 text-xs shadow-none",
						!showSpecsOnly && "border-border/50 bg-background/70",
					)}
				>
					<Filter className="w-3.5 h-3.5 mr-1.5" />
					Specs
				</Button>
				<div className="flex-1" />
				<Button
					size="sm"
					onClick={onCreateDoc}
					disabled={viewingImportSource !== null}
					title={viewingImportSource ? "Cannot create docs in imported sources" : "Create new document"}
					className="h-8 rounded-full px-3 text-xs shadow-none"
				>
					<Plus className="w-3.5 h-3.5 mr-1.5" />
					New Doc
				</Button>
			</div>

			{/* Entries list */}
			<div className="overflow-y-auto min-h-0 pr-1">
			<div key={`${currentFolder ?? "root"}__${viewingImportSource ?? ""}`} className="space-y-0.5 animate-list-in">
				{/* If viewing an import source, show only its docs */}
				{viewingImportSource && importSourceDocs ? (
					<>
						{importSourceDocs.length === 0 && (
							<div className="py-16 text-center">
								<Package className="w-10 h-10 mx-auto mb-3 text-muted-foreground/30" />
								<p className="text-muted-foreground text-sm">
									No documents in this import source.
								</p>
							</div>
						)}
						{importSourceDocs.map((doc) => {
							const docIsSpec = isSpec(doc);
							const isSelected = selectedDocPath === doc.path;
							return (
								<button
									type="button"
									key={doc.path}
									onClick={() => handleDocClick(doc)}
									className={cn(
										"flex items-start gap-3 py-2 px-2 w-full text-left transition-colors group rounded-xl",
										isSelected ? "bg-accent/70 text-foreground shadow-[inset_0_0_0_1px_rgba(0,0,0,0.04)]" : "hover:bg-accent/45",
									)}
								>
									{docIsSpec ? (
										<ClipboardCheck className="w-4 h-4 text-sky-600 shrink-0 mt-0.5" />
									) : (
										<FileText className="w-4 h-4 text-muted-foreground/60 group-hover:text-foreground transition-colors shrink-0 mt-0.5" />
									)}
									<div className="flex-1 min-w-0">
										<div className="flex items-center gap-2 flex-wrap">
											<span className="font-medium text-[13px] leading-5">
												{doc.metadata.title}
											</span>
											{docIsSpec && (
												<span className="px-1.5 py-0.5 text-[10px] font-medium bg-sky-100/90 text-sky-800 dark:bg-sky-950/60 dark:text-sky-200 rounded-full">
													SPEC
												</span>
											)}
											<span className="px-1.5 py-0.5 text-[9px] font-medium bg-purple-100/80 text-purple-700 dark:bg-purple-950/50 dark:text-purple-300 rounded-full shrink-0">
												imported
											</span>
										</div>
										<div className="flex items-center gap-2 mt-0.5">
											{doc.metadata.description && (
												<p className="text-[11px] leading-4 text-muted-foreground truncate">
													{doc.metadata.description}
												</p>
											)}
										</div>
										<div className="mt-1 flex flex-wrap items-center gap-1.5">
											{doc.metadata.tags && doc.metadata.tags.length > 0 && (
												<>
													{doc.metadata.tags.slice(0, 2).map((tag: string) => (
														<span
															key={tag}
															className="flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] bg-background/80 rounded-full text-muted-foreground border border-border/40"
														>
															<Tag className="w-2.5 h-2.5" />
															{tag}
														</span>
													))}
												</>
											)}
											<span className="text-[10px] text-muted-foreground/70">
												{new Date(doc.metadata.updatedAt).toLocaleDateString()}
											</span>
										</div>
										<p className="mt-1 text-[10px] text-muted-foreground/70 truncate font-mono">
											{toDisplayPath(doc.path).replace(/\.md$/, "")}
										</p>
									</div>
								</button>
							);
						})}
					</>
				) : (
					<>
						{/* Regular local docs */}
						{entries.length === 0 && importGroups.length === 0 && (
							<div className="py-16 text-center">
								<FileText className="w-10 h-10 mx-auto mb-3 text-muted-foreground/30" />
								<p className="text-muted-foreground text-sm">
									{isSearching
										? "No documents match your search."
										: showSpecsOnly
											? "No spec documents in this folder."
											: "No documents yet."}
								</p>
								<p className="text-muted-foreground/60 text-xs mt-1">
									{isSearching
										? "Try a different keyword or clear the filter."
										: "Create your first document to get started."}
								</p>
							</div>
						)}

						{entries.map((entry) => {
					if (entry.type === "folder") {
						return (
							<button
								type="button"
								key={`folder-${entry.fullPath}`}
								onClick={() => navigateToFolder(entry.fullPath)}
							className="flex items-center gap-3 py-2 px-2 w-full text-left hover:bg-accent/50 transition-colors group rounded-xl"
						>
							<FolderOpen className="w-4 h-4 text-muted-foreground/60 group-hover:text-foreground transition-colors shrink-0" />
							<div className="flex-1 min-w-0">
								<div className="flex items-center gap-2">
									<span className="font-medium text-[13px]">
										{entry.name}
									</span>
									<span className="text-[11px] text-muted-foreground">
										{entry.docCount} doc{entry.docCount !== 1 ? "s" : ""}
									</span>
									{entry.specProgress && (
										<span className="text-[11px] text-muted-foreground">
											· {entry.specProgress.completed}/{entry.specProgress.total} ACs
										</span>
									)}
								</div>
							</div>
							<ChevronRight className="w-3.5 h-3.5 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors shrink-0" />
						</button>
						);
					}

					const doc = entry.doc;
					const docIsSpec = isSpec(doc);
					const isSelected = selectedDocPath === doc.path;
					return (
						<button
							type="button"
							key={doc.path}
							onClick={() => handleDocClick(doc)}
							className={cn(
								"flex items-start gap-3 py-2 px-2 w-full text-left transition-all duration-150 group rounded-xl",
								isSelected ? "bg-accent/70 text-foreground shadow-[inset_0_0_0_1px_rgba(0,0,0,0.04)]" : "hover:bg-accent/45 active:scale-[0.98] active:bg-accent/60",
							)}
						>
							{docIsSpec ? (
								<ClipboardCheck className="w-4 h-4 text-sky-600 shrink-0 mt-0.5" />
							) : (
								<FileText className="w-4 h-4 text-muted-foreground/60 group-hover:text-foreground transition-colors shrink-0 mt-0.5" />
							)}
							<div className="flex-1 min-w-0">
								<div className="flex items-center gap-2 flex-wrap">
									<span className="font-medium text-[13px] leading-5">
										{doc.metadata.title}
									</span>
									{docIsSpec && (
										<span className="px-1.5 py-0.5 text-[10px] font-medium bg-sky-100/90 text-sky-800 dark:bg-sky-950/60 dark:text-sky-200 rounded-full">
											SPEC
										</span>
									)}
									{doc.isImported && (
										<span className="px-1.5 py-0.5 text-[10px] font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 rounded-full">
											Imported
										</span>
									)}
								</div>
								<div className="flex items-center gap-2 mt-0.5">
									{doc.metadata.description && (
										<p className="text-[11px] leading-4 text-muted-foreground truncate">
											{doc.metadata.description}
										</p>
									)}
								</div>
								<div className="mt-1 flex flex-wrap items-center gap-1.5">
									{doc.metadata.tags && doc.metadata.tags.length > 0 && (
										<>
											{doc.metadata.tags.slice(0, 2).map((tag: string) => (
												<span
													key={tag}
													className="flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] bg-background/80 rounded-full text-muted-foreground border border-border/40"
												>
													<Tag className="w-2.5 h-2.5" />
													{tag}
												</span>
											))}
										</>
									)}
									<span className="text-[10px] text-muted-foreground/70">
										{new Date(doc.metadata.updatedAt).toLocaleDateString()}
									</span>
								</div>
								<p className="mt-1 text-[10px] text-muted-foreground/70 truncate font-mono">
									{toDisplayPath(doc.path).replace(/\.md$/, "")}
								</p>
							</div>
						</button>
							);
						})}

						{/* Import Sources Section - Separate with divider */}
						{importGroups.length > 0 && entries.length > 0 && (
							<div className="my-4 px-1">
								<div className="border-t border-border/40" />
							</div>
						)}

						{importGroups.length > 0 && (
							<div className="mb-2">
								<div className="px-2 py-1.5 mb-2 flex items-center gap-2">
									<Package className="w-3.5 h-3.5 text-muted-foreground/60" />
									<span className="text-[11px] font-semibold text-muted-foreground/70 uppercase tracking-wider">
										Imported Sources
									</span>
								</div>
								{importGroups.map(({ source, docs: sourceDocs }) => {
									// Use real import metadata from API
									const importMeta = importsMap.get(source);
									const sourceType = importMeta?.type || detectSourceType(source);
									const fullSource = importMeta?.source || source;
									const { Icon: TypeIcon, color: typeColor, bgColor: typeBgColor } = getSourceTypeIcon(sourceType);
									
									return (
										<button
											key={`import-${source}`}
											type="button"
											onClick={() => navigateToImportSource(source)}
											className="flex items-center gap-2.5 py-2 px-2 w-full text-left hover:bg-accent/50 transition-colors group rounded-xl mb-1"
										>
											<div className={cn("p-1.5 rounded-lg shrink-0", typeBgColor)}>
												<TypeIcon className={cn("w-3.5 h-3.5", typeColor)} />
											</div>
											<div className="flex-1 min-w-0">
												<div className="flex items-center gap-2 flex-wrap">
													<span className="font-medium text-[13px] truncate" title={fullSource}>
														{source}
													</span>
													<span className={cn(
														"px-1.5 py-0.5 text-[9px] font-semibold uppercase rounded-full shrink-0",
														typeBgColor,
														typeColor
													)}>
														{sourceType}
													</span>
													<span className="text-[11px] text-muted-foreground shrink-0">
														{sourceDocs.length} doc{sourceDocs.length !== 1 ? "s" : ""}
													</span>
												</div>
											</div>
											<ChevronRight className="w-3.5 h-3.5 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors shrink-0" />
										</button>
									);
								})}
							</div>
						)}
					</>
				)}
			</div>
			</div>
		</div>
	);
}
