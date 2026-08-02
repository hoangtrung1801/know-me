import { useEffect, useState } from "react";
import { Clock, FolderOpen } from "lucide-react";
import { workspaceApi, type WorkspaceProject } from "@/ui/api/client";
import { PageContent, PageHeader, PageLoading, PageShell } from "@/ui/components/templates/PageShell";

export default function ProjectsPage() {
	const [projects, setProjects] = useState<WorkspaceProject[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		void workspaceApi.list()
			.then(setProjects)
			.catch(() => setError("Projects could not be loaded."))
			.finally(() => setLoading(false));
	}, []);

	return (
		<PageShell>
			<PageHeader
				title="Projects"
				description="All workspace projects available in your shared Knowns store."
				context="Workspace registry"
				status={<span className="tabular-nums">{projects.length} {projects.length === 1 ? "project" : "projects"}</span>}
			/>
			<PageContent>
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
							<article key={project.id} className="rounded-lg border bg-card p-4">
								<div className="flex items-start gap-3">
									<FolderOpen className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
									<div className="min-w-0">
										<h2 className="truncate font-medium">{project.name}</h2>
										<p className="mt-1 truncate text-xs text-muted-foreground" title={project.path}>{project.path}</p>
									</div>
								</div>
								<div className="mt-4 flex items-center justify-between gap-2 text-xs text-muted-foreground">
									<span className="truncate font-mono" title={project.id}>#{project.id}</span>
									<span className="flex shrink-0 items-center gap-1"><Clock className="h-3 w-3" />{new Date(project.lastUsed).toLocaleString()}</span>
								</div>
							</article>
						))}
					</div>
				)}
			</PageContent>
		</PageShell>
	);
}
