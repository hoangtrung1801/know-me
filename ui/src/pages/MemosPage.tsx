import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { memoApi, type Memo } from "@/ui/api/client";
import { MDRender } from "@/ui/components/editor";
import { PageContent, PageError, PageHeader, PageLoading, PageShell } from "@/ui/components/templates/PageShell";
import { Button } from "@/ui/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/ui/components/ui/dialog";
import { Input } from "@/ui/components/ui/input";
import { Textarea } from "@/ui/components/ui/textarea";
import { useDebouncedValue } from "@/ui/hooks/useDebouncedValue";

function dayKey(date: Date) {
	return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function dayLabel(value: string) {
	const date = new Date(value);
	const today = new Date();
	const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
	if (dayKey(date) === dayKey(today)) return "Today";
	if (dayKey(date) === dayKey(yesterday)) return "Yesterday";
	return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(date);
}

function memoTags(content: string) {
	return [...content.matchAll(/(?:^|\s)#([\p{L}\p{N}_-]+)/gu)].map((match) => match[1]);
}

function groupMemos(items: Memo[]) {
	const groups: Array<{ label: string; items: Memo[] }> = [];
	for (const memo of items) {
		const label = dayLabel(memo.createdAt);
		const current = groups.at(-1);
		if (current?.label === label) current.items.push(memo);
		else groups.push({ label, items: [memo] });
	}
	return groups;
}

export default function MemosPage() {
	const [memos, setMemos] = useState<Memo[]>([]);
	const [query, setQuery] = useState("");
	const [selectedTags, setSelectedTags] = useState<string[]>([]);
	const debouncedQuery = useDebouncedValue(query, 250);
	const [newContent, setNewContent] = useState("");
	const [editingID, setEditingID] = useState<string | null>(null);
	const [editContent, setEditContent] = useState("");
	const [deleteTarget, setDeleteTarget] = useState<Memo | null>(null);
	const [loading, setLoading] = useState(true);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const load = useCallback(async (search: string) => {
		setLoading(true);
		setError(null);
		try {
			setMemos(await memoApi.list(search));
		} catch (err) {
			setError(err instanceof Error ? err.message : "Memos could not be loaded.");
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => { void load(debouncedQuery); }, [debouncedQuery, load]);

	const availableTags = useMemo(() => [...new Set(memos.flatMap((memo) => memoTags(memo.content)))].sort(), [memos]);
	const visibleMemos = useMemo(() => selectedTags.length === 0 ? memos : memos.filter((memo) => memoTags(memo.content).some((tag) => selectedTags.includes(tag))), [memos, selectedTags]);

	const add = async (event: React.FormEvent) => {
		event.preventDefault();
		if (!newContent.trim()) return;
		setBusy(true);
		setError(null);
		try {
			const created = await memoApi.add(newContent);
			setNewContent("");
			if (debouncedQuery.trim()) await load(debouncedQuery);
			else setMemos((items) => [created, ...items]);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Memo could not be added.");
		} finally {
			setBusy(false);
		}
	};

	const save = async (memo: Memo) => {
		if (!editContent.trim()) return;
		setBusy(true);
		setError(null);
		try {
			const updated = await memoApi.update(memo.id, editContent);
			setMemos((items) => items.map((item) => item.id === updated.id ? updated : item));
			setEditingID(null);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Memo could not be updated.");
		} finally {
			setBusy(false);
		}
	};

	const remove = async () => {
		if (!deleteTarget) return;
		setBusy(true);
		setError(null);
		try {
			await memoApi.delete(deleteTarget.id);
			setMemos((items) => items.filter((item) => item.id !== deleteTarget.id));
			setDeleteTarget(null);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Memo could not be deleted.");
		} finally {
			setBusy(false);
		}
	};

	const groups = groupMemos(visibleMemos);
	const emptyMessage = query.trim() || selectedTags.length > 0 ? "No matching memos" : "No memos yet";

	return (
		<PageShell>
			<PageHeader
				size="reading"
				title="Memos"
				description="Quick Markdown notes, available across every project."
				context="Personal notes"
				status={`${memos.length} ${memos.length === 1 ? "memo" : "memos"}`}
			/>
			<PageContent size="reading" data-document-surface="memos">
				<form onSubmit={add} className="rounded-lg border border-border bg-transparent p-4 shadow-none">
					<Textarea aria-label="New memo" value={newContent} onChange={(event) => setNewContent(event.target.value)} placeholder="Write a quick note in Markdown..." rows={4} />
					<div className="mt-3 flex justify-end">
						<Button type="submit" disabled={busy || !newContent.trim()}>
							{busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
							Add memo
						</Button>
					</div>
				</form>

				<div className="relative mt-5">
					<Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
					<Input aria-label="Search memos" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search memos..." className="pl-9" />
				</div>
				{availableTags.length > 0 && <div className="mt-3 flex flex-wrap gap-2" aria-label="Filter memos by tag">
					<Button size="sm" variant={selectedTags.length === 0 ? "default" : "outline"} onClick={() => setSelectedTags([])}>All tags</Button>
					{availableTags.map((tag) => <Button key={tag} size="sm" variant={selectedTags.includes(tag) ? "default" : "outline"} aria-pressed={selectedTags.includes(tag)} onClick={() => setSelectedTags((current) => current.includes(tag) ? current.filter((item) => item !== tag) : [...current, tag])}>{tag}</Button>)}
				</div>}

				{error && <p role="alert" className="mt-4 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</p>}
				{loading ? <PageLoading label="Loading memos" /> : groups.length === 0 ? <div className="mt-8 rounded-xl border border-dashed px-6 py-12 text-center text-sm text-muted-foreground">{emptyMessage}</div> : <div className="mt-8 space-y-8">
					{groups.map((group) => <section key={group.label} aria-labelledby={`memos-${group.label}`}>
						<h2 id={`memos-${group.label}`} className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">{group.label}</h2>
						<div className="grid gap-4 md:grid-cols-2">
							{group.items.map((memo) => <article key={memo.id} className="rounded-lg border border-border bg-transparent p-4 shadow-none">
								{editingID === memo.id ? <div>
									<Textarea aria-label="Edit memo" value={editContent} onChange={(event) => setEditContent(event.target.value)} rows={6} />
									<div className="mt-3 flex justify-end gap-2"><Button type="button" variant="outline" disabled={busy} onClick={() => setEditingID(null)}>Cancel</Button><Button type="button" disabled={busy || !editContent.trim()} onClick={() => void save(memo)}>{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save memo</Button></div>
								</div> : <>
									<MDRender markdown={memo.content} className="prose max-w-none text-sm leading-6 dark:prose-invert" />
									<div className="mt-4 flex items-center justify-between gap-3 border-t pt-3 text-xs text-muted-foreground"><time dateTime={memo.updatedAt}>{new Date(memo.updatedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</time><div className="flex gap-1"><Button type="button" variant="ghost" size="icon" className="h-8 w-8" aria-label="Edit memo" onClick={() => { setEditingID(memo.id); setEditContent(memo.content); }}><Pencil className="h-4 w-4" /></Button><Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" aria-label="Delete memo" onClick={() => setDeleteTarget(memo)}><Trash2 className="h-4 w-4" /></Button></div></div>
								</>}
							</article>)}
						</div>
					</section>)}
				</div>}
			</PageContent>
			<Dialog open={Boolean(deleteTarget)} onOpenChange={(open) => !busy && !open && setDeleteTarget(null)}><DialogContent><DialogHeader><DialogTitle>Delete memo?</DialogTitle><DialogDescription>This permanently removes the memo and cannot be undone.</DialogDescription></DialogHeader><DialogFooter><Button type="button" variant="outline" disabled={busy} onClick={() => setDeleteTarget(null)}>Cancel</Button><Button type="button" variant="destructive" disabled={busy} onClick={() => void remove()}>{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Delete permanently</Button></DialogFooter></DialogContent></Dialog>
		</PageShell>
	);
}
