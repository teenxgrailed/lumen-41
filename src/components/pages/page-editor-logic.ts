/**
 * Pure editor logic that does not belong in the 3,500-line workspace: where a
 * "/" command starts, what a typed link address means, and how an anchor in
 * the URL (`#blockId`) finds its block. Everything here takes a ProseMirror
 * state or a plain string, so the tests need no DOM for the rules.
 */
import { type Editor, getMarkRange } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { TextSelection } from "@tiptap/pm/state";

import { blockFlashKey } from "@/components/documents/BlockFlash";

import { safeUrl } from "@/lib/pages/safe-url";

/** What the slash menu is asked about: the word being typed after a "/". */
export interface SlashHit {
  /** The text after the "/" (lower case is the caller's job). */
  query: string;
  /** The range of "/query" in the document, to delete or replace. */
  from: number;
  to: number;
}

/**
 * The "/word" ending at the caret, when the "/" starts a word: at the start of
 * the block or after whitespace ("hello /", "- /h1"). A "/" inside a word or
 * a URL ("and/or", "https://x") is not a command.
 */
export function slashBefore(textBefore: string): { query: string } | null {
  const match = /(?:^|\s)\/([^\s/]*)$/.exec(textBefore);
  return match ? { query: match[1] } : null;
}

/** The slash command under a collapsed caret in an ordinary text block. */
export function slashAtSelection(editor: Editor): SlashHit | null {
  const { selection } = editor.state;
  if (!selection.empty) return null;
  const { $from } = selection;
  const parent = $from.parent;
  if (!parent.isTextblock || parent.type.spec.code) return null;
  const before = parent.textBetween(0, $from.parentOffset, undefined, "￼");
  const hit = slashBefore(before);
  if (!hit) return null;
  return {
    query: hit.query,
    from: selection.from - hit.query.length - 1,
    to: selection.from,
  };
}

/**
 * What a person typed into the link field, as an address safe to store.
 * "example.com" gets https://, "me@example.com" gets mailto:, a path inside
 * the app stays a path. Anything the shared allowlist refuses is null.
 */
export function normalizeLinkInput(input: string): string | null {
  const value = input.trim();
  if (!value) return null;
  if (/^[a-z][a-z0-9+.-]*:/i.test(value) || value.startsWith("/")) {
    return safeUrl(value);
  }
  if (/^[^\s@/]+@[^\s@/]+\.[^\s@/]+$/.test(value)) {
    return safeUrl(`mailto:${value}`);
  }
  return safeUrl(`https://${value}`);
}

/** The range and address of the link the caret or selection touches. */
export function linkAtSelection(
  editor: Editor
): { from: number; to: number; href: string } | null {
  const { selection, schema } = editor.state;
  const type = schema.marks.link;
  if (!type) return null;
  const href = editor.getAttributes("link").href;
  if (typeof href !== "string" || !href) return null;
  if (!selection.empty) {
    return { from: selection.from, to: selection.to, href };
  }
  const range = getMarkRange(selection.$from, type);
  return range ? { from: range.from, to: range.to, href } : null;
}

/** `#abc-123` to `abc-123`; null for an empty, malformed or oversized hash. */
export function blockIdFromHash(hash: string): string | null {
  const raw = hash.startsWith("#") ? hash.slice(1) : hash;
  if (!raw) return null;
  let id = raw;
  try {
    id = decodeURIComponent(raw);
  } catch {
    return null;
  }
  return /^[\w-]{1,64}$/.test(id) ? id : null;
}

/** The DOM element of the top-level block with this id, found through the document. */
export function blockElementById(
  editor: Editor,
  id: string
): HTMLElement | null {
  let found: HTMLElement | null = null;
  editor.state.doc.forEach((node, offset) => {
    if (found || node.attrs.blockId !== id) return;
    const dom = editor.view.nodeDOM(offset);
    if (dom instanceof HTMLElement) found = dom;
  });
  return found;
}

/** How long a block opened by its link stays marked. */
export const FLASH_MS = 2200;

/** Scroll to the block and mark it for a moment. False when it is not there (yet). */
export function revealBlock(editor: Editor, id: string): boolean {
  if (editor.isDestroyed) return false;
  const element = blockElementById(editor, id);
  if (!element) return false;
  if (typeof element.scrollIntoView === "function") {
    element.scrollIntoView({ block: "center", behavior: "smooth" });
  }
  editor.view.dispatch(editor.state.tr.setMeta(blockFlashKey, { id }));
  window.setTimeout(() => {
    if (!editor.isDestroyed) {
      editor.view.dispatch(
        editor.state.tr.setMeta(blockFlashKey, { id: null })
      );
    }
  }, FLASH_MS);
  return true;
}

