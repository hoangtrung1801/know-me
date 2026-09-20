import { describe, expect, it, mock } from "bun:test";
import { extractImageFromClipboard, handleTextareaImagePaste } from "./imagePasteUtils";

describe("extractImageFromClipboard", () => {
	it("returns image file from clipboardData.files", () => {
		const fakeFile = new File(["fake png"], "test.png", { type: "image/png" });
		const event = {
			clipboardData: {
				files: [fakeFile],
				items: [],
			},
		} as unknown as ClipboardEvent;

		const result = extractImageFromClipboard(event);
		expect(result).toBe(fakeFile);
	});

	it("returns image file from clipboardData.items when files is empty", () => {
		const fakeFile = new File(["fake jpeg"], "test.jpg", { type: "image/jpeg" });
		const fakeItem = {
			type: "image/jpeg",
			getAsFile: () => fakeFile,
		};
		const event = {
			clipboardData: {
				files: [],
				items: [fakeItem],
			},
		} as unknown as ClipboardEvent;

		const result = extractImageFromClipboard(event);
		expect(result).toBe(fakeFile);
	});

	it("returns null when no image is in files or items", () => {
		const textFile = new File(["hello world"], "notes.txt", { type: "text/plain" });
		const textItem = {
			type: "text/plain",
			getAsFile: () => textFile,
		};
		const event = {
			clipboardData: {
				files: [textFile],
				items: [textItem],
			},
		} as unknown as ClipboardEvent;

		const result = extractImageFromClipboard(event);
		expect(result).toBeNull();
	});

	it("returns null when clipboardData is undefined", () => {
		const event = {} as ClipboardEvent;
		expect(extractImageFromClipboard(event)).toBeNull();
	});
});

describe("handleTextareaImagePaste", () => {
	it("returns false and does not alter value when clipboard contains no images", async () => {
		const event = {
			clipboardData: {
				files: [],
				items: [],
			},
			preventDefault: mock(() => {}),
			currentTarget: {
				value: "Existing text",
				selectionStart: 13,
				selectionEnd: 13,
				focus: mock(() => {}),
				setSelectionRange: mock(() => {}),
			},
		} as unknown as React.ClipboardEvent<HTMLTextAreaElement>;

		const onChange = mock((_val: string) => {});
		const handled = await handleTextareaImagePaste(event, onChange);

		expect(handled).toBe(false);
		expect(event.preventDefault).not.toHaveBeenCalled();
		expect(onChange).not.toHaveBeenCalled();
	});
});
