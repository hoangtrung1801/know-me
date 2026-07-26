/**
 * Browser notification utilities for tab badges and audio alerts
 */

// Sound notification using Web Audio API
export function playNotificationSound(type: "success" | "attention" = "attention") {
	try {
		const ctx = new AudioContext();
		const osc = ctx.createOscillator();
		const gain = ctx.createGain();
		osc.connect(gain);
		gain.connect(ctx.destination);

		if (type === "success") {
			// Success: Two-tone chime (C5 -> E5)
			osc.frequency.value = 523; // C5
			gain.gain.setValueAtTime(0.2, ctx.currentTime);
			gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
			osc.start(ctx.currentTime);
			osc.stop(ctx.currentTime + 0.15);

			// Second tone
			const osc2 = ctx.createOscillator();
			const gain2 = ctx.createGain();
			osc2.connect(gain2);
			gain2.connect(ctx.destination);
			osc2.frequency.value = 659; // E5
			gain2.gain.setValueAtTime(0.2, ctx.currentTime + 0.15);
			gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
			osc2.start(ctx.currentTime + 0.15);
			osc2.stop(ctx.currentTime + 0.35);
		} else {
			// Attention: Single tone (A5)
			osc.frequency.value = 880; // A5
			gain.gain.setValueAtTime(0.15, ctx.currentTime);
			gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
			osc.start(ctx.currentTime);
			osc.stop(ctx.currentTime + 0.3);
		}
	} catch {
		// Audio not available or blocked
	}
}

// Update page title with badge
let originalTitle = document.title;

export function setBadgeTitle(message?: string) {
	if (message) {
		document.title = `${message} • ${originalTitle}`;
	} else {
		document.title = originalTitle;
	}
}

export function setOriginalTitle(title: string) {
	originalTitle = title;
	document.title = title;
}

// Create favicon with badge
function createBadgedFavicon(count?: number): string {
	const canvas = document.createElement("canvas");
	canvas.width = 32;
	canvas.height = 32;
	const ctx = canvas.getContext("2d");
	if (!ctx) return "";

	// Load original favicon
	const img = new Image();
	img.crossOrigin = "anonymous";
	
	return new Promise<string>((resolve) => {
		img.onload = () => {
			// Draw original favicon
			ctx.drawImage(img, 0, 0, 32, 32);

			if (count !== undefined) {
				// Draw red badge circle
				ctx.fillStyle = "#ef4444";
				const badgeSize = count > 9 ? 20 : 16;
				ctx.beginPath();
				ctx.arc(28, 4, badgeSize / 2, 0, 2 * Math.PI);
				ctx.fill();

				// Draw white count text
				ctx.fillStyle = "#ffffff";
				ctx.font = "bold 14px Arial";
				ctx.textAlign = "center";
				ctx.textBaseline = "middle";
				const text = count > 99 ? "99+" : count > 9 ? count.toString() : count.toString();
				ctx.fillText(text, 28, count > 9 ? 4 : 5);
			} else {
				// Draw red dot (no count)
				ctx.fillStyle = "#ef4444";
				ctx.beginPath();
				ctx.arc(26, 6, 6, 0, 2 * Math.PI);
				ctx.fill();
			}

			resolve(canvas.toDataURL("image/png"));
		};

		img.onerror = () => {
			// Fallback: create simple colored circle
			ctx.fillStyle = "#6366f1"; // primary color
			ctx.beginPath();
			ctx.arc(16, 16, 14, 0, 2 * Math.PI);
			ctx.fill();

			if (count !== undefined) {
				ctx.fillStyle = "#ef4444";
				const badgeSize = count > 9 ? 20 : 16;
				ctx.beginPath();
				ctx.arc(28, 4, badgeSize / 2, 0, 2 * Math.PI);
				ctx.fill();

				ctx.fillStyle = "#ffffff";
				ctx.font = "bold 14px Arial";
				ctx.textAlign = "center";
				ctx.textBaseline = "middle";
				const text = count > 99 ? "99+" : count.toString();
				ctx.fillText(text, 28, count > 9 ? 4 : 5);
			} else {
				ctx.fillStyle = "#ef4444";
				ctx.beginPath();
				ctx.arc(26, 6, 6, 0, 2 * Math.PI);
				ctx.fill();
			}

			resolve(canvas.toDataURL("image/png"));
		};

		img.src = "/favicon-32.png";
	}) as unknown as string;
}

// Update favicon
export async function setBadgeFavicon(count?: number) {
	try {
		const badgedIcon = await createBadgedFavicon(count);
		
		// Update all favicon links
		const links = document.querySelectorAll<HTMLLinkElement>("link[rel*='icon']");
		links.forEach((link) => {
			link.href = badgedIcon;
		});
	} catch (error) {
		console.error("Failed to set badged favicon:", error);
	}
}

// Clear badge
export function clearBadge() {
	setBadgeTitle();
	
	// Restore original favicons
	const links = document.querySelectorAll<HTMLLinkElement>("link[rel*='icon']");
	links.forEach((link) => {
		if (link.sizes.toString().includes("32")) {
			link.href = "/favicon-32.png";
		} else if (link.sizes.toString().includes("16")) {
			link.href = "/favicon-16.png";
		}
	});
}

// Check if page is visible
export function isPageVisible(): boolean {
	return document.visibilityState === "visible";
}

// Listen for visibility changes
export function onVisibilityChange(callback: (visible: boolean) => void): () => void {
	const handler = () => {
		callback(document.visibilityState === "visible");
	};
	document.addEventListener("visibilitychange", handler);
	return () => document.removeEventListener("visibilitychange", handler);
}
