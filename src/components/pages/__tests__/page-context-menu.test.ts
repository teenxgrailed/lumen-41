import { EditorState, type Transaction } from "@tiptap/pm/state";

import { pageEditorSchema } from "@/lib/pages/page-editor-schema";

import {
  type BlockHost,
  type EditorMenuActions,
  TURN_INTO,
  blockAt,
  buildEditorMenu,
  deleteBlock,
  duplicateBlock,
  moveBlock,
} from "../page-context-menu";

const para = (text: string) =>
  pageEditorSchema.nodes.paragraph.create(
    { blockId: text },
    text ? pageEditorSchema.text(text) : undefined
  );

function host(...texts: string[]): BlockHost & { texts: () => string[] } {
  let state = EditorState.create({
    doc: pageEditorSchema.nodes.doc.create(null, texts.map(para)),
  });
  return {
    get state() {
      return state;
    },
    dispatch: (tr: Transaction) => {
      state = state.apply(tr);
    },
    texts: () => {
      const out: string[] = [];
      state.doc.forEach((n) => out.push(n.textContent));
      return out;
    },
  } as BlockHost & { texts: () => string[] };
}

describe("block operations", () => {
  it("finds the block that holds a position", () => {
    const h = host("a", "bb", "c");
    expect(blockAt(h.state.doc, 0)?.index).toBe(0);
    expect(blockAt(h.state.doc, 4)?.index).toBe(1);
    expect(blockAt(h.state.doc, 999)?.index).toBe(2);
  });

  it("moves a block up and down and stops at the ends", () => {
    const h = host("a", "b", "c");
    expect(moveBlock(h, 4, -1)).toBe(true);
    expect(h.texts()).toEqual(["b", "a", "c"]);
    expect(moveBlock(h, 0, -1)).toBe(false);
    expect(moveBlock(h, h.state.doc.content.size - 1, 1)).toBe(false);
    expect(moveBlock(h, 0, 1)).toBe(true);
    expect(h.texts()).toEqual(["a", "b", "c"]);
  });

  it("duplicates after the block, without carrying its id", () => {
    const h = host("a", "b");
    expect(duplicateBlock(h, 1)).toBe(true);
    expect(h.texts()).toEqual(["a", "a", "b"]);
    expect(h.state.doc.child(1).attrs.blockId).toBeNull();
  });

  it("deletes a block, and empties the last one instead of leaving no page", () => {
    const h = host("a", "b");
    deleteBlock(h, 1);
    expect(h.texts()).toEqual(["b"]);
    deleteBlock(h, 1);
    expect(h.texts()).toEqual([""]);
  });
});

const noop = () => undefined;
const actions = (over: Partial<EditorMenuActions> = {}): EditorMenuActions => ({
  pos: 1,
  hasSelection: false,
  active: {},
  canWrite: true,
  hasComments: false,
  cut: noop,
  copy: noop,
  paste: noop,
  turnInto: noop,
  mark: noop,
  link: noop,
  ask: noop,
  comment: noop,
  duplicate: noop,
  move: noop,
  copyBlockLink: noop,
  remove: noop,
  mod: "⌘",
  ...over,
});
const labels = (m: ReturnType<typeof buildEditorMenu>) =>
  m.map((g) => g.map((r) => r.label));

describe("buildEditorMenu", () => {
  it("a block gets Turn into, Duplicate, Move, Copy link and a red Delete last", () => {
    const m = buildEditorMenu(actions());
    expect(labels(m).flat()).toEqual([
      "Turn into…",
      "Duplicate",
      "Move up",
      "Move down",
      "Copy link",
      "Ask Needt about this",
      "Delete",
    ]);
    expect(m[m.length - 1][0].tone).toBe("danger");
    expect(m[0][0].sub).toHaveLength(TURN_INTO.length);
  });

  it("a selection gets clipboard, Turn into, marks, Ask; Comment only when there are comments", () => {
    const sel = labels(buildEditorMenu(actions({ hasSelection: true })));
    expect(sel[0]).toEqual(["Cut", "Copy", "Paste"]);
    expect(sel[1]).toContain("Bold");
    expect(sel[1]).toContain("Turn into…");
    expect(sel[2]).toEqual(["Ask Needt about this"]);
    const withC = labels(
      buildEditorMenu(actions({ hasSelection: true, hasComments: true }))
    );
    expect(withC[2]).toEqual(["Ask Needt about this", "Comment…"]);
  });

  it("a viewer is offered nothing that writes", () => {
    const sel = labels(
      buildEditorMenu(actions({ hasSelection: true, canWrite: false }))
    ).flat();
    expect(sel).toEqual(["Copy", "Ask Needt about this"]);
    const blk = labels(buildEditorMenu(actions({ canWrite: false }))).flat();
    expect(blk).not.toContain("Delete");
    expect(blk).not.toContain("Duplicate");
  });

  it("runs the row it is given", () => {
    const run = jest.fn();
    const m = buildEditorMenu(actions({ remove: run }));
    m[m.length - 1][0].run?.();
    expect(run).toHaveBeenCalled();
  });
});
