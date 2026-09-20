import { useCallback } from "react";
import { toast } from "sonner";
import { uploadAsset } from "@/ui/api/client";

/**
 * Extracts the first image File from clipboard data if present.
 */
export function extractImageFromClipboard(
	event: ClipboardEvent | React.ClipboardEvent,
): File | null {
	const files = event.clipboardData?.files;
	if (files && files.length > 0) {
		for (let i = 0; i < files.length; i++) {
			if (files[i].type.startsWith("image/")) {
				return files[i];
			}
		}
	}

	const items = event.clipboardData?.items;
	if (items && items.length > 0) {
		for (let i = 0; i < items.length; i++) {
			if (items[i].type.startsWith("image/")) {
				const file = items[i].getAsFile();
				if (file) return file;
			}
		}
	}

	return null;
}

/**
 * Handles image paste into a HTML textarea, uploading it to /api/assets and
 * inserting markdown image syntax at the current cursor position.
 */
export async function handleTextareaImagePaste(
	event: React.ClipboardEvent<HTMLTextAreaElement>,
	onChange: (value: string) => void,
): Promise<boolean> {
	const imageFile = extractImageFromClipboard(event);
	if (!imageFile) return false;

	event.preventDefault();

	const target = event.currentTarget;
	const start = target.selectionStart ?? target.value.length;
	const end = target.selectionEnd ?? target.value.length;
	const currentValue = target.value;

	const toastId = toast.loading(`Uploading ${imageFile.name || "image"}...`);

	try {
		const asset = await uploadAsset(imageFile);
		toast.success("Image uploaded", { id: toastId });

		const markdownImage = `![${asset.name || "image"}](${asset.url})`;
		const prefix = currentValue.slice(0, start);
		const suffix = currentValue.slice(end);

		const needsLeadingNewline = prefix.length > 0 && !prefix.endsWith("\n");
		const needsTrailingNewline = suffix.length > 0 && !suffix.startsWith("\n");

		const insertText = `${needsLeadingNewline ? "\n" : ""}${markdownImage}${needsTrailingNewline ? "\n" : ""}`;
		const nextValue = prefix + insertText + suffix;

		onChange(nextValue);

		requestAnimationFrame(() => {
			const newCursorPos = start + insertText.length;
			target.focus();
			target.setSelectionRange(newCursorPos, newCursorPos);
		});

		return true;
	} catch (err) {
		const msg = err instanceof Error ? err.message : "Failed to upload image";
		toast.error(msg, { id: toastId });
		return false;
	}
}

/**
 * Hook to provide onPaste handler for Markdown textareas.
 */
export function useImagePaste({
	onChange,
	disabled = false,
}: {
	onChange: (value: string) => void;
	disabled?: boolean;
}) {
	const onPaste = useCallback(
		async (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
			if (disabled) return;
			await handleTextareaImagePaste(event, onChange);
		},
		[disabled, onChange],
	);

	return { onPaste };
}