/**
 * Where a block that arrives from outside (a pasted or dropped image) goes:
 * over the empty paragraph the caret is in, otherwise after the top-level
 * block that holds `pos`. `replace` says whether the range is deleted.
 */
export function blockInsertRange(
  doc: ProseMirrorNode,
  pos: number
): { from: number; to: number; replace: boolean; atEnd: boolean } {
  const clamped = Math.max(0, Math.min(pos, doc.content.size));
  const $pos = doc.resolve(clamped);
  if ($pos.depth === 0) {
    return {
      from: clamped,
      to: clamped,
      replace: false,
      atEnd: clamped >= doc.content.size,
    };
  }
  const node = $pos.node(1);
  const from = $pos.before(1);
  const to = $pos.after(1);
  if (node.type.name === "paragraph" && node.content.size === 0) {
    return { from, to, replace: true, atEnd: to >= doc.content.size };
  }
  return { from: to, to, replace: false, atEnd: to >= doc.content.size };
}

/**
 * The "/" menu's matches for what was typed after the slash: the entries whose
 * name or keywords contain it, the ones named by it first (so "/task" lands on
 * Task and not on Checklist, which only lists "task" as a keyword), then
 * names that contain it, then keyword matches; each group keeps menu order.
 */
export function rankCommands<T extends { label: string; keywords: string }>(
  commands: readonly T[],
  query: string
): T[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [...commands];
  const rank = (c: T) => {
    const label = c.label.toLowerCase();
    if (label.startsWith(needle)) return 0;
    if (label.includes(needle)) return 1;
    return c.keywords.toLowerCase().includes(needle) ? 2 : 3;
  };
  return commands
    .map((command, index) => ({ command, index, r: rank(command) }))
    .filter((entry) => entry.r < 3)
    .sort((a, b) => a.r - b.r || a.index - b.index)
    .map((entry) => entry.command);
}

/**
 * `focus()` options for a focus that must not move the page: the browser and
 * TipTap both scroll the caret into view on focus, and the page's scroller
 * animates that (`scroll-behavior: smooth`), which reads as the page springing.
 */
export const NO_SCROLL = { scrollIntoView: false } as const;

/** The document position of top-level block boundary number `index` (0 = before the first block). */
export function boundaryPos(doc: ProseMirrorNode, index: number): number {
  const count = Math.max(0, Math.min(Math.trunc(index), doc.childCount));
  let pos = 0;
  for (let i = 0; i < count; i++) pos += doc.child(i).nodeSize;
  return pos;
}

/**
 * Make room for a block picked from outside the text (the Insert tab, a
 * drop): the caret goes into an empty paragraph at `pos`: the one it is in
 * already when that paragraph is empty, otherwise a new one right after the
 * top-level block holding `pos` (or exactly at `pos` when it is a boundary
 * between blocks). The command that follows turns that paragraph into the
 * block. Nothing scrolls.
 */
export function openBlockAt(editor: Editor, pos: number): void {
  if (editor.isDestroyed) return;
  const { state, view } = editor;
  const range = blockInsertRange(state.doc, pos);
  const tr = state.tr;
  let at = range.from;
  if (!range.replace) {
    // Between blocks, an empty paragraph already there is the room.
    const $at = state.doc.resolve(range.from);
    const isEmpty = (node: ProseMirrorNode | null | undefined) =>
      !!node && node.type.name === "paragraph" && node.content.size === 0;
    if (range.from === pos && isEmpty($at.nodeBefore)) {
      at = range.from - ($at.nodeBefore as ProseMirrorNode).nodeSize;
    } else if (range.from === pos && isEmpty($at.nodeAfter)) {
      at = range.from;
    } else {
      tr.insert(range.from, state.schema.nodes.paragraph.create());
    }
  }
  tr.setSelection(TextSelection.near(tr.doc.resolve(at + 1)));
  view.dispatch(tr);
}

/** The nearest ancestor that scrolls vertically, or null when the window does. */
export function scrollParent(el: HTMLElement): HTMLElement | null {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const overflow = getComputedStyle(p).overflowY;
    if (
      (overflow === "auto" || overflow === "scroll") &&
      p.scrollHeight > p.clientHeight
    ) {
      return p;
    }
  }
  return null;
}

/** How far to scroll so a line spanning `top`..`bottom` shows inside `box` with `margin` to spare; 0 when it already does. */
export function scrollDelta(
  line: { top: number; bottom: number },
  box: { top: number; bottom: number },
  margin: number
): number {
  if (line.bottom + margin > box.bottom) {
    // A line taller than the box shows its top, not its bottom.
    const need = line.bottom + margin - box.bottom;
    return Math.min(need, line.top - margin - box.top);
  }
  if (line.top - margin < box.top) return line.top - margin - box.top;
  return 0;
}

