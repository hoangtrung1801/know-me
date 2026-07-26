import { useState, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogTitle } from "../../ui/dialog";
import { Button } from "../../ui/button";
import { ExternalLink, Loader2, FileText } from "lucide-react";
import { getDoc, type Doc } from "../../../api/client";
import { navigateTo } from "../../../lib/navigation";
import { MDRenderWithHighlight } from "../../editor/MDRenderWithHighlight";
import { parseDocFragment } from "../../editor/DocMentionBadge";

interface DocPreviewDialogProps {
	docPath: string | null;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

export function DocPreviewDialog({
	docPath,
	open,
	onOpenChange,
}: DocPreviewDialogProps) {
	const [doc, setDoc] = useState<Doc | null>(null);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const frag = useMemo(() => (docPath ? parseDocFragment(docPath) : null), [docPath]);
	const lineHighlight = useMemo(() => {
		if (!frag) return null;
		if (frag.startLine != null && frag.endLine != null) return { start: frag.startLine, end: frag.endLine };
		if (frag.line != null) return { start: frag.line, end: frag.line };
		return null;
	}, [frag]);

	useEffect(() => {
		if (!open || !docPath) {
			setDoc(null);
			setError(null);
			return;
		}

		setLoading(true);
		setError(null);

		// Strip line/range/heading suffixes before fetching
		const cleanPath = frag?.path || docPath;

		getDoc(cleanPath)
			.then((data) => {
				if (data) {
					setDoc(data);
				} else {
					setError("Document not found");
				}
			})
			.catch((err) => {
				setError(err instanceof Error ? err.message : "Failed to load document");
			})
			.finally(() => {
				setLoading(false);
			});
	}, [open, docPath]);

	const handleViewInDocs = () => {
		if (docPath) {
			navigateTo(`/docs/${docPath}`);
			onOpenChange(false);
		}
	};

	const contentPreview = doc?.content || "";

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-4xl w-[95vw] p-0 gap-0 max-h-[90vh] overflow-hidden border-border/60 bg-background/95 shadow-2xl flex flex-col">
				<DialogTitle className="sr-only">
					Document Preview: {docPath}
				</DialogTitle>

				{loading && (
					<div className="flex items-center justify-center p-12">
						<Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
					</div>
				)}

				{error && (
					<div className="p-6 text-center">
						<p className="text-destructive">{error}</p>
					</div>
				)}

				{doc && !loading && !error && (
					<>
						<div className="border-b border-border/50 bg-muted/20 px-6 py-5 shrink-0">
							<div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
								<FileText className="h-3.5 w-3.5" />
								<span className="rounded-md bg-background px-2 py-1 font-mono text-[11px] shadow-sm">
									{doc.path}
								</span>
							</div>
							<h2 className="text-2xl font-semibold tracking-tight leading-tight">
								{doc.title}
							</h2>
							{doc.description && (
								<p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
									{doc.description}
								</p>
							)}
							{doc.tags && doc.tags.length > 0 && (
								<div className="mt-3 flex flex-wrap gap-1.5">
									{doc.tags.map((tag) => (
										<span
											key={tag}
											className="rounded-md border border-border/60 bg-background px-2 py-1 text-[11px] text-muted-foreground"
										>
											{tag}
										</span>
									))}
								</div>
							)}
						</div>

						<div className="min-h-0 flex-1 overflow-y-auto bg-background">
							<div className="mx-auto max-w-2xl px-6 py-6">
								{contentPreview ? (
									<MDRenderWithHighlight
										content={contentPreview}
										lineHighlight={lineHighlight}
										className="prose prose-sm max-w-none dark:prose-invert [&_h1]:text-2xl [&_h2]:text-xl [&_p]:leading-7"
									/>
								) : (
									<p className="text-sm text-muted-foreground italic">
										No content
									</p>
								)}
							</div>
						</div>

						<div className="flex justify-end border-t border-border/50 bg-muted/10 px-6 py-3">
							<Button
								variant="outline"
								size="sm"
								onClick={handleViewInDocs}
								className="h-7 gap-1.5 rounded-md text-[11px]"
							>
								<ExternalLink className="h-4 w-4" />
								View in Docs
							</Button>
						</div>
					</>
				)}
			</DialogContent>
		</Dialog>
	);
}
