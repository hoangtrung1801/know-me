import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { Crepe } from "@milkdown/crepe";
import { replaceAll } from "@milkdown/kit/utils";
import { uploadConfig } from "@milkdown/plugin-upload";
import { toast } from "sonner";
import "@milkdown/crepe/theme/common/style.css";
import "@milkdown/crepe/theme/frame.css";
import { useTheme } from "../../App";
import { uploadAsset, API_BASE } from "../../api/client";

interface MDEditorComponentProps {
	markdown: string;
	onChange: (markdown: string) => void;
	placeholder?: string;
	readOnly?: boolean;
	className?: string;
	height?: number | string;
	ariaLabel?: string;
	/** Kept for compatibility; Milkdown always renders one WYSIWYG surface. */
	preview?: "edit" | "live" | "preview";
}

export interface MDEditorRef {
	setMarkdown: (md: string) => void;
	getMarkdown: () => string;
}

const MDEditorComponent = forwardRef<MDEditorRef, MDEditorComponentProps>(
	(
		{
			markdown,
			onChange,
			placeholder = "Write your content here...",
			readOnly = false,
			className = "",
			height = 400,
			ariaLabel = "Live Markdown editor",
			preview,
		},
		ref,
	) => {
		const { isDark } = useTheme();
		const rootRef = useRef<HTMLDivElement>(null);
		const editorRef = useRef<Crepe | null>(null);
		const markdownRef = useRef(markdown);
		const onChangeRef = useRef(onChange);
		const readOnlyRef = useRef(readOnly || preview === "preview");
		const pendingSyncRef = useRef<string | null>(null);

		markdownRef.current = markdown;
		onChangeRef.current = onChange;
		readOnlyRef.current = readOnly || preview === "preview";

		useEffect(() => {
			if (!rootRef.current) return;

			let disposed = false;
			let created = false;
			const editor = new Crepe({
				root: rootRef.current,
				defaultValue: markdownRef.current,
				featureConfigs: {
					[Crepe.Feature.Placeholder]: { text: placeholder, mode: "block" },
					[Crepe.Feature.ImageBlock]: {
						proxyDomURL: (url: string) =>
							url.startsWith("/api/") && API_BASE ? `${API_BASE}${url}` : url,
						onUpload: async (file: File) => {
							const toastId = toast.loading(`Uploading ${file.name || "image"}...`);
							try {
								const asset = await uploadAsset(file);
								toast.success("Image uploaded", { id: toastId });
								return asset.url;
							} catch (err) {
								const msg = err instanceof Error ? err.message : "Failed to upload image";
								toast.error(msg, { id: toastId });
								throw err;
							}
						},
					},
				},
			});

			editor.editor.config((ctx) => {
				ctx.update(uploadConfig.key, (prev) => ({
					...prev,
					enableHtmlFileUploader: true,
				}));
			});

			editor.on((listener) => {
				listener.markdownUpdated((_ctx, value) => {
					if (pendingSyncRef.current === value) {
						pendingSyncRef.current = null;
						return;
					}
					pendingSyncRef.current = null;
					onChangeRef.current(value);
				});
			});

			void editor.create().then(() => {
				created = true;
				if (disposed) {
					void editor.destroy();
					return;
				}

				editorRef.current = editor;
				editor.setReadonly(readOnlyRef.current);
				if (editor.getMarkdown() !== markdownRef.current) {
					pendingSyncRef.current = markdownRef.current;
					editor.editor.action(replaceAll(markdownRef.current));
				}
			});

			return () => {
				disposed = true;
				if (editorRef.current === editor) editorRef.current = null;
				if (created) void editor.destroy();
			};
		}, [placeholder]);

		useEffect(() => {
			editorRef.current?.setReadonly(readOnly || preview === "preview");
		}, [preview, readOnly]);

		useEffect(() => {
			const editor = editorRef.current;
			if (!editor || editor.getMarkdown() === markdown) return;

			pendingSyncRef.current = markdown;
			editor.editor.action(replaceAll(markdown));
		}, [markdown]);

		useImperativeHandle(
			ref,
			() => ({
				setMarkdown: (value: string) => onChangeRef.current(value),
				getMarkdown: () => editorRef.current?.getMarkdown() ?? markdownRef.current,
			}),
			[],
		);

		const isFullHeight = height === "100%" || height === "full";
		const editorStyle = {
			height: isFullHeight ? "100%" : typeof height === "number" ? `${height}px` : height,
		};
		const handlePaste = async (event: React.ClipboardEvent<HTMLDivElement>) => {
			if (readOnlyRef.current || event.defaultPrevented) return;
			const files = event.clipboardData?.files;
			const items = event.clipboardData?.items;
			let imageFile: File | null = null;
			if (files && files.length > 0) {
				for (let i = 0; i < files.length; i++) {
					if (files[i].type.startsWith("image/")) {
						imageFile = files[i];
						break;
					}
				}
			}
			if (!imageFile && items) {
				for (let i = 0; i < items.length; i++) {
					if (items[i].type.startsWith("image/")) {
						imageFile = items[i].getAsFile();
						if (imageFile) break;
					}
				}
			}
			if (!imageFile) return;

			event.preventDefault();
			const toastId = toast.loading(`Uploading ${imageFile.name || "image"}...`);
			try {
				const asset = await uploadAsset(imageFile);
				toast.success("Image uploaded", { id: toastId });
				const imageMd = `\n\n![${asset.name || "image"}](${asset.url})\n\n`;
				const current = editorRef.current?.getMarkdown() ?? markdownRef.current;
				const updated = current + imageMd;
				if (editorRef.current) {
					pendingSyncRef.current = updated;
					editorRef.current.editor.action(replaceAll(updated));
				}
				onChangeRef.current(updated);
			} catch (err) {
				const msg = err instanceof Error ? err.message : "Failed to upload image";
				toast.error(msg, { id: toastId });
			}
		};

		return (
			<div
				ref={rootRef}
				onPaste={handlePaste}
				className={`milkdown-editor-wrapper ${className} ${isDark ? "dark-mode" : ""} ${isFullHeight ? "h-full" : ""}`}
				data-color-mode={isDark ? "dark" : "light"}
				data-editor-readonly={readOnly || preview === "preview" ? "true" : "false"}
				role="region"
				aria-label={readOnly || preview === "preview" ? "Document preview" : ariaLabel}
				style={editorStyle}
			/>
		);
	},
);

MDEditorComponent.displayName = "MDEditor";

export default MDEditorComponent;
