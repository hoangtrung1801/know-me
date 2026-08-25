import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { Crepe } from "@milkdown/crepe";
import { replaceAll } from "@milkdown/kit/utils";
import "@milkdown/crepe/theme/common/style.css";
import "@milkdown/crepe/theme/frame.css";
import { useTheme } from "../../App";

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
				},
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

		return (
			<div
				ref={rootRef}
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
