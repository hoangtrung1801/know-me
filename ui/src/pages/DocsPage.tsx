import { useCallback, useEffect, useRef, useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import {
	Check,
	X,
	Copy,
	ArrowLeft,
	Maximize2,
	Minimize2,
	Menu,
	History,
} from "lucide-react";
import { MDEditor } from "../components/editor";
import { Button } from "../components/ui/button";
import { updateDoc } from "../api/client";
import { useGlobalTask } from "../contexts/GlobalTaskContext";
import { useDocsOptional } from "../contexts/DocsContext";
import { DocsFileManager } from "../components/organisms/DocsFileManager";
import { toDisplayPath, normalizePathForAPI, type Doc } from "../lib/utils";
import { navigateTo } from "../lib/navigation";
import { DocsTOC } from "../components/molecules/DocsTOC";
import { TaskPreviewDialog } from "../components/organisms/TaskDetail/TaskPreviewDialog";
import { Sheet, SheetContent, SheetTitle } from "../components/ui/sheet";

import { DocsDocHeader } from "./docs/DocsDocHeader";
import { DocsCreateView } from "./docs/DocsCreateView";
import { DocsEmptyState } from "./docs/DocsEmptyState";
import { DocMiniGraph } from "./docs/DocMiniGraph";
import { DocHistorySheet } from "./docs/DocHistorySheet";
import { MDRenderWithHighlight } from "../components/editor/MDRenderWithHighlight";

import { AnnotationProvider, useAnnotationContext } from "../contexts/AnnotationContext";
import { AnnotationSelectionToolbar } from "../components/annotations/AnnotationSelectionToolbar";
import { AnnotationHighlighter } from "../components/annotations/AnnotationHighlighter";
import { AnnotationBubble } from "../components/annotations/AnnotationBubble";
import { usePersistentPageState } from "../contexts/PageWorkspaceContext";

const DOC_AUTOSAVE_INTERVAL_MS = 5 * 60 * 1000;

export default function DocsPage() {
	return (
		<AnnotationProvider>
			<DocsPageInner />
		</AnnotationProvider>
	);
}

function DocsPageInner() {
	const location = useRouterState({ select: (state) => state.location });
	const { openTask } = useGlobalTask();
	const docsContext = useDocsOptional();

	if (!docsContext) {
		return (
			<div className="p-6 flex items-center justify-center h-64">
				<div className="text-lg text-muted-foreground">Loading documentation...</div>
			</div>
		);
	}

	const {
		docs, loading, error, selectedDoc, setSelectedDoc,
		isEditing, editedContent, setEditedContent,
		linkedTasks, showSpecsOnly, setShowSpecsOnly,
		linkedTasksExpanded, setLinkedTasksExpanded,
		loadDocs, currentFolder, navigateToFolder,
	} = docsContext;

	const [saving, setSaving] = useState(false);
	const [showCreateView, setShowCreateView] = usePersistentPageState("docs", "showCreateView", false);
	const [pathCopied, setPathCopied] = useState(false);
	const [previewTaskId, setPreviewTaskId] = useState<string | null>(null);
	const [mobileSidebarOpen, setMobileSidebarOpen] = usePersistentPageState("docs", "mobileSidebarOpen", false);
	const [docSearchQuery, setDocSearchQuery] = usePersistentPageState("docs", "docSearchQuery", "");
	const [lineHighlight, setLineHighlight] = useState<{ start: number; end: number } | null>(null);
	const [legacyWideMode] = useState(() => {
		try {
			return typeof window !== "undefined" && window.localStorage.getItem("docs-wide-mode") === "true";
		} catch {
			return false;
		}
	});
	const [wideMode, setWideMode] = usePersistentPageState("docs", "wideMode", legacyWideMode);
	const [historyOpen, setHistoryOpen] = usePersistentPageState("docs", "historyOpen", false);
	const [metaTitle, setMetaTitle] = useState("");
	const [metaDescription, setMetaDescription] = useState("");
	const [metaTags, setMetaTags] = useState("");
	const [saveError, setSaveError] = useState<string | null>(null);
	const [metadataDrafts, setMetadataDrafts] = usePersistentPageState<Record<string, {
		title: string;
		description: string;
		tags: string;
	}>>("docs", "metadataDrafts", {}, {
		encode: (value) => value,
		decode: (value) => {
			if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
			const result: Record<string, { title: string; description: string; tags: string }> = {};
			for (const [path, draft] of Object.entries(value)) {
				if (!draft || typeof draft !== "object" || Array.isArray(draft)) continue;
				const candidate = draft as Record<string, unknown>;
				if (typeof candidate.title !== "string" || typeof candidate.description !== "string" || typeof candidate.tags !== "string") continue;
				result[path] = { title: candidate.title, description: candidate.description, tags: candidate.tags };
			}
			return result;
		},
	});
	const [scrollPositionsByPath, setScrollPositionsByPath] = usePersistentPageState<Record<string, number>>("docs", "scrollPositions", {}, {
		encode: (value) => value,
		decode: (value) => {
			if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
			const result: Record<string, number> = {};
			for (const [path, position] of Object.entries(value)) {
				if (typeof position === "number" && Number.isFinite(position) && position >= 0) result[path] = position;
			}
			return result;
		},
	});

	const markdownPreviewRef = useRef<HTMLDivElement>(null);
	const scrollContainerRef = useRef<HTMLDivElement>(null);
	const scrollPositions = useRef<Map<string, number>>(new Map());
	const scrollAnimationRef = useRef<number | null>(null);
	const lineHighlightRef = useRef<HTMLDivElement>(null);
	const docViewerRef = useRef<HTMLDivElement>(null);
	const selectedDocRef = useRef(selectedDoc);
	const draftRef = useRef(editedContent);
	const savePromiseRef = useRef<Promise<void> | null>(null);
	const previousDocRef = useRef(selectedDoc);
	const previousDraftRef = useRef(editedContent);
	selectedDocRef.current = selectedDoc;
	draftRef.current = editedContent;
	useEffect(() => {
		scrollPositions.current = new Map(Object.entries(scrollPositionsByPath));
	}, [scrollPositionsByPath]);

	// Annotation context
	const annotationCtx = useAnnotationContext();

	// --- Scroll helpers ---
	const scrollToHeading = useCallback((headingId: string, behavior: ScrollBehavior = "smooth") => {
		const container = scrollContainerRef.current;
		if (!container) return false;
		const viewport = container.querySelector<HTMLElement>("[data-radix-scroll-area-viewport]") || container;
		const escapedHeadingId = CSS.escape(headingId);
		const heading =
			viewport.querySelector<HTMLElement>(`#${escapedHeadingId}`) ||
			viewport.querySelector<HTMLElement>(`[data-heading-slug="${escapedHeadingId}"]`) ||
			viewport.querySelector<HTMLElement>(`[id$="-${escapedHeadingId}"]`);
		if (!heading) return false;

		const viewportRect = viewport.getBoundingClientRect();
		const headingRect = heading.getBoundingClientRect();
		const targetTop = viewport.scrollTop + (headingRect.top - viewportRect.top) - 20;

		if (scrollAnimationRef.current !== null) {
			window.cancelAnimationFrame(scrollAnimationRef.current);
			scrollAnimationRef.current = null;
		}

		if (behavior === "auto") {
			viewport.scrollTop = targetTop;
			return true;
		}

		const startTop = viewport.scrollTop;
		const distance = targetTop - startTop;
		const duration = 280;
		const startTime = performance.now();
		const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

		const animate = (now: number) => {
			const progress = Math.min((now - startTime) / duration, 1);
			viewport.scrollTop = startTop + distance * ease(progress);
			if (progress < 1) {
				scrollAnimationRef.current = window.requestAnimationFrame(animate);
			} else {
				scrollAnimationRef.current = null;
			}
		};
		scrollAnimationRef.current = window.requestAnimationFrame(animate);
		return true;
	}, []);

	const updateSectionHash = useCallback((headingId: string | null) => {
		const hash = headingId ? `#${encodeURIComponent(headingId)}` : "";
		window.history.replaceState(window.history.state, "", `${window.location.pathname}${window.location.search}${hash}`);
	}, []);

	const navigateToHeading = useCallback((headingId: string, behavior: ScrollBehavior = "smooth") => {
		if (scrollToHeading(headingId, behavior)) updateSectionHash(headingId);
	}, [scrollToHeading, updateSectionHash]);

	useEffect(() => {
		if (selectedDoc) {
			const draft = metadataDrafts[selectedDoc.path];
			setMetaTitle(draft?.title ?? selectedDoc.metadata.title ?? "");
			setMetaDescription(draft?.description ?? selectedDoc.metadata.description ?? "");
			setMetaTags(draft?.tags ?? selectedDoc.metadata.tags?.join(", ") ?? "");
		}
	}, [metadataDrafts, selectedDoc]);

	const handleSaveMetadata = async (field: "title" | "description" | "tags") => {
		if (!selectedDoc || selectedDoc.isImported) return;
		const updates: { title?: string; description?: string; tags?: string[] } = {};
		if (field === "title" && metaTitle !== (selectedDoc.metadata.title || "")) updates.title = metaTitle;
		else if (field === "description" && metaDescription !== (selectedDoc.metadata.description || "")) updates.description = metaDescription;
		else if (field === "tags") {
			const newTags = metaTags.split(",").map(t => t.trim()).filter(t => t);
			if (JSON.stringify(newTags) !== JSON.stringify(selectedDoc.metadata.tags || [])) updates.tags = newTags;
		}
		if (Object.keys(updates).length === 0) return;
		try {
			await updateDoc(normalizePathForAPI(selectedDoc.path), updates);
			loadDocs();
		} catch (err) {
			console.error("Failed to save metadata:", err);
			setMetaTitle(selectedDoc.metadata.title || "");
			setMetaDescription(selectedDoc.metadata.description || "");
			setMetaTags(selectedDoc.metadata.tags?.join(", ") || "");
		}
	};

	const handleProjectChange = async (projectID: string) => {
		if (!selectedDoc || selectedDoc.isImported) return;
		try {
			const projectId = projectID === "global" ? "" : projectID;
			await updateDoc(normalizePathForAPI(selectedDoc.path), { projectId });
			setSelectedDoc({ ...selectedDoc, projectId: projectId || undefined });
			loadDocs();
		} catch (err) {
			console.error("Failed to save document project:", err);
		}
	};

	// URL params
	useEffect(() => {
		if ((location.search as Record<string, unknown>).create === true || (location.search as Record<string, unknown>).create === "true") {
			setShowCreateView(true);
			navigateTo("/docs", { replace: true });
		}
	}, [(location.search as Record<string, unknown>).create]);

	useEffect(() => {
		const rawSearch = String(location.searchStr || "");
		const params = new URLSearchParams(rawSearch.startsWith("?") ? rawSearch : `?${rawSearch}`);
		const lParam = params.get("L");
		if (!lParam) {
			setLineHighlight(null);
			return;
		}
		const rangeMatch = lParam.match(/^(\d+)-(\d+)$/);
		if (rangeMatch && rangeMatch[1] && rangeMatch[2]) {
			setLineHighlight({ start: +rangeMatch[1], end: +rangeMatch[2] });
		} else {
			const line = parseInt(lParam, 10);
			setLineHighlight(!isNaN(line) ? { start: line, end: line } : null);
		}
	}, [location.searchStr]);

	useEffect(() => {
		if (lineHighlight && lineHighlightRef.current) {
			requestAnimationFrame(() => lineHighlightRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
		}
	}, [lineHighlight]);

	// Scroll position restore
	useEffect(() => {
		if (selectedDoc && scrollContainerRef.current) {
			const activeHash = decodeURIComponent(window.location.hash.replace(/^#/, ""));
			const rawSearch = String(location.searchStr || "");
			const params = new URLSearchParams(rawSearch.startsWith("?") ? rawSearch : `?${rawSearch}`);
			if (activeHash || params.has("L")) return;
			const saved = scrollPositionsByPath[selectedDoc.path] ?? scrollPositions.current.get(selectedDoc.path) ?? 0;
			requestAnimationFrame(() => { if (scrollContainerRef.current) scrollContainerRef.current.scrollTop = saved; });
		}
	}, [location.searchStr, scrollPositionsByPath, selectedDoc?.path]);

	useEffect(() => {
		if (!selectedDoc) return;
		const id = decodeURIComponent(String(location.hash || "").replace(/^#/, ""));
		if (id) {
			window.setTimeout(() => scrollToHeading(id, "auto"), 80);
		}
	}, [location.hash, scrollToHeading, selectedDoc?.path]);

	useEffect(() => {
		const applyHash = () => {
			const id = decodeURIComponent(window.location.hash.replace(/^#/, ""));
			if (id) window.setTimeout(() => scrollToHeading(id, "auto"), 80);
		};
		window.addEventListener("hashchange", applyHash);
		return () => window.removeEventListener("hashchange", applyHash);
	}, [scrollToHeading]);

	useEffect(() => () => { if (scrollAnimationRef.current !== null) window.cancelAnimationFrame(scrollAnimationRef.current); }, []);

	// Handle markdown link clicks
	useEffect(() => {
		const handleLinkClick = (e: MouseEvent) => {
			let target = e.target as HTMLElement;
			while (target && target.tagName !== "A" && target !== markdownPreviewRef.current) {
				target = target.parentElement as HTMLElement;
			}
			if (target && target.tagName === "A") {
				const href = (target as HTMLAnchorElement).getAttribute("href");
				if (href?.startsWith("#")) {
					e.preventDefault();
					navigateToHeading(decodeURIComponent(href.slice(1)));
					return;
				}
				if (href && /^@?task-[\w.]+(.md)?$/.test(href)) {
					e.preventDefault();
					openTask(href.replace(/^@/, "").replace(/^task-/, "").replace(".md", ""));
					return;
				}
				if (href?.startsWith("@doc/")) {
					e.preventDefault();
					navigateTo(`/docs/${href.replace("@doc/", "")}.md`);
					return;
				}
				if (href && (href.endsWith(".md") || href.includes(".md#"))) {
					e.preventDefault();
					const normalized = href.replace(/^\.\//, "").replace(/^\//, "");
					const [docPath, hashPart] = normalized.split("#");
					void navigateTo(`/docs/${docPath ?? normalized}`).then(() => {
						if (hashPart) window.setTimeout(() => navigateToHeading(decodeURIComponent(hashPart), "auto"), 80);
					});
				}
			}
		};
		const el = markdownPreviewRef.current;
		if (el) { el.addEventListener("click", handleLinkClick); return () => el.removeEventListener("click", handleLinkClick); }
	}, [docs, navigateToHeading, openTask, selectedDoc]);

	// --- Handlers ---
	const saveDraft = useCallback((doc: Doc | null, content: string, keepalive = false) => {
		if (!doc || doc.isImported || content === (doc.content || "")) return Promise.resolve();
		if (savePromiseRef.current) return savePromiseRef.current;

		setSaving(true);
		setSaveError(null);
		const promise = updateDoc(
			normalizePathForAPI(doc.path),
			{ content },
			keepalive ? { keepalive: true } : undefined,
		)
			.then(() => {
				const current = selectedDocRef.current;
				if (current?.path === doc.path) setSelectedDoc({ ...current, content });
			})
			.catch((err) => {
				setSaveError(err instanceof Error ? err.message : "Failed to save document");
				console.error("Failed to save doc:", err);
			})
			.finally(() => {
				savePromiseRef.current = null;
				setSaving(false);
			});
		savePromiseRef.current = promise;
		return promise;
	}, [setSelectedDoc]);

	const flushDraft = useCallback(() => {
		const doc = selectedDocRef.current;
		const content = draftRef.current;
		if (doc && !doc.isImported && content !== (doc.content || "")) void saveDraft(doc, content, true);
	}, [saveDraft]);

	useEffect(() => {
		const previousDoc = previousDocRef.current;
		if (previousDoc?.path !== selectedDoc?.path && previousDoc && previousDraftRef.current !== (previousDoc.content || "")) {
			void saveDraft(previousDoc, previousDraftRef.current, true);
		}
		previousDocRef.current = selectedDoc;
		previousDraftRef.current = editedContent;
	}, [editedContent, saveDraft, selectedDoc?.content, selectedDoc?.path]);

	const handleSelectDoc = useCallback((doc: Doc | null) => {
		flushDraft();
		setSelectedDoc(doc);
	}, [flushDraft, setSelectedDoc]);

	const handleScroll = useCallback((event: React.UIEvent<HTMLDivElement>) => {
		const path = selectedDocRef.current?.path;
		if (!path) return;
		const position = event.currentTarget.scrollTop;
		setScrollPositionsByPath((current) => current[path] === position ? current : { ...current, [path]: position });
	}, [setScrollPositionsByPath]);

	const handleNavigateToFolder = useCallback((folder: string | null) => {
		flushDraft();
		navigateToFolder(folder);
	}, [flushDraft, navigateToFolder]);

	useEffect(() => {
		if (!selectedDoc) return;
		const interval = window.setInterval(() => flushDraft(), DOC_AUTOSAVE_INTERVAL_MS);
		return () => window.clearInterval(interval);
	}, [flushDraft, selectedDoc?.path]);

	useEffect(() => {
		const flushWhenLeaving = () => {
			if (document.visibilityState === "hidden") flushDraft();
		};
		document.addEventListener("visibilitychange", flushWhenLeaving);
		window.addEventListener("pagehide", flushDraft);
		window.addEventListener("beforeunload", flushDraft);
		return () => {
			document.removeEventListener("visibilitychange", flushWhenLeaving);
			window.removeEventListener("pagehide", flushDraft);
			window.removeEventListener("beforeunload", flushDraft);
			flushDraft();
		};
	}, [flushDraft]);

	useEffect(() => setSaveError(null), [editedContent, selectedDoc?.path]);

	const handleCopyPath = () => {
		if (selectedDoc) {
			navigator.clipboard.writeText(`@doc/${toDisplayPath(selectedDoc.path).replace(/\.md$/, "")}`).then(() => {
				setPathCopied(true);
				setTimeout(() => setPathCopied(false), 2000);
			});
		}
	};
	const handleSave = () => { void saveDraft(selectedDoc, editedContent); };
	const handleCancel = () => { if (selectedDoc) setEditedContent(selectedDoc.content || ""); };
	const openCreateView = () => { flushDraft(); setShowCreateView(true); setMobileSidebarOpen(false); };
	const dismissLineHighlight = () => {
		setLineHighlight(null);
		window.history.replaceState(window.history.state, "", window.location.pathname + window.location.hash);
	};

	// Annotation handler
	const handleAnnotate = useCallback(
		(selectedText: string, type: "comment" | "replace" | "delete", content: string, contextBefore: string, contextAfter: string, startLine: number, startChar: number, endLine: number, endChar: number) => {
			if (!selectedDoc) return;
			const docPath = toDisplayPath(selectedDoc.path).replace(/\.md$/, "");
			annotationCtx.add(docPath, selectedText, type, content, contextBefore, contextAfter, startLine, startChar, endLine, endChar);
		},
		[selectedDoc, annotationCtx],
	);

	const currentDocPath = selectedDoc ? toDisplayPath(selectedDoc.path).replace(/\.md$/, "") : "";
	const currentDocAnnotations = selectedDoc ? annotationCtx.getByDoc(currentDocPath) : [];
	const isDraftDirty = Boolean(selectedDoc && editedContent !== (selectedDoc.content || ""));
	const saveState = saving ? "saving" : saveError ? "error" : isDraftDirty ? "dirty" : "saved";
	const updateMetadataDraft = useCallback((field: "title" | "description" | "tags", value: string) => {
		if (!selectedDoc) return;
		setMetadataDrafts((current) => {
			const existing = current[selectedDoc.path] || {
				title: selectedDoc.metadata.title || "",
				description: selectedDoc.metadata.description || "",
				tags: selectedDoc.metadata.tags?.join(", ") || "",
			};
			return {
				...current,
				[selectedDoc.path]: { ...existing, [field]: value },
			};
		});
	}, [selectedDoc, setMetadataDrafts]);
	const handleMetaTitleChange = useCallback((value: string) => {
		setMetaTitle(value);
		updateMetadataDraft("title", value);
	}, [updateMetadataDraft]);
	const handleMetaDescriptionChange = useCallback((value: string) => {
		setMetaDescription(value);
		updateMetadataDraft("description", value);
	}, [updateMetadataDraft]);
	const handleMetaTagsChange = useCallback((value: string) => {
		setMetaTags(value);
		updateMetadataDraft("tags", value);
	}, [updateMetadataDraft]);
	const docHeader = selectedDoc ? (
		<DocsDocHeader
			selectedDoc={selectedDoc}
			metaTitle={metaTitle} setMetaTitle={handleMetaTitleChange}
			metaDescription={metaDescription} setMetaDescription={handleMetaDescriptionChange}
			metaTags={metaTags} setMetaTags={handleMetaTagsChange}
			handleSaveMetadata={handleSaveMetadata}
			handleProjectChange={handleProjectChange}
			linkedTasks={linkedTasks}
			linkedTasksExpanded={linkedTasksExpanded} setLinkedTasksExpanded={setLinkedTasksExpanded}
			openTask={openTask}
		/>
	) : null;

	const sidebarContent = (
		<DocsFileManager
			onCreateDoc={openCreateView}
			docs={docs}
			currentFolder={currentFolder}
			navigateToFolder={handleNavigateToFolder}
			setSelectedDoc={handleSelectDoc}
			showSpecsOnly={showSpecsOnly}
			setShowSpecsOnly={setShowSpecsOnly}
			searchQuery={docSearchQuery}
			onSearchQueryChange={setDocSearchQuery}
			selectedDocPath={selectedDoc?.path}
			onItemSelect={() => setMobileSidebarOpen(false)}
			className="h-full"
		/>
	);

	if (loading) return <div className="p-6 flex items-center justify-center h-64"><div className="text-lg text-muted-foreground">Loading documentation...</div></div>;
	if (error) return (
		<div className="p-6 flex items-center justify-center h-64">
			<div className="text-center">
				<p className="text-lg text-destructive mb-2">Failed to load documentation</p>
				<p className="text-sm text-muted-foreground mb-4">{error}</p>
				<Button onClick={() => loadDocs()} variant="outline">Retry</Button>
			</div>
		</div>
	);

	return (
		<div className="h-full flex overflow-hidden bg-background">
			<aside className="hidden lg:flex w-[300px] xl:w-[320px] shrink-0 bg-[#fafaf8] dark:bg-muted/10 border-r border-border/40">
				<div className="h-full w-full px-3 py-5">{sidebarContent}</div>
			</aside>

			<div className="min-w-0 flex-1 flex flex-col overflow-hidden">
				<Sheet open={mobileSidebarOpen} onOpenChange={setMobileSidebarOpen}>
					<SheetContent side="left" className="w-[92vw] max-w-none p-0 sm:max-w-md">
						<div className="flex h-full flex-col">
							<div className="border-b border-border/50 px-4 py-3"><SheetTitle>Browse docs</SheetTitle></div>
							<div className="min-h-0 flex-1 px-3 py-4">{sidebarContent}</div>
						</div>
					</SheetContent>
				</Sheet>

				{selectedDoc ? (
					<>
						{/* Toolbar */}
						<div className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-5 py-2 border-b border-border/40 shrink-0 bg-background/90 backdrop-blur-sm">
							<Button variant="ghost" size="sm" onClick={() => setMobileSidebarOpen(true)} className="h-7 px-2 text-muted-foreground hover:text-foreground lg:hidden">
								<Menu className="w-3.5 h-3.5" />
							</Button>
							<Button variant="ghost" size="sm" onClick={() => handleNavigateToFolder(selectedDoc.folder || currentFolder || null)} className="h-7 px-2 text-muted-foreground hover:text-foreground">
								<ArrowLeft className="w-3.5 h-3.5 sm:mr-1" /><span className="hidden sm:inline text-xs">Back</span>
							</Button>
							<button type="button" onClick={handleCopyPath} className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors min-w-0 rounded-full px-2 py-1 hover:bg-accent/60" title="Click to copy reference">
								<Copy className="w-3 h-3 shrink-0" />
								<span className="font-mono truncate max-w-[240px] sm:max-w-[320px] lg:max-w-[400px] opacity-85">
									@doc/{toDisplayPath(selectedDoc.path).replace(/\.md$/, "")}
								</span>
							</button>
							{pathCopied && <span className="text-green-600 text-[11px]">Copied</span>}
							<div className="flex-1" />
							<Button variant="ghost" size="sm" onClick={() => setWideMode(!wideMode)} className="h-7 px-2 text-muted-foreground hover:text-foreground" title={wideMode ? "Normal width" : "Full width"}>
								{wideMode ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
							</Button>
							<Button variant="ghost" size="sm" onClick={() => setHistoryOpen(true)} className="h-7 px-2 text-muted-foreground hover:text-foreground" title="Document history">
								<History className="w-3.5 h-3.5 sm:mr-1" /><span className="hidden sm:inline text-xs">History</span>
							</Button>
							{selectedDoc.isImported ? (
								<span className="px-2 text-xs text-muted-foreground">Read only</span>
							) : (
								<>
									<span role="status" aria-live="polite" data-save-state={saveState} className={`docs-save-status px-1.5 text-[11px] ${saveError ? "text-destructive" : "text-muted-foreground"}`}>
										<span className="docs-save-status-dot" aria-hidden="true" />
										<span className="hidden md:inline">{saving ? "Saving..." : saveError ? "Save failed" : isDraftDirty ? "Unsaved changes" : "Saved"}</span>
									</span>
									<Button size="sm" onClick={handleSave} disabled={saving || !isDraftDirty} className="h-7 px-2.5 rounded-full">
										<Check className="w-3.5 h-3.5 sm:mr-1" /><span className="hidden sm:inline text-xs">{saving ? "Saving..." : "Save"}</span>
									</Button>
									<Button size="sm" variant="secondary" onClick={handleCancel} disabled={saving || !isDraftDirty} className="h-7 px-2.5 rounded-full">
										<X className="w-3.5 h-3.5 sm:mr-1" /><span className="hidden sm:inline text-xs">Cancel</span>
									</Button>
								</>
							)}
						</div>

						{isEditing ? (
							<div className="docs-editor-stage flex-1 min-h-0 overflow-hidden p-3 sm:p-5 lg:p-6">
								<div className={`docs-editor-frame h-full min-h-0 w-full mx-auto overflow-y-auto ${wideMode ? "max-w-[1040px]" : "max-w-[880px]"}`}>
									<div className={`docs-editor-header mx-auto w-full px-5 pt-8 sm:px-10 sm:pt-12 ${wideMode ? "max-w-[96ch]" : "max-w-[78ch]"}`}>{docHeader}</div>
									<MDEditor markdown={editedContent} onChange={setEditedContent} placeholder="Start writing…" readOnly={selectedDoc.isImported} height="auto" className={`docs-live-editor ${wideMode ? "docs-live-editor-wide" : ""}`} />
								</div>
							</div>
						) : (
							<div className="flex-1 overflow-y-auto relative" ref={scrollContainerRef} onScroll={handleScroll}>
								<div ref={docViewerRef} className="flex justify-center relative">
									<article data-document-surface="doc" key={selectedDoc.path} className={`w-full px-6 sm:px-8 py-10 sm:py-12 transition-[max-width] duration-300 ease-in-out animate-doc-in ${wideMode ? "max-w-[1040px]" : "max-w-[880px]"}`}>
										{docHeader}
										<div ref={markdownPreviewRef} className="prose-neutral dark:prose-invert relative">
											<MDRenderWithHighlight
												ref={lineHighlightRef}
												content={selectedDoc.content || ""}
												lineHighlight={lineHighlight}
												onDismissHighlight={lineHighlight ? dismissLineHighlight : undefined}
												onTaskLinkClick={setPreviewTaskId}
												onDocLinkClick={(path) => navigateTo(`/docs/${path}`)}
												onHeadingAnchorClick={navigateToHeading}
												showHeadingAnchors
											/>
											{/* Annotation highlights */}
											<AnnotationHighlighter
												containerRef={markdownPreviewRef}
												annotations={currentDocAnnotations}
												docContent={selectedDoc.content || ""}
												active={true}
												onEdit={(ann, changes) => {
													annotationCtx.update(ann.id, changes);
												}}
												onRemove={annotationCtx.remove}
											/>
											{/* Annotation selection toolbar */}
											<AnnotationSelectionToolbar
												containerRef={markdownPreviewRef}
												active={true}
												docContent={selectedDoc.content || ""}
												onAnnotate={handleAnnotate}
											/>
										</div>
									</article>
									{!isEditing && (
										<div className="w-56 shrink-0 hidden xl:block pt-12 pr-6">
											<div className="sticky top-8">
												<DocMiniGraph docPath={selectedDoc.path} />
												<DocsTOC markdown={selectedDoc.content || ""} scrollContainerRef={scrollContainerRef} onHeadingSelect={navigateToHeading} />
											</div>
										</div>
									)}
									{/* Annotation bubble */}
									<AnnotationBubble
										containerRef={scrollContainerRef}
										onNavigateToDoc={(docPath) => navigateTo(`/docs/${docPath}`)}
									/>
								</div>
							</div>
						)}
					</>
				) : showCreateView ? (
					<DocsCreateView
						currentFolder={currentFolder}
						onClose={() => setShowCreateView(false)}
						onCreated={() => { setShowCreateView(false); setMobileSidebarOpen(false); loadDocs(); }}
						onOpenMobileSidebar={() => setMobileSidebarOpen(true)}
					/>
				) : (
					<DocsEmptyState currentFolder={currentFolder} onCreateDoc={openCreateView} onOpenMobileSidebar={() => setMobileSidebarOpen(true)} />
				)}
			</div>
			{selectedDoc && (
				<DocHistorySheet
					open={historyOpen}
					onOpenChange={setHistoryOpen}
					docPath={selectedDoc.path}
					docTitle={selectedDoc.metadata.title || selectedDoc.path}
					readOnly={selectedDoc.isImported}
					onRestored={() => {
						void loadDocs();
					}}
				/>
			)}
			<TaskPreviewDialog taskId={previewTaskId} open={!!previewTaskId} onOpenChange={(open) => { if (!open) setPreviewTaskId(null); }} />
		</div>
	);
}
