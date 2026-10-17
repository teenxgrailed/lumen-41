/**
 * Pure editor logic that does not belong in the 3,500-line workspace: where a
 * "/" command starts, what a typed link address means, and how an anchor in
 * the URL (`#blockId`) finds its block. Everything here takes a ProseMirror
 * state or a plain string, so the tests need no DOM for the rules.
 */
import { type Editor, getMarkRange } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

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
