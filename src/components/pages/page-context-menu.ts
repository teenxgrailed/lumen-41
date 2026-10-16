/**
 * The document editor's own context menu (right-click, and the grip on a
 * phone). Pure over a ProseMirror state: the block operations take a
 * `BlockHost` (the editor's state plus a dispatch) so they can be tested
 * without a DOM, and `buildEditorMenu` only turns a position into rows.
 *
 * Shape follows what Craft's editor teaches, in our own words: one menu for
 * the text you selected (clipboard, Turn into, marks, ask), another for the
 * block under the pointer (Turn into, Duplicate, Move, Copy link, Delete),
 * a submenu for the block types, and Shift + right-click for the browser's.
 */
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import {
  type EditorState,
  TextSelection,
  type Transaction,
} from "@tiptap/pm/state";

import type { CtxMenu } from "@/components/needt3/ctx/registry";

export const EDITOR_MENU_TEXT = {
  cut: "Cut",
  copy: "Copy",
  paste: "Paste",
  turnInto: "Turn into…",
  bold: "Bold",
  italic: "Italic",
  strike: "Strikethrough",
  code: "Code",
  link: "Link…",
  ask: "Ask Needt about this",
  comment: "Comment…",
  duplicate: "Duplicate",
  moveUp: "Move up",
  moveDown: "Move down",
  copyLink: "Copy link",
  delete: "Delete",
  text: "Text",
  h1: "Heading 1",
  h2: "Heading 2",
  h3: "Heading 3",
  bullet: "Bulleted list",
  ordered: "Numbered list",
  checklist: "Checklist",
  quote: "Quote",
  codeBlock: "Code block",
} as const;

/** The block types Turn into offers, with the command id the editor applies. */
export const TURN_INTO = [
  ["paragraph", EDITOR_MENU_TEXT.text],
  ["heading1", EDITOR_MENU_TEXT.h1],
  ["heading2", EDITOR_MENU_TEXT.h2],
  ["heading3", EDITOR_MENU_TEXT.h3],
  ["bullet", EDITOR_MENU_TEXT.bullet],
  ["ordered", EDITOR_MENU_TEXT.ordered],
  ["checklist", EDITOR_MENU_TEXT.checklist],
  ["quote", EDITOR_MENU_TEXT.quote],
  ["code", EDITOR_MENU_TEXT.codeBlock],
] as const;

export interface BlockHost {
  state: EditorState;
  dispatch: (tr: Transaction) => void;
}

/** Index and start of the top-level block that holds `pos`; null on an empty doc. */
export function blockAt(
  doc: ProseMirrorNode,
  pos: number
): { index: number; start: number; node: ProseMirrorNode } | null {
  if (doc.childCount === 0) return null;
  const clamped = Math.max(0, Math.min(pos, doc.content.size));
  let offset = 0;
  for (let index = 0; index < doc.childCount; index += 1) {
    const node = doc.child(index);
    if (clamped <= offset + node.nodeSize)
      return { index, start: offset, node };
    offset += node.nodeSize;
  }
  return null;
}

/** Swap the block with its neighbour; false at the ends. */
export function moveBlock(host: BlockHost, pos: number, dir: -1 | 1) {
  const { doc } = host.state;
  const at = blockAt(doc, pos);
  if (!at) return false;
  const to = at.index + dir;
  if (to < 0 || to >= doc.childCount) return false;
  const blocks: { node: ProseMirrorNode; start: number }[] = [];
  doc.forEach((node, start) => blocks.push({ node, start }));
  const a = blocks[Math.min(at.index, to)];
  const b = blocks[Math.max(at.index, to)];
  const tr = host.state.tr.replaceWith(a.start, b.start + b.node.nodeSize, [
    b.node,
    a.node,
  ]);
  // Keep the caret in the block that moved.
  const moved = dir === -1 ? a.start : a.start + b.node.nodeSize;
  tr.setSelection(TextSelection.near(tr.doc.resolve(moved + 1)));
  host.dispatch(tr.scrollIntoView());
  return true;
}