/**
 * Bring document position `pos` into view by the least scroll that shows it:
 * nothing when it is on screen already, never a jump to the end of the page.
 */
export function revealPosition(editor: Editor, pos: number, margin = 24): void {
  if (editor.isDestroyed) return;
  try {
    const dom = editor.view.dom as HTMLElement;
    const parent = scrollParent(dom);
    const line = editor.view.coordsAtPos(pos);
    const box = parent
      ? parent.getBoundingClientRect()
      : { top: 0, bottom: window.innerHeight };
    const delta = scrollDelta(line, box, margin);
    if (!delta) return;
    if (parent) {
      parent.scrollTo({ top: parent.scrollTop + delta, behavior: "instant" });
    } else {
      window.scrollBy({ top: delta, behavior: "instant" });
    }
  } catch {
    // No layout (a detached or not yet painted view): nothing to reveal.
  }
}

/**
 * Where a block belongs when the person has not put the caret in the text: in
 * the first block that is on screen, so the page stays where it is. The end
 * of the page when nothing can be measured (no layout yet).
 */
export function visibleBlockPos(editor: Editor): number {
  const end = editor.state.doc.content.size;
  try {
    const dom = editor.view.dom as HTMLElement;
    const parent = scrollParent(dom);
    const box = parent
      ? parent.getBoundingClientRect()
      : { top: 0, bottom: window.innerHeight };
    for (const child of Array.from(dom.children)) {
      const rect = child.getBoundingClientRect();
      if (
        rect.height > 0 &&
        rect.bottom > box.top + 24 &&
        rect.top < box.bottom
      ) {
        return editor.view.posAtDOM(child, 0);
      }
    }
  } catch {
    // Not laid out: fall through to the end.
  }
  return end;
}

/**
 * Clicking into the text moves focus to the editor, and Chromium then scrolls
 * the focused element into view on its own: every scrollable ancestor, both
 * axes, a page that sat still glides several lines (and the app's frame slides
 * sideways). ProseMirror cannot stop that (it is the browser's, not a
 * script's: no `scrollIntoView` call exists to patch), so remember where every
 * ancestor stood at the press and put it back if one moves while focus arrives.
 * A wheel, a touch or a key ends the guard: the person's own scrolling is left
 * alone, and so is a press in an editor that already has focus.
 */
export function guardFocusScroll(dom: HTMLElement): () => void {
  const doc = dom.ownerDocument;
  const win = doc.defaultView;
  if (!win) return () => undefined;
  type Stop = { el: Element; top: number; left: number };
  let saved: Stop[] | null = null;
  let winAt: { x: number; y: number } | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const end = () => {
    saved = null;
    winAt = null;
    if (timer) clearTimeout(timer);
    timer = undefined;
  };
  const restore = () => {
    if (!saved) return;
    for (const stop of saved) {
      if (stop.el.scrollTop !== stop.top) stop.el.scrollTop = stop.top;
      if (stop.el.scrollLeft !== stop.left) stop.el.scrollLeft = stop.left;
    }
    if (winAt && (win.scrollX !== winAt.x || win.scrollY !== winAt.y)) {
      win.scrollTo({ left: winAt.x, top: winAt.y, behavior: "instant" });
    }
  };
  const press = (event: MouseEvent) => {
    if (event.button !== 0 || doc.activeElement === dom) return;
    const stops: Stop[] = [];
    for (let p = dom.parentElement; p; p = p.parentElement) {
      stops.push({ el: p, top: p.scrollTop, left: p.scrollLeft });
    }
    saved = stops;
    winAt = { x: win.scrollX, y: win.scrollY };
    if (timer) clearTimeout(timer);
    // Focus arrives with the press; a drag that autoscrolls comes later.
    timer = setTimeout(end, 250);
  };
  const focused = () => {
    restore();
    requestAnimationFrame(restore);
  };
  doc.addEventListener("scroll", restore, true);
  doc.addEventListener("wheel", end, true);
  doc.addEventListener("touchstart", end, true);
  doc.addEventListener("keydown", end, true);
  dom.addEventListener("mousedown", press, true);
  dom.addEventListener("focus", focused);
  return () => {
    end();
    doc.removeEventListener("scroll", restore, true);
    doc.removeEventListener("wheel", end, true);
    doc.removeEventListener("touchstart", end, true);
    doc.removeEventListener("keydown", end, true);
    dom.removeEventListener("mousedown", press, true);
    dom.removeEventListener("focus", focused);
  };
}
