import { useRouterState } from "@tanstack/react-router";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { Task } from "@/ui/models/task";
import { getDocs, getTasksBySpec } from "../api/client";
import { navigateTo } from "../lib/navigation";
import { useSSEEvent } from "./SSEContext";
import { normalizePath, toDisplayPath, isSpec, getSpecStatusOrder, type Doc } from "../lib/utils";

interface DocsContextType {
	docs: Doc[];
	loading: boolean;
	error: string | null;
	selectedDoc: Doc | null;
	setSelectedDoc: (doc: Doc | null) => void;
	selectDocByPath: (path: string) => void;
	isEditing: boolean;
	setIsEditing: (editing: boolean) => void;
	editedContent: string;
	setEditedContent: (content: string) => void;
	linkedTasks: Task[];
	showSpecsOnly: boolean;
	setShowSpecsOnly: (show: boolean) => void;
	linkedTasksExpanded: boolean;
	setLinkedTasksExpanded: (expanded: boolean) => void;
	loadDocs: () => void;
	currentFolder: string | null;
	navigateToFolder: (folder: string | null) => void;
}

const DocsContext = createContext<DocsContextType | null>(null);

export function DocsProvider({ children }: { children: React.ReactNode }) {
	const location = useRouterState({ select: (state) => state.location });
	const [docs, setDocs] = useState<Doc[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [selectedDoc, setSelectedDocState] = useState<Doc | null>(null);
	const [isEditing, setIsEditing] = useState(false);
	const [editedContent, setEditedContent] = useState("");
	const [linkedTasks, setLinkedTasks] = useState<Task[]>([]);
	const [linkedTasksExpanded, setLinkedTasksExpanded] = useState(false);
	const [showSpecsOnly, setShowSpecsOnlyState] = useState(() => {
		const saved = localStorage.getItem("docs-specs-only");
		return saved === "true";
	});
	const [currentFolder, setCurrentFolder] = useState<string | null>(null);
	const docsRef = useRef<Doc[]>([]);
	const selectedDocRef = useRef<Doc | null>(null);

	// Keep ref in sync
	useEffect(() => {
		docsRef.current = docs;
	}, [docs]);

	useEffect(() => {
		selectedDocRef.current = selectedDoc;
	}, [selectedDoc]);

	// Persist filter state
	useEffect(() => {
		localStorage.setItem("docs-specs-only", String(showSpecsOnly));
	}, [showSpecsOnly]);

	const setShowSpecsOnly = useCallback((show: boolean) => {
		setShowSpecsOnlyState(show);
	}, []);

	const loadDocs = useCallback(() => {
		setError(null);
		getDocs()
			.then((data) => {
				setDocs(data as unknown as Doc[]);
				setLoading(false);
			})
			.catch((err) => {
				console.error("Failed to load docs:", err);
				setError(err instanceof Error ? err.message : "Failed to load documentation");
				setLoading(false);
			});
	}, []);

	// Initial load
	useEffect(() => {
		loadDocs();
	}, [loadDocs]);

	// Fetch linked tasks when a spec is selected
	const refreshLinkedTasks = useCallback(() => {
		const doc = selectedDocRef.current;
		if (doc && isSpec(doc)) {
			const specPath = toDisplayPath(doc.path).replace(/\.md$/, "");
			getTasksBySpec(specPath)
				.then((tasks) => setLinkedTasks(tasks))
				.catch(() => setLinkedTasks([]));
		} else {
			setLinkedTasks([]);
		}
	}, []);

	useEffect(() => {
		refreshLinkedTasks();
	}, [selectedDoc, refreshLinkedTasks]);

	// SSE updates
	useSSEEvent("docs:updated", () => loadDocs());
	useSSEEvent("docs:refresh", () => loadDocs());
	useSSEEvent("tasks:updated", () => refreshLinkedTasks());
	useSSEEvent("tasks:refresh", () => refreshLinkedTasks());

	const setSelectedDoc = useCallback((doc: Doc | null) => {
		setSelectedDocState(doc);
		setIsEditing(false);
		setLinkedTasksExpanded(false);
	}, []);

	const findDocByPath = useCallback((docPath: string, docsList: Doc[]): Doc | undefined => {
		const normalizedDocPath = normalizePath(docPath).replace(/^\.\//, "").replace(/^\//, "");
		const normalizedDocPathNoExt = normalizedDocPath.replace(/\.md$/, "");
		const lowerDocPath = normalizedDocPath.toLowerCase();
		const lowerDocPathNoExt = normalizedDocPathNoExt.toLowerCase();

		return docsList.find((doc) => {
			const storedPath = normalizePath(doc.path);
			const storedPathNoExt = storedPath.replace(/\.md$/, "");
			const lowerStoredPath = storedPath.toLowerCase();
			const lowerStoredPathNoExt = storedPathNoExt.toLowerCase();

			return (
				// Exact match
				storedPath === normalizedDocPath ||
				storedPath === normalizedDocPathNoExt ||
				storedPathNoExt === normalizedDocPath ||
				storedPathNoExt === normalizedDocPathNoExt ||
				// Suffix match (for nested paths)
				storedPath.endsWith(`/${normalizedDocPath}`) ||
				storedPath.endsWith(`/${normalizedDocPathNoExt}`) ||
				// Filename match
				doc.filename === normalizedDocPath ||
				doc.filename === normalizedDocPathNoExt ||
				// Case-insensitive fallback
				lowerStoredPath === lowerDocPath ||
				lowerStoredPathNoExt === lowerDocPathNoExt
			);
		});
	}, []);

	const selectDocByPath = useCallback((docPath: string) => {
		const currentDocs = docsRef.current;
		if (currentDocs.length === 0) return;
		const targetDoc = findDocByPath(docPath, currentDocs);
		if (targetDoc) {
			setSelectedDoc(targetDoc);
		}
	}, [findDocByPath, setSelectedDoc]);

	const navigateToFolder = useCallback((folder: string | null) => {
		setCurrentFolder(folder);
		setSelectedDocState(null);
		setIsEditing(false);
		navigateTo(folder ? `/docs/${folder}` : "/docs");
	}, []);

	// Handle URL navigation for docs
	const handleHashNavigation = useCallback(() => {
		if (docs.length === 0) return;

		const pathname = location.pathname;
		const match = pathname.match(/^\/docs\/(.+)$/);

		if (match?.[1]) {
			const docPath = decodeURIComponent(match[1]);
			// Try to find a matching doc first
			const targetDoc = findDocByPath(docPath, docs);
			if (targetDoc) {
				setSelectedDoc(targetDoc);
				// Set currentFolder to the doc's folder
				setCurrentFolder(targetDoc.folder || null);
			} else {
				// No doc match - treat as folder navigation
				const folderPath = docPath.replace(/\/$/, "");
				setCurrentFolder(folderPath);
				setSelectedDocState(null);
			}
		} else if (pathname === "/docs" || pathname === "/docs/") {
			setSelectedDoc(null);
			setCurrentFolder(null);
		}
	}, [docs, findDocByPath, location.pathname, setSelectedDoc]);

	useEffect(() => {
		handleHashNavigation();
	}, [handleHashNavigation]);

	const value = useMemo(
		() => ({
			docs,
			loading,
			error,
			selectedDoc,
			setSelectedDoc,
			selectDocByPath,
			isEditing,
			setIsEditing,
			editedContent,
			setEditedContent,
			linkedTasks,
			showSpecsOnly,
			setShowSpecsOnly,
			linkedTasksExpanded,
			setLinkedTasksExpanded,
			loadDocs,
			currentFolder,
			navigateToFolder,
		}),
		[
			docs, loading, error, selectedDoc, setSelectedDoc, selectDocByPath,
			isEditing, editedContent, linkedTasks, showSpecsOnly, setShowSpecsOnly,
			linkedTasksExpanded, loadDocs, currentFolder, navigateToFolder,
		]
	);

	return <DocsContext.Provider value={value}>{children}</DocsContext.Provider>;
}

export function useDocs() {
	const context = useContext(DocsContext);
	if (!context) {
		throw new Error("useDocs must be used within a DocsProvider");
	}
	return context;
}

/** Safe version that returns null when outside DocsProvider instead of throwing. */
export function useDocsOptional() {
	return useContext(DocsContext);
}
