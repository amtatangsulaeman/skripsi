"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useEffect } from "react";

function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Plain text (paragraphs separated by blank lines) → TipTap HTML. */
export function textToHtml(text: string): string {
  if (!text) return "<p></p>";
  return text
    .split(/\n{2,}/)
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

/**
 * TipTap-based editor for document text. Stored content is plain text (used by similarity and AI tools),
 * so only structural nodes (paragraphs, line breaks, undo history) are enabled — no formatting that would be lost on save.
 */
export function PlainEditor({ value, onChange }: { value: string; onChange: (text: string) => void }) {
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        bold: false,
        italic: false,
        strike: false,
        code: false,
        codeBlock: false,
        heading: false,
        blockquote: false,
        bulletList: false,
        orderedList: false,
        listItem: false,
        horizontalRule: false,
        link: false,
        underline: false,
      }),
    ],
    content: textToHtml(value),
    editorProps: {
      attributes: { class: "tm-prose min-h-[24rem] px-4 py-3 text-sm", "aria-label": "Editor dokumen" },
    },
    onUpdate: ({ editor }) => onChange(editor.getText({ blockSeparator: "\n\n" })),
  });

  // Sync when the value is replaced from outside (e.g. restoring a version).
  useEffect(() => {
    if (!editor) return;
    const current = editor.getText({ blockSeparator: "\n\n" });
    if (current !== value) editor.commands.setContent(textToHtml(value), { emitUpdate: false });
  }, [value, editor]);

  return (
    <div className="rounded-lg border border-input bg-background focus-within:ring-2 focus-within:ring-ring">
      <EditorContent editor={editor} />
    </div>
  );
}
