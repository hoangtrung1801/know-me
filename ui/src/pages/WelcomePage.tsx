import { useCallback, useEffect, useState } from "react";
import { FolderOpen, Loader2, Plus } from "lucide-react";
import { workspaceApi, type WorkspaceProject } from "@/ui/api/client";
import { Button } from "@/ui/components/ui/button";
import { ThemeToggle } from "@/ui/components/atoms/ThemeToggle";
import logoImage from "../public/logo.png";

interface WelcomePageProps { onProjectSelected: () => void; }

export function WelcomePage({ onProjectSelected }: WelcomePageProps) {
	const [projects, setProjects] = useState<WorkspaceProject[]>([]);
	const [name, setName] = useState("");
	const [busy, setBusy] = useState(false);
	const [isDark, setIsDark] = useState(() => localStorage.getItem("theme") === "dark");
	const load = useCallback(() => workspaceApi.list().then(setProjects).catch(() => setProjects([])), []);

	useEffect(() => { void load(); }, [load]);
	useEffect(() => { document.documentElement.classList.toggle("dark", isDark); localStorage.setItem("theme", isDark ? "dark" : "light"); }, [isDark]);

	const select = async (id: string) => { setBusy(true); try { await workspaceApi.switchProject(id); onProjectSelected(); } finally { setBusy(false); } };
	const create = async () => {
		if (!name.trim()) return;
		setBusy(true);
		try { const project = await workspaceApi.create({ name: name.trim() }); await select(project.id); } finally { setBusy(false); }
	};

	return <div className="relative flex min-h-screen items-center justify-center bg-background px-6">
		<div className="absolute right-4 top-4"><ThemeToggle isDark={isDark} onToggle={() => setIsDark(value => !value)} size="sm" /></div>
		<div className="w-full max-w-lg space-y-6">
			<div className="space-y-2 text-center"><img src={logoImage} alt="Know-Me" className="mx-auto h-16 w-16 rounded-2xl" /><h1 className="text-3xl font-bold">Know-Me</h1><p className="text-sm text-muted-foreground">Organize your records into projects.</p></div>
			<div className="flex gap-2"><input className="h-10 flex-1 rounded-md border bg-background px-3 text-sm" value={name} onChange={event => setName(event.target.value)} onKeyDown={event => event.key === "Enter" && void create()} placeholder="New project name" /><Button onClick={() => void create()} disabled={busy || !name.trim()}><Plus className="mr-2 h-4 w-4" />Create</Button></div>
			<div className="overflow-hidden rounded-xl border">
				{projects.length === 0 ? <p className="py-10 text-center text-sm text-muted-foreground">No projects yet.</p> : projects.map(project => <button key={project.id} type="button" className="flex w-full items-center gap-3 border-b px-4 py-3 text-left last:border-0 hover:bg-muted/50" disabled={busy} onClick={() => void select(project.id)}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FolderOpen className="h-4 w-4 text-primary" />}<span className="font-medium">{project.name}</span></button>)}
			</div>
		</div>
	</div>;
}
