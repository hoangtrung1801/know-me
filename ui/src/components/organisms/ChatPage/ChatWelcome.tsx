import type { ChatComposerFile } from "../../../models/chat";

const suggestions = [
	{ label: "Understand the project architecture", prompt: "Using kn-research for project architecture. Search the docs, related tasks, and source code to explain the overall architecture of this project." },
	{ label: "Map the main product flows", prompt: "Using kn-research for product flows. Search the docs, related tasks, and source code to map the main user flows, routes, and key pages in this project." },
	{ label: "Find existing patterns", prompt: "Using kn-research for implementation patterns. Search the docs, related tasks, and codebase to find reusable patterns, conventions, and components for this project." },
	{ label: "Review AI integration", prompt: "Using kn-research for chat and AI integration. Search the docs, related tasks, and codebase to explain how chat, OpenCode, and model management are implemented in this project." },
];

interface ChatWelcomeProps {
	onSend: (message: string, files?: ChatComposerFile[]) => void;
}

export function ChatWelcome({ onSend }: ChatWelcomeProps) {
	return (
		<div className="flex flex-1 flex-col items-center justify-center px-6">
			<div className="w-full max-w-xl space-y-5">
				<p className="text-sm text-muted-foreground">What do you want to work on?</p>
				<div className="space-y-1.5">
					{suggestions.map((s) => (
						<button
							key={s.label}
							type="button"
							onClick={() => onSend(s.prompt)}
							className="flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left text-sm text-foreground/80 transition-colors hover:bg-accent hover:text-foreground"
						>
							{s.label}
							<span className="shrink-0 text-muted-foreground/50">↗</span>
						</button>
					))}
				</div>
			</div>
		</div>
	);
}
