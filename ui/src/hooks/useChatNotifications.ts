/**
 * Hook to manage chat notifications (badge, sound, title)
 */

import { useEffect, useRef } from "react";
import {
	playNotificationSound,
	setBadgeFavicon,
	setBadgeTitle,
	clearBadge,
	isPageVisible,
	onVisibilityChange,
	setOriginalTitle,
} from "../lib/notifications";

interface UseChatNotificationsOptions {
	/** Active session title for page title */
	sessionTitle?: string;
	/** Number of pending questions */
	pendingQuestions: number;
	/** Number of pending permissions */
	pendingPermissions: number;
	/** Whether chat is currently streaming */
	isStreaming: boolean;
	/** Chat session status */
	status?: "idle" | "streaming" | "done" | "error";
	/** Only the visible retained chat page should own title/badge/notification effects. */
	enabled?: boolean;
}

export function useChatNotifications({
	sessionTitle,
	pendingQuestions,
	pendingPermissions,
	isStreaming,
	status,
	enabled = true,
}: UseChatNotificationsOptions) {
	const prevStreamingRef = useRef(isStreaming);
	const prevPendingQuestionsRef = useRef(pendingQuestions);
	const prevPendingPermissionsRef = useRef(pendingPermissions);
	const hasPlayedAttentionSoundRef = useRef(false);
	const hasPlayedDoneSoundRef = useRef(false);

	// Update page title
	useEffect(() => {
		if (!enabled) return;
		const title = sessionTitle ? `${sessionTitle} - Know-Me` : "Know-Me";
		setOriginalTitle(title);
	}, [enabled, sessionTitle]);

	// Handle streaming state changes
	useEffect(() => {
		const wasStreaming = prevStreamingRef.current;
		const nowStreaming = isStreaming;
		if (!enabled) {
			prevStreamingRef.current = nowStreaming;
			return;
		}

		// Just finished streaming
		if (wasStreaming && !nowStreaming && status === "done") {
			// Don't play done sound if there are pending questions/permissions
			if (pendingQuestions === 0 && pendingPermissions === 0 && !hasPlayedDoneSoundRef.current) {
				// Only play if page is not visible
				if (!isPageVisible()) {
					playNotificationSound("success");
					setBadgeFavicon();
					setBadgeTitle("✓ Done");
				}
				hasPlayedDoneSoundRef.current = true;
			}
		}

		// Started streaming - reset done sound flag
		if (!wasStreaming && nowStreaming) {
			hasPlayedDoneSoundRef.current = false;
		}

		prevStreamingRef.current = nowStreaming;
	}, [enabled, isStreaming, status, pendingQuestions, pendingPermissions]);

	// Handle pending questions/permissions
	useEffect(() => {
		const totalPending = pendingQuestions + pendingPermissions;
		const prevTotalPending = prevPendingQuestionsRef.current + prevPendingPermissionsRef.current;
		if (!enabled) {
			prevPendingQuestionsRef.current = pendingQuestions;
			prevPendingPermissionsRef.current = pendingPermissions;
			return;
		}

		// New pending item appeared
		if (totalPending > prevTotalPending && !hasPlayedAttentionSoundRef.current) {
			// Only notify if page is not visible
			if (!isPageVisible()) {
				playNotificationSound("attention");
				hasPlayedAttentionSoundRef.current = true;
			}
		}

		// Update badge
		if (totalPending > 0) {
			const messages: string[] = [];
			if (pendingQuestions > 0) {
				messages.push(`${pendingQuestions} question${pendingQuestions > 1 ? "s" : ""}`);
			}
			if (pendingPermissions > 0) {
				messages.push(`${pendingPermissions} permission${pendingPermissions > 1 ? "s" : ""}`);
			}
			
			setBadgeFavicon(totalPending);
			setBadgeTitle(messages.join(", "));
		} else {
			// Reset attention sound flag when all pending items are cleared
			if (prevTotalPending > 0) {
				hasPlayedAttentionSoundRef.current = false;
			}
			clearBadge();
		}

		prevPendingQuestionsRef.current = pendingQuestions;
		prevPendingPermissionsRef.current = pendingPermissions;
	}, [enabled, pendingQuestions, pendingPermissions]);

	// Clear badge when page becomes visible
	useEffect(() => {
		if (!enabled) return;
		const cleanup = onVisibilityChange((visible) => {
			if (visible) {
				// Page is now visible, clear badge if no pending items
				const totalPending = pendingQuestions + pendingPermissions;
				if (totalPending === 0) {
					clearBadge();
				}
				// Reset sound flags when page becomes visible
				hasPlayedAttentionSoundRef.current = false;
				hasPlayedDoneSoundRef.current = false;
			}
		});

		return cleanup;
	}, [enabled, pendingQuestions, pendingPermissions]);

	// Cleanup on unmount
	useEffect(() => {
		return () => {
			clearBadge();
		};
	}, []);
}
