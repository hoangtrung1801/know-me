import { createContext, useContext } from "react";

import type { ChatSession } from "../models/chat";

export interface SubSessionsStore {
	sessions: ChatSession[];
	getById: (sessionId: string | null | undefined) => ChatSession | null;
	findByParent: (parentSessionId: string | undefined, referenceCreatedAt?: string) => ChatSession | null;
}

const emptyStore: SubSessionsStore = {
	sessions: [],
	getById: () => null,
	findByParent: () => null,
};

export const SubSessionsContext = createContext<SubSessionsStore>(emptyStore);

export function useSubSession(sessionId: string | null | undefined): ChatSession | null {
	return useContext(SubSessionsContext).getById(sessionId);
}
