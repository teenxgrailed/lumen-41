"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";

import type { Editor } from "@tiptap/core";
import { useEditorState } from "@tiptap/react";
import {
  Baseline,
  Bold,
  ChevronDown,
  IndentDecrease,
  IndentIncrease,
  Italic,
  Link2,
  Plus,
  Redo2,
  Strikethrough,
  Underline as UnderlineIcon,
  Undo2,
} from "lucide-react";
import { createPortal } from "react-dom";

import { useV3PortalContainer } from "@/components/needt3/ctx/PortalScope";
import { PageColorRow } from "@/components/pages/PageColorRow";

import { cn } from "@/lib/utils";

import {
  BLOCK_MENU,
  type BlockTypeId,
  barInset,
  blockLabel,
  blockTypeOf,
  canIndent,
  caretFacts,
  caretScrollDelta,
  indent,
  scrollParentOf,
  trackKeyboard,
} from "./bar-logic";

/** How long a blur may last before the bar goes away (a tap on the bar blurs
 *  and refocuses within a frame or two; a real blur outlasts this). */
const BLUR_GRACE_MS = 140;
/** Room kept between the caret line and the pill (px). */
const CARET_MARGIN = 8;

function Btn({
  label,
  onClick,
  pressed,
  disabled,
  wide,
  children,
}: {
  label: string;
  onClick: () => void;
  pressed?: boolean;
  disabled?: boolean;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "needt-page-bar-btn grid h-11 flex-none place-items-center rounded-[var(--control-radius)] text-[var(--text-secondary)] active:bg-[var(--surface-hover)] disabled:opacity-35 aria-pressed:bg-[var(--surface-control)] aria-pressed:text-[var(--text-primary)]",
        wide ? "min-w-[104px] grid-flow-col gap-1 px-2.5" : "min-w-11"
      )}
    >
      {children}
    </button>
  );
}

const Sep = () => (
  <span
    aria-hidden
    className="mx-0.5 h-5 w-px flex-none bg-[var(--border-subtle)]"
  />
);

/**
 * The editing bar above the phone's keyboard (Craft's iPhone bar, in Needt's
 * words): the block type menu, bold, italic, underline, strike, link, colour,
 * indent and outdent, undo and redo, Insert, and a button that puts the
 * keyboard away. The row scrolls sideways when the phone is narrow.
 *
 * It is portalled out of the page (to the app's portal layer, else the body),
 * so no transformed ancestor (the reader's slide) becomes its containing
 * block, and laid out `position: fixed; bottom: 0`. It shows only while the
 * editor has focus; then `trackKeyboard` writes a `translateY` of the
 * keyboard's height from the visual viewport straight to the element, so it
 * sits on the keyboard in the same frame and does not jump while the page
 * scrolls. While it shows, the page's scroll area gets bottom padding of the
 * keyboard plus the bar, and the caret line is kept above the bar. Taps never
 * take focus from the page, so the keyboard stays.
 */
