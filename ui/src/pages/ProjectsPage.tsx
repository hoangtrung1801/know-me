import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Clock, Edit2, ExternalLink, FolderGit2, FolderOpen, Loader2, Plus, Trash2 } from "lucide-react";
import { workspaceApi, type WorkspaceProject } from "@/ui/api/client";
import { PageContent, PageHeader, PageLoading, PageShell } from "@/ui/components/templates/PageShell";
import { Button } from "@/ui/components/ui/button";
import { Input } from "@/ui/components/ui/input";
import { Label } from "@/ui/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/ui/components/ui/dialog";
import { usePageLifecycle, usePersistentPageState } from "@/ui/contexts/PageWorkspaceContext";

export default function ProjectsPage() {
	const { activationId, isActive, isHydrated } = usePageLifecycle("projects");
	const [projects, setProjects] = useState<WorkspaceProject[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	// Create dialog state
	const [createOpen, setCreateOpen] = usePersistentPageState("projects", "createOpen", false);
	const [projectName, setProjectName] = usePersistentPageState("projects", "projectName", "");
	const [projectPath, setProjectPath] = usePersistentPageState("projects", "projectPath", "");

	// Edit / Detail dialog state
	const [editingProject, setEditingProject] = useState<WorkspaceProject | null>(null);
	const [editName, setEditName] = useState("");
	const [editPath, setEditPath] = useState("");

	const [removing, setRemoving] = useState<WorkspaceProject | null>(null);
	const [busy, setBusy] = useState(false);
	const isActiveRef = useRef(isActive);
	isActiveRef.current = isActive;

	const loadProjects = useCallback(async () => {
		if (!isActiveRef.current) return;
		setError(null);
		try {
			const nextProjects = await workspaceApi.list();
			if (isActiveRef.current) setProjects(nextProjects);
		} catch {
			if (isActiveRef.current) setError("Projects could not be loaded.");
		} finally {
			if (isActiveRef.current) setLoading(false);
		}
	}, []);

	useEffect(() => {
		if (!isHydrated || !isActiveRef.current) return;
		void loadProjects();
	}, [activationId, isHydrated, loadProjects]);

	const createProject = async (event: React.FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		setBusy(true);
		setError(null);
		try {
			await workspaceApi.create({
				name: projectName.trim(),
				path: projectPath.trim() || undefined,
			});
			setProjectName("");
			setProjectPath("");
			setCreateOpen(false);
			await loadProjects();
		} catch {
			setError("Project could not be added. Check the project name and local path.");
		} finally {
			setBusy(false);
		}
	};

	const openEditProject = (project: WorkspaceProject) => {
		setEditingProject(project);
		setEditName(project.name);
		setEditPath(project.path || "");
	};

	const updateProject = async (event: React.FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		if (!editingProject) return;
		setBusy(true);
		setError(null);
		try {
			await workspaceApi.update(editingProject.id, {
				name: editName.trim(),
				path: editPath.trim(),
			});
			setEditingProject(null);
			await loadProjects();
		} catch {
			setError("Project could not be updated. Please check the workspace path.");
		} finally {
			setBusy(false);
		}
	};

	const switchActiveProject = async (id: string) => {
		try {
			await workspaceApi.switchProject(id);
			window.location.reload();
		} catch {
			setError("Could not switch to project.");
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
				description="Manage all workspace projects and their local repository paths for background coding agents."
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
					<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
						{projects.map((project) => (
							<article
								key={project.id}
								className="group relative flex flex-col justify-between rounded-xl border border-border bg-card/60 p-4 transition-all hover:border-primary/40 hover:shadow-sm"
							>
								<div>
									<div className="flex items-start justify-between gap-3">
										<div className="flex items-center gap-2.5 min-w-0">
											<div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border bg-muted/60 text-muted-foreground">
												<FolderOpen className="h-4 w-4" />
											</div>
											<div className="min-w-0">
												<h2 className="truncate font-semibold text-foreground text-sm">{project.name}</h2>
												<span className="truncate font-mono text-[11px] text-muted-foreground">#{project.id}</span>
											</div>
										</div>
										<Button
											variant="ghost"
											size="sm"
											className="h-8 px-2.5 text-xs text-muted-foreground hover:text-foreground"
											onClick={() => openEditProject(project)}
											title="Edit project details and workspace path"
										>
											<Edit2 className="mr-1 h-3.5 w-3.5" />Edit
										</Button>
									</div>

									{/* Workspace path display */}
									<div className="mt-3.5 rounded-md border border-border/50 bg-muted/30 px-2.5 py-1.5">
										<div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
											<FolderGit2 className="h-3 w-3 shrink-0" />
											<span>Workspace Path:</span>
										</div>
										<p className="mt-0.5 truncate font-mono text-xs text-foreground/90" title={project.path || "No workspace path configured"}>
											{project.path || <span className="italic text-muted-foreground">Not set (auto-detects from git)</span>}
										</p>
									</div>
								</div>

								<div className="mt-4 flex items-center justify-between border-t border-border/40 pt-3 text-xs text-muted-foreground">
									<span className="flex items-center gap-1">
										<Clock className="h-3 w-3" />
										{new Date(project.lastUsed).toLocaleDateString()}
									</span>
									<div className="flex items-center gap-1">
										<Button
											variant="secondary"
											size="sm"
											className="h-7 text-xs"
											onClick={() => void switchActiveProject(project.id)}
											title="Switch active workspace to this project"
										>
											<ExternalLink className="mr-1 h-3 w-3" />Open
										</Button>
										<Button
											variant="ghost"
											size="sm"
											className="h-7 px-2 text-destructive hover:text-destructive"
											onClick={() => setRemoving(project)}
										>
											<Trash2 className="h-3.5 w-3.5" />
										</Button>
									</div>
								</div>
							</article>
						))}
					</div>
				)}
			</PageContent>

			{/* Create Project Dialog */}
			<Dialog open={createOpen} onOpenChange={(open) => !busy && setCreateOpen(open)}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Add Project</DialogTitle>
						<DialogDescription>
							Create a new project workspace and specify the local directory on your machine for background coding agents.
						</DialogDescription>
					</DialogHeader>
					<form onSubmit={createProject} className="space-y-4">
						<div className="space-y-2">
							<Label htmlFor="create-project-name">Project Name</Label>
							<Input
								id="create-project-name"
								autoFocus
								required
								value={projectName}
								onChange={(event) => setProjectName(event.target.value)}
								placeholder="e.g. My Awesome App"
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="create-project-path">Workspace Path (Local Directory)</Label>
							<Input
								id="create-project-path"
								value={projectPath}
								onChange={(event) => setProjectPath(event.target.value)}
								placeholder="/Users/username/develpoment/my-app"
							/>
							<p className="text-xs text-muted-foreground">
								Path to the local source code and git repository where OMP will work.
							</p>
						</div>
						<DialogFooter>
							<Button type="button" variant="outline" onClick={() => setCreateOpen(false)} disabled={busy}>
								Cancel
							</Button>
							<Button type="submit" disabled={busy || !projectName.trim()}>
								{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
								Add project
							</Button>
						</DialogFooter>
					</form>
				</DialogContent>
			</Dialog>

			{/* Edit Project Dialog / Detail View */}
			<Dialog open={editingProject !== null} onOpenChange={(open) => !open && !busy && setEditingProject(null)}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Edit Project</DialogTitle>
						<DialogDescription>
							Configure project details and the local working directory on this machine.
						</DialogDescription>
					</DialogHeader>
					<form onSubmit={updateProject} className="space-y-4">
						<div className="space-y-2">
							<Label htmlFor="edit-project-name">Project Name</Label>
							<Input
								id="edit-project-name"
								required
								value={editName}
								onChange={(event) => setEditName(event.target.value)}
								placeholder="Project name"
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="edit-project-path">Workspace Path</Label>
							<Input
								id="edit-project-path"
								value={editPath}
								onChange={(event) => setEditPath(event.target.value)}
								placeholder="/Users/username/code/project"
							/>
							<p className="text-xs text-muted-foreground">
								Absolute path to this project's local code directory. OMP coding agent and task worktrees use this root.
							</p>
						</div>
						<DialogFooter>
							<Button type="button" variant="outline" onClick={() => setEditingProject(null)} disabled={busy}>
								Cancel
							</Button>
							<Button type="submit" disabled={busy || !editName.trim()}>
								{busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
								Save changes
							</Button>
						</DialogFooter>
					</form>
				</DialogContent>
			</Dialog>

			{/* Remove Confirmation Dialog */}
			<Dialog open={removing !== null} onOpenChange={(open) => !open && !busy && setRemoving(null)}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Remove {removing?.name}?</DialogTitle>
						<DialogDescription>
							This removes the project registration from Know-Me. Its local files and git repository on disk remain untouched.
						</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<Button variant="outline" onClick={() => setRemoving(null)} disabled={busy}>
							Cancel
						</Button>
						<Button variant="destructive" onClick={() => void removeProject()} disabled={busy}>
							{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
							Remove project
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</PageShell>
	);
}
