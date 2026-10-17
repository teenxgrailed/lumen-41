"use client";

import type { Editor } from "@tiptap/core";
import { useEditorState } from "@tiptap/react";

import { cn } from "@/lib/utils";

import { MARK_COLORS } from "./marks";

export type ColorKind = "text" | "highlight";

const TITLE: Record<ColorKind, string> = {
  text: "Text colour",
  highlight: "Highlight",
};

/**
 * The document's hues as a row of swatches for the selected text: one sets the
 * text colour or the highlight, the first clears it. Used by the selection bar
 * and by the phone's Format sheet. A swatch shows the hue's deep and pale
 * readings (themes.css tokens), so it reads on a light and on a dark sheet.
 */
export function PageColorRow({
  editor,
  kind,
  onDone,
  className,
}: {
  editor: Editor;
  kind: ColorKind;
  onDone?: () => void;
  className?: string;
}) {
  const mark = kind === "text" ? "textColor" : "highlight";
  const current = useEditorState({
    editor,
    selector: ({ editor: ed }) =>
      ed.isActive(mark)
        ? (ed.getAttributes(mark).color as string | undefined)
        : undefined,
  });
  const apply = (id: string | null) => {
    const chain = editor.chain().focus();
    if (kind === "text") {
      if (id) chain.setTextColor(id).run();
      else chain.unsetTextColor().run();
    } else if (id) chain.setHighlight(id).run();
    else chain.unsetHighlight().run();
    onDone?.();
  };
  const swatch =
    "flex h-6 w-6 items-center justify-center rounded-full border border-[var(--border-subtle)] text-[11px] text-[var(--text-muted)] aria-pressed:ring-2 aria-pressed:ring-[var(--text-primary)] aria-pressed:ring-offset-1";
  return (
    <div
      role="group"
      aria-label={TITLE[kind]}
      className={cn("needt-color-row flex items-center gap-2", className)}
    >
      <button
        type="button"
        aria-label={`No ${TITLE[kind].toLowerCase()}`}
        data-swatch="none"
        aria-pressed={!current}
        className={swatch}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => apply(null)}
      >
        ×
      </button>
      {MARK_COLORS.map((color) => (
        <button
          key={color.id}
          type="button"
          aria-label={`${color.name} ${TITLE[kind].toLowerCase()}`}
          data-swatch={color.id}
          data-swatch-kind={kind}
          aria-pressed={current === color.id}
          className={swatch}
          style={{
            background: `linear-gradient(90deg, var(--doc-text-${color.id}-dk) 50%, var(--doc-text-${color.id}-lt) 50%)`,
          }}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => apply(color.id)}
        />
      ))}
    </div>
  );
}
