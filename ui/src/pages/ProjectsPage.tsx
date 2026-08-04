import { useCallback, useEffect, useState } from "react";
import { Clock, FolderOpen, Loader2, Plus, Trash2 } from "lucide-react";
import { workspaceApi, type WorkspaceProject } from "@/ui/api/client";
import { PageContent, PageHeader, PageLoading, PageShell } from "@/ui/components/templates/PageShell";
import { Button } from "@/ui/components/ui/button";
import { Input } from "@/ui/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/ui/components/ui/dialog";

export default function ProjectsPage() {
	const [projects, setProjects] = useState<WorkspaceProject[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [createOpen, setCreateOpen] = useState(false);
	const [projectName, setProjectName] = useState("");
	const [removing, setRemoving] = useState<WorkspaceProject | null>(null);
	const [busy, setBusy] = useState(false);

	const loadProjects = useCallback(async () => {
		setError(null);
		try {
			setProjects(await workspaceApi.list());
		} catch {
			setError("Projects could not be loaded.");
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => { void loadProjects(); }, [loadProjects]);

	const createProject = async (event: React.FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		setBusy(true);
		setError(null);
		try {
			await workspaceApi.create({ name: projectName.trim() });
			setProjectName("");
			setCreateOpen(false);
			await loadProjects();
		} catch {
			setError("Project could not be added. Check the project name and local path.");
		} finally {
			setBusy(false);
		}
	};

	const removeProject = async () => {
		if (!removing) return;
		setBusy(true);
		setError(null);
		try {
			await workspaceApi.remove(removing.id);
			setRemoving(null);
			await loadProjects();
		} catch {
			setError("Project could not be removed.");
		} finally {
			setBusy(false);
		}
	};

	return (
		<PageShell>
			<PageHeader
				size="full"
				title="Projects"
				description="All workspace projects available in your shared Know-Me store."
				context="Workspace registry"
				status={<span className="tabular-nums">{projects.length} {projects.length === 1 ? "project" : "projects"}</span>}
				actions={<Button onClick={() => setCreateOpen(true)}><Plus className="mr-2 h-4 w-4" />Add project</Button>}
			/>
			<PageContent size="full">
				{loading ? (
					<PageLoading label="Loading projects" />
				) : error ? (
					<div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
						{error}
					</div>
				) : projects.length === 0 ? (
					<div className="rounded-lg border border-dashed px-6 py-12 text-center text-sm text-muted-foreground">
						No saved projects yet.
					</div>
				) : (
					<div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
						{projects.map((project) => (
							<article key={project.id} className="rounded-lg border border-border bg-transparent p-4">
								<div className="flex items-start gap-3">
									<FolderOpen className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
									<div className="min-w-0">
										<h2 className="truncate font-medium">{project.name}</h2>
									</div>
								</div>
								<div className="mt-4 flex items-center justify-between gap-2 text-xs text-muted-foreground">
									<span className="truncate font-mono" title={project.id}>#{project.id}</span>
									<div className="flex shrink-0 items-center gap-2">
										<span className="flex items-center gap-1"><Clock className="h-3 w-3" />{new Date(project.lastUsed).toLocaleString()}</span>
										<Button variant="ghost" size="sm" className="h-7 px-2 text-destructive hover:text-destructive" onClick={() => setRemoving(project)}><Trash2 className="mr-1 h-3.5 w-3.5" />Remove</Button>
									</div>
								</div>
							</article>
						))}
					</div>
				)}
			</PageContent>

			<Dialog open={createOpen} onOpenChange={(open) => !busy && setCreateOpen(open)}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Add project</DialogTitle>
					<DialogDescription>A project name is all that is needed.</DialogDescription>
					</DialogHeader>
					<form onSubmit={createProject} className="space-y-4">
						<Input autoFocus required value={projectName} onChange={(event) => setProjectName(event.target.value)} placeholder="Project name" />
						<DialogFooter>
							<Button type="button" variant="outline" onClick={() => setCreateOpen(false)} disabled={busy}>Cancel</Button>
							<Button type="submit" disabled={busy || !projectName.trim()}>{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Add project</Button>
						</DialogFooter>
					</form>
				</DialogContent>
			</Dialog>

			<Dialog open={removing !== null} onOpenChange={(open) => !open && !busy && setRemoving(null)}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Remove {removing?.name}?</DialogTitle>
						<DialogDescription>This removes only the project from the shared registry. Its files and Know-Me data stay on disk.</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<Button variant="outline" onClick={() => setRemoving(null)} disabled={busy}>Cancel</Button>
						<Button variant="destructive" onClick={() => void removeProject()} disabled={busy}>{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Remove project</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</PageShell>
	);
}
