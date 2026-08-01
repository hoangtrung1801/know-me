import { useEffect, useState } from "react";
import { workspaceApi, type WorkspaceProject } from "@/ui/api/client";

export function useWorkspaceProjects() {
	const [projects, setProjects] = useState<WorkspaceProject[]>([]);

	useEffect(() => {
		void workspaceApi.list().then(setProjects).catch(() => setProjects([]));
	}, []);

	return projects;
}

export function latestWorkspaceProjectID(projects: WorkspaceProject[]) {
	return projects.reduce<WorkspaceProject | undefined>((latest, project) =>
		!latest || new Date(project.lastUsed) > new Date(latest.lastUsed) ? project : latest,
	undefined,
	)?.id;
}