/** Insert a copy of the block after it. The copy's id is made fresh by BlockIdentity. */
export function duplicateBlock(host: BlockHost, pos: number) {
  const at = blockAt(host.state.doc, pos);
  if (!at) return false;
  const copy = at.node.type.create(
    { ...at.node.attrs, blockId: null },
    at.node.content,
    at.node.marks
  );
  const end = at.start + at.node.nodeSize;
  const tr = host.state.tr.insert(end, copy);
  tr.setSelection(TextSelection.near(tr.doc.resolve(end + 1)));
  host.dispatch(tr.scrollIntoView());
  return true;
}

/** Remove the block; the last block is emptied rather than the page left with none. */
export function deleteBlock(host: BlockHost, pos: number) {
  const { doc, schema } = host.state;
  const at = blockAt(doc, pos);
  if (!at) return false;
  const end = at.start + at.node.nodeSize;
  const tr =
    doc.childCount === 1
      ? host.state.tr.replaceWith(0, end, schema.nodes.paragraph.create())
      : host.state.tr.delete(at.start, end);
  host.dispatch(tr.scrollIntoView());
  return true;
}

export interface EditorMenuActions {
  /** Where the block menu is for: a position inside the block. */
  pos: number;
  /** The selection is a range the pointer landed in. */
  hasSelection: boolean;
  /** Which marks are on in the selection, for the toggles' hints. */
  active: Partial<Record<"bold" | "italic" | "strike" | "code", boolean>>;
  canWrite: boolean;
  hasComments: boolean;
  cut: () => void;
  copy: () => void;
  paste: () => void;
  turnInto: (command: (typeof TURN_INTO)[number][0]) => void;
  mark: (mark: "bold" | "italic" | "strike" | "code") => void;
  link: () => void;
  ask: () => void;
  comment: () => void;
  duplicate: () => void;
  move: (dir: -1 | 1) => void;
  copyBlockLink: () => void;
  remove: () => void;
  /** Hints are written for the platform: "⌘" on a Mac, "Ctrl+" elsewhere. */
  mod: string;
}

/** The rows for a text selection or for a block. A viewer gets only what reads. */
export function buildEditorMenu(a: EditorMenuActions): CtxMenu {
  const t = EDITOR_MENU_TEXT;
  const turn = {
    label: t.turnInto,
    hint: "›",
    sub: TURN_INTO.map(([id, label]) => ({
      label,
      run: () => a.turnInto(id),
    })),
  };
  const ask = { label: t.ask, run: a.ask };
  const comment = a.hasComments ? [{ label: t.comment, run: a.comment }] : [];

  if (a.hasSelection) {
    const clipboard = a.canWrite
      ? [
          { label: t.cut, hint: `${a.mod}X`, run: a.cut },
          { label: t.copy, hint: `${a.mod}C`, run: a.copy },
          { label: t.paste, hint: `${a.mod}V`, run: a.paste },
        ]
      : [{ label: t.copy, hint: `${a.mod}C`, run: a.copy }];
    if (!a.canWrite) return [clipboard, [ask, ...comment]];
    return [
      clipboard,
      [
        turn,
        { label: t.bold, hint: `${a.mod}B`, run: () => a.mark("bold") },
        { label: t.italic, hint: `${a.mod}I`, run: () => a.mark("italic") },
        { label: t.strike, run: () => a.mark("strike") },
        { label: t.code, run: () => a.mark("code") },
        { label: t.link, hint: `${a.mod}K`, run: a.link },
      ],
      [ask, ...comment],
    ];
  }

  const read = [{ label: t.copyLink, run: a.copyBlockLink }, ask, ...comment];
  if (!a.canWrite) return [read];
  return [
    [
      turn,
      { label: t.duplicate, run: a.duplicate },
      { label: t.moveUp, run: () => a.move(-1) },
      { label: t.moveDown, run: () => a.move(1) },
    ],
    read,
    [{ label: t.delete, tone: "danger" as const, run: a.remove }],
  ];
}
