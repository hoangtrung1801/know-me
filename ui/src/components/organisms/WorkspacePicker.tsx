import { useCallback, useEffect, useState } from "react";
import { ArrowRightLeft, Loader2, Trash2 } from "lucide-react";
import { workspaceApi, type WorkspaceProject } from "@/ui/api/client";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/ui/components/ui/dialog";

interface WorkspacePickerProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onSwitched?: () => void;
}

export function WorkspacePicker({ open, onOpenChange, onSwitched }: WorkspacePickerProps) {
	const [projects, setProjects] = useState<WorkspaceProject[]>([]);
	const [switching, setSwitching] = useState<string | null>(null);

	const load = useCallback(() => workspaceApi.list().then(setProjects).catch(() => setProjects([])), []);
	useEffect(() => { if (open) void load(); }, [load, open]);

	const select = async (id: string) => {
		setSwitching(id);
		try {
			await workspaceApi.switchProject(id);
			onOpenChange(false);
			onSwitched?.();
		} finally { setSwitching(null); }
	};

	const remove = async (id: string) => {
		await workspaceApi.remove(id);
		setProjects(projects => projects.filter(project => project.id !== id));
	};

	return <Dialog open={open} onOpenChange={onOpenChange}>
		<DialogContent className="sm:max-w-lg">
			<DialogHeader>
				<DialogTitle className="flex items-center gap-2"><ArrowRightLeft className="h-5 w-5" /> Select project</DialogTitle>
				<DialogDescription>Projects organize records; they are not folders.</DialogDescription>
			</DialogHeader>
			<div className="max-h-72 space-y-1 overflow-y-auto">
				{projects.length === 0 ? <p className="py-8 text-center text-sm text-muted-foreground">No projects yet. Create one from the Projects page.</p> : projects.map(project =>
					<div key={project.id} className="flex items-center gap-2 rounded-lg border px-3 py-2 hover:bg-accent/50">
						<button type="button" className="min-w-0 flex-1 text-left" onClick={() => void select(project.id)}>
							<div className="truncate text-sm font-medium">{project.name}</div>
						</button>
						{switching === project.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <button type="button" className="p-1 text-muted-foreground hover:text-destructive" onClick={() => void remove(project.id)} aria-label={`Remove ${project.name}`}><Trash2 className="h-4 w-4" /></button>}
					</div>
				)}
			</div>
		</DialogContent>
	</Dialog>;
}