export function PhoneEditBar({
  editor,
  onCommand,
  onLink,
  onInsert,
}: {
  editor: Editor | null;
  /** The page's own command runner (the "/" menu's), for the block menu. */
  onCommand: (id: BlockTypeId) => void;
  onLink: () => void;
  onInsert: () => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const layer = useV3PortalContainer();
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [panel, setPanel] = useState<"blocks" | "color" | null>(null);
  const [focused, setFocused] = useState(false);
  const shown = focused || panel !== null;
  // Where the bar rides: the app's portal layer (it carries the theme), else
  // the body. Neither sits under a transformed ancestor.
  useEffect(() => {
    setTarget(layer ?? document.body);
  }, [layer]);

  // The bar belongs to the focused editor: it goes with the keyboard.
  useEffect(() => {
    if (!editor) return undefined;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const on = () => {
      if (timer) clearTimeout(timer);
      timer = null;
      setFocused(true);
    };
    const off = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => setFocused(false), BLUR_GRACE_MS);
    };
    setFocused(editor.isFocused);
    editor.on("focus", on);
    editor.on("blur", off);
    return () => {
      if (timer) clearTimeout(timer);
      editor.off("focus", on);
      editor.off("blur", off);
    };
  }, [editor]);

  // The keyboard's height, and what the page's scroll area does about it.
  const lift = useRef(0);
  const sync = useRef<() => void>(() => undefined);
  useEffect(() => {
    const el = root.current;
    if (!el || !target) return undefined;
    return trackKeyboard(el, (next) => {
      lift.current = next;
      sync.current();
    });
  }, [target]);

  useEffect(() => {
    const el = root.current;
    if (!editor || !el || !shown || !target || editor.isDestroyed)
      return undefined;
    const scroller = scrollParentOf(editor.view.dom);
    const style = scroller?.style;
    const before = style
      ? { pad: style.paddingBottom, scroll: style.scrollPaddingBottom }
      : null;
    // The caret line must never sit under the bar (or the keyboard under it).
    const keepCaret = () => {
      if (editor.isDestroyed || !editor.isFocused) return;
      const vv = window.visualViewport;
      let caret: { top: number; bottom: number };
      try {
        caret = editor.view.coordsAtPos(editor.state.selection.head);
      } catch {
        return;
      }
      const delta = caretScrollDelta({
        caretTop: caret.top,
        caretBottom: caret.bottom,
        viewTop: Math.max(
          scroller?.getBoundingClientRect().top ?? 0,
          vv?.offsetTop ?? 0
        ),
        viewBottom: el.getBoundingClientRect().top,
        margin: CARET_MARGIN,
      });
      if (delta === 0) return;
      if (scroller) scroller.scrollTop += delta;
      else window.scrollBy(0, delta);
    };
    const apply = () => {
      const inset = barInset(lift.current, el.offsetHeight);
      if (style && style.paddingBottom !== `${inset}px`) {
        style.paddingBottom = `${inset}px`;
        style.scrollPaddingBottom = `${inset + CARET_MARGIN}px`;
      }
      keepCaret();
    };
    sync.current = apply;
    apply();
    let frame = 0;
    const later = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(keepCaret);
    };
    // Typing only: a tap or a drag that moves the caret inside the visible
    // area must not scroll the page (that was the bounce on tap).
    editor.on("update", later);
    // The keyboard finishes opening after the focus: look again once it has.
    const settle = setTimeout(apply, 350);
    return () => {
      sync.current = () => undefined;
      cancelAnimationFrame(frame);
      clearTimeout(settle);
      editor.off("update", later);
      if (style && before) {
        style.paddingBottom = before.pad;
        style.scrollPaddingBottom = before.scroll;
      }
    };
  }, [editor, shown, target, panel]);

  useEffect(() => {
    if (!panel) return undefined;
    const away = (event: Event) => {
      if (!root.current?.contains(event.target as Node)) setPanel(null);
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [panel]);

  const state = useEditorState({
    editor,
    selector: ({ editor: ed }) =>
      ed
        ? {
            bold: ed.isActive("bold"),
            italic: ed.isActive("italic"),
            underline: ed.isActive("underline"),
            strike: ed.isActive("strike"),
            link: ed.isActive("link"),
            undo: ed.can().undo(),
            redo: ed.can().redo(),
            indent: canIndent(ed, "in"),
            outdent: canIndent(ed, "out"),
            block: blockTypeOf(caretFacts(ed)),
          }
        : null,
  });

  const mark = (name: "bold" | "italic" | "underline" | "strike") => {
    if (!editor) return;
    const chain = editor.chain().focus();
    if (name === "bold") chain.toggleBold().run();
    else if (name === "italic") chain.toggleItalic().run();
    else if (name === "underline") chain.toggleUnderline().run();
    else chain.toggleStrike().run();
  };

  if (!target) return null;
  return createPortal(
    <div
      ref={root}
      data-assistant-avoid
      data-shown={shown ? "true" : "false"}
      inert={!shown}
      data-kb="rest"
      data-page-toolbar=""
      aria-label="Page editing actions"
      // A tap here must not take focus from the page: the keyboard stays.
      onMouseDown={(event) => event.preventDefault()}
      className="needt-page-bar font-sans"
    >
      {panel ? (
        <div
          className="needt-page-bar-panel border-b border-[var(--border-subtle)] p-3"
          data-panel={panel}
        >
          {panel === "blocks" ? (
            <div
              role="menu"
              aria-label="Block type"
              className="grid grid-cols-3 gap-2"
            >
              {BLOCK_MENU.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  role="menuitemradio"
                  aria-checked={state?.block === entry.id}
                  data-block={entry.id}
                  onClick={() => {
                    setPanel(null);
                    onCommand(entry.id);
                  }}
                  className="min-h-11 rounded-[var(--control-radius)] border border-[var(--border-subtle)] px-2 text-[13px] text-[var(--text-secondary)] active:bg-[var(--surface-hover)] aria-checked:bg-[var(--surface-control)] aria-checked:text-[var(--text-primary)]"
                >
                  {entry.label}
                </button>
              ))}
            </div>
          ) : editor ? (
            <div className="space-y-2.5">
              {(["text", "highlight"] as const).map((kind) => (
                <div key={kind} className="flex items-center gap-3">
                  <span className="w-20 flex-none text-[12px] text-[var(--text-muted)]">
                    {kind === "text" ? "Text colour" : "Highlight"}
                  </span>
                  <PageColorRow
                    editor={editor}
                    kind={kind}
                    onDone={() => setPanel(null)}
                    className="flex-wrap gap-2.5"
                  />
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
      <div className="needt-page-bar-row">
        <div
          role="toolbar"
          aria-label="Formatting"
          className="needt-page-bar-strip"
        >
          <Btn
            wide
            label="Block type"
            pressed={panel === "blocks"}
            onClick={() => setPanel(panel === "blocks" ? null : "blocks")}
          >
            <span className="truncate text-[13px] font-medium">
              {blockLabel(state?.block ?? "paragraph")}
            </span>
            <ChevronDown className="h-3.5 w-3.5" aria-hidden />
          </Btn>
          <Sep />
          <Btn label="Bold" pressed={state?.bold} onClick={() => mark("bold")}>
            <Bold className="h-[18px] w-[18px]" />
          </Btn>
          <Btn
            label="Italic"
            pressed={state?.italic}
            onClick={() => mark("italic")}
          >
            <Italic className="h-[18px] w-[18px]" />
          </Btn>
          <Btn
            label="Underline"
            pressed={state?.underline}
            onClick={() => mark("underline")}
          >
            <UnderlineIcon className="h-[18px] w-[18px]" />
          </Btn>
          <Btn
            label="Strikethrough"
            pressed={state?.strike}
            onClick={() => mark("strike")}
          >
            <Strikethrough className="h-[18px] w-[18px]" />
          </Btn>
          <Btn label="Link" pressed={state?.link} onClick={onLink}>
            <Link2 className="h-[18px] w-[18px]" />
          </Btn>
          <Btn
            label="Colour and highlight"
            pressed={panel === "color"}
            onClick={() => setPanel(panel === "color" ? null : "color")}
          >
            <Baseline className="h-[18px] w-[18px]" />
          </Btn>
          <Sep />
          <Btn
            label="Outdent"
            disabled={!state?.outdent}
            onClick={() => editor && indent(editor, "out")}
          >
            <IndentDecrease className="h-[18px] w-[18px]" />
          </Btn>
          <Btn
            label="Indent"
            disabled={!state?.indent}
            onClick={() => editor && indent(editor, "in")}
          >
            <IndentIncrease className="h-[18px] w-[18px]" />
          </Btn>
          <Sep />
          <Btn
            label="Undo"
            disabled={!state?.undo}
            onClick={() => editor?.chain().focus().undo().run()}
          >
            <Undo2 className="h-[18px] w-[18px]" />
          </Btn>
          <Btn
            label="Redo"
            disabled={!state?.redo}
            onClick={() => editor?.chain().focus().redo().run()}
          >
            <Redo2 className="h-[18px] w-[18px]" />
          </Btn>
          <Sep />
          <Btn label="Insert block or attachment" onClick={onInsert}>
            <Plus className="h-5 w-5" />
          </Btn>
        </div>
        <button
          type="button"
          aria-label="Hide keyboard"
          onClick={() => editor?.commands.blur()}
          className="needt-page-bar-done grid h-11 w-11 flex-none place-items-center text-[var(--text-primary)] active:bg-[var(--surface-hover)]"
        >
          <ChevronDown className="h-5 w-5" aria-hidden />
        </button>
      </div>
    </div>,
    target
  );
}
