import { useCallback, useEffect, useMemo, useState } from "react";
import { ExternalLink, Link2, Loader2, Pencil, Plus, RefreshCw } from "lucide-react";
import { linkApi, type SavedLink } from "@/ui/api/client";
import { PageContent, PageHeader, PageLoading, PageShell } from "@/ui/components/templates/PageShell";
import { Button } from "@/ui/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/ui/components/ui/dialog";
import { Input } from "@/ui/components/ui/input";
import { Textarea } from "@/ui/components/ui/textarea";

export default function LinksPage() {
	const [links, setLinks] = useState<SavedLink[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [editing, setEditing] = useState<SavedLink | null>(null);
	const [adding, setAdding] = useState(false);
	const [url, setURL] = useState("");
	const [addImage, setAddImage] = useState<File | undefined>();
	const [title, setTitle] = useState("");
	const [description, setDescription] = useState("");
	const [image, setImage] = useState<File | undefined>();
	const [busy, setBusy] = useState(false);
	const [selectedTags, setSelectedTags] = useState<string[]>([]);
	const availableTags = useMemo(() => [...new Set(links.flatMap((link) => link.tags ?? []))].sort(), [links]);
	const visibleLinks = useMemo(() => selectedTags.length === 0 ? links : links.filter((link) => (link.tags ?? []).some((tag) => selectedTags.includes(tag))), [links, selectedTags]);

	const load = useCallback(async () => {
		setError(null);
		try { setLinks(await linkApi.list()); } catch { setError("Saved links could not be loaded."); } finally { setLoading(false); }
	}, []);
	useEffect(() => { void load(); }, [load]);

	const openEditor = (link: SavedLink) => {
		setEditing(link); setTitle(link.title); setDescription(link.description); setImage(undefined);
	};
	const save = async (event: React.FormEvent) => {
		event.preventDefault();
		if (!editing) return;
		setBusy(true); setError(null);
		try {
			const updated = await linkApi.update(editing.id, { title, description, image });
			setLinks((items) => items.map((item) => item.id === updated.id ? updated : item));
			setEditing(null);
		} catch (err) { setError(err instanceof Error ? err.message : "Link could not be updated."); } finally { setBusy(false); }
	};
	const add = async (event: React.FormEvent) => {
		event.preventDefault();
		setBusy(true); setError(null);
		try {
			const created = await linkApi.add(url, addImage);
			setLinks((items) => [created, ...items]);
			setAdding(false); setURL(""); setAddImage(undefined);
		} catch (err) { setError(err instanceof Error ? err.message : "Link could not be saved."); } finally { setBusy(false); }
	};
	const imageSrc = (link: SavedLink) => !link.image ? undefined : /^https?:\/\//i.test(link.image) ? link.image : `/api/links/${encodeURIComponent(link.id)}/image?v=${encodeURIComponent(link.updatedAt)}`;

	return <PageShell>
		<PageHeader size="full" title="Saved links" description="Your global link library, available across every project." context="Library" status={`${links.length} ${links.length === 1 ? "link" : "links"}`} actions={<><Button onClick={() => { setURL(""); setAddImage(undefined); setAdding(true); }}><Plus className="mr-2 h-4 w-4" />Add Link</Button><Button variant="outline" onClick={() => void load()}><RefreshCw className="mr-2 h-4 w-4" />Refresh</Button></>} />
		{availableTags.length > 0 && <div className="mx-auto flex w-full max-w-screen-2xl flex-wrap gap-2 px-6 pt-4" aria-label="Filter links by tag">
			<Button size="sm" variant={selectedTags.length === 0 ? "default" : "outline"} onClick={() => setSelectedTags([])}>All tags</Button>
			{availableTags.map((tag) => <Button key={tag} size="sm" variant={selectedTags.includes(tag) ? "default" : "outline"} aria-pressed={selectedTags.includes(tag)} onClick={() => setSelectedTags((current) => current.includes(tag) ? current.filter((item) => item !== tag) : [...current, tag])}>{tag}</Button>)}
		</div>}
		<PageContent size="full">
			{loading ? <PageLoading label="Loading saved links" /> : error && links.length === 0 ? <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div> : links.length === 0 ? <div className="rounded-lg border border-dashed px-6 py-12 text-center"><Link2 className="mx-auto h-8 w-8 text-muted-foreground" /><p className="mt-3 text-sm font-medium">No saved links yet</p><p className="mt-1 text-sm text-muted-foreground">Use the CLI, MCP, or API to save a URL.</p></div> : visibleLinks.length === 0 ? <div className="rounded-lg border border-dashed px-6 py-12 text-center"><p className="text-sm text-muted-foreground">No links match the selected tags.</p></div> : <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
				{visibleLinks.map((link) => { const src = imageSrc(link); return <article key={link.id} className="group overflow-hidden rounded-lg border border-border bg-transparent shadow-none transition-colors hover:bg-accent/40">
					{src ? <img src={src} alt="" className="h-36 w-full object-cover" /> : <div className="flex h-36 items-center justify-center bg-muted/40"><Link2 className="h-8 w-8 text-muted-foreground/50" /></div>}
					<div className="p-4"><div className="flex items-start justify-between gap-3"><h2 className="line-clamp-2 font-semibold leading-tight">{link.title || link.url}</h2><Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" aria-label={`Edit ${link.title || link.url}`} onClick={() => openEditor(link)}><Pencil className="h-4 w-4" /></Button></div>
						{link.description && <p className="mt-2 line-clamp-3 text-sm text-muted-foreground">{link.description}</p>}
						{link.tags?.length ? <div className="mt-3 flex flex-wrap gap-1">{link.tags.map((tag) => <span key={tag} className="rounded-full bg-muted px-2 py-0.5 text-xs">{tag}</span>)}</div> : null}
						<a href={link.url} target="_blank" rel="noreferrer" className="mt-4 flex items-center gap-1 truncate text-xs text-primary hover:underline" title={link.url}>{link.url}<ExternalLink className="h-3 w-3 shrink-0" /></a>
					</div></article>; })}
			</div>}
			{error && links.length > 0 && <p role="alert" className="mt-4 text-sm text-destructive">{error}</p>}
		</PageContent>
		<Dialog open={adding} onOpenChange={(open) => !busy && setAdding(open)}><DialogContent><DialogHeader><DialogTitle>Add Link</DialogTitle><DialogDescription>Save a URL now. Its title, description, and image are fetched automatically.</DialogDescription></DialogHeader><form onSubmit={add} className="space-y-4"><Input aria-label="URL" type="url" required autoFocus value={url} onChange={(event) => setURL(event.target.value)} placeholder="https://example.com/article" /><Input aria-label="Image" type="file" accept="image/jpeg,image/png,image/gif,image/webp" onChange={(event) => setAddImage(event.target.files?.[0])} /><DialogFooter><Button type="button" variant="outline" disabled={busy} onClick={() => setAdding(false)}>Cancel</Button><Button type="submit" disabled={busy || !url.trim()}>{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save link</Button></DialogFooter></form></DialogContent></Dialog>
		<Dialog open={Boolean(editing)} onOpenChange={(open) => !busy && !open && setEditing(null)}><DialogContent><DialogHeader><DialogTitle>Edit saved link</DialogTitle><DialogDescription>Update the title, description, or local image. The URL stays unchanged.</DialogDescription></DialogHeader><form onSubmit={save} className="space-y-4"><Input aria-label="Title" value={title} onChange={(event) => setTitle(event.target.value)} /><Textarea aria-label="Description" value={description} onChange={(event) => setDescription(event.target.value)} rows={5} /><Input aria-label="Image" type="file" accept="image/jpeg,image/png,image/gif,image/webp" onChange={(event) => setImage(event.target.files?.[0])} /><DialogFooter><Button type="button" variant="outline" disabled={busy} onClick={() => setEditing(null)}>Cancel</Button><Button type="submit" disabled={busy}>{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save changes</Button></DialogFooter></form></DialogContent></Dialog>
	</PageShell>;
}
