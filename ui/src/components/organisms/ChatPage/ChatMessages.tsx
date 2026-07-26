import { Loader2 } from "lucide-react";

import { ChatThread } from "../../chat/ChatThread";
import type { ChatComposerFile, ChatSession } from "../../../models/chat";
import { ChatWelcome } from "./ChatWelcome";

interface ChatMessagesProps {
	session: ChatSession;
	loading?: boolean;
	onSend: (message: string, files?: ChatComposerFile[]) => void;
	onSubmitQuestion: (messageId: string, blockId: string, answers: string[][]) => Promise<void> | void;
	onRejectQuestion: (messageId: string, blockId: string) => Promise<void> | void;
	onRevert?: (messageId: string) => void;
	onFork?: (messageId: string) => void;
	onPreviewTask?: (taskId: string) => void;
	onPreviewDoc?: (docPath: string) => void;
	focusedMessageId?: string | null;
}

export function ChatMessages({
	session,
	loading,
	onSend,
	onSubmitQuestion,
	onRejectQuestion,
	onRevert,
	onFork,
	onPreviewTask,
	onPreviewDoc,
	focusedMessageId,
}: ChatMessagesProps) {
	if (loading && session.messages.length === 0) {
		return (
			<div className="flex flex-1 items-center justify-center">
				<Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
			</div>
		);
	}

	if (session.messages.length === 0 && session.status !== "streaming") {
		return <ChatWelcome onSend={onSend} />;
	}

	return (
		<ChatThread
			session={session}
			onSubmitQuestion={onSubmitQuestion}
			onRejectQuestion={onRejectQuestion}
			onRevert={onRevert}
			onFork={onFork}
			onPreviewTask={onPreviewTask}
			onPreviewDoc={onPreviewDoc}
			focusedMessageId={focusedMessageId}
		/>
	);
}
