/**
 * @jest-environment jsdom
 *
 * The task item as the editor runs it: a real Tiptap editor with the page's
 * extension list. `[] ` makes one, `[ ] ` stays a plain checklist item, the
 * date chip writes the day, a copy gets its own id, and taking one out of the
 * page is announced (but a move, a cut, the sync's own write and a turn-off
 * are not).
 */
import { Editor, type JSONContent } from "@tiptap/core";

import { pageEditorExtensions } from "@/lib/pages/page-editor-schema";

import { withTaskItem } from "../task-item-commands";
import {
  TASK_SYNC_META,
  chipLabel,
  onTaskItemsRemoved,
} from "../task-item-extension";
import { applyItemPatch, unlinkItem } from "../useDocTaskLinks";

let host: HTMLElement;
let editor: Editor;
let removed: string[][];

const para = (text?: string): JSONContent =>
  text
    ? { type: "paragraph", content: [{ type: "text", text }] }
    : { type: "paragraph" };
const item = (
  text: string,
  attrs: Record<string, unknown> = {}
): JSONContent => ({
  type: "taskItem",
  attrs,
  content: [para(text)],
});
const list = (...items: JSONContent[]): JSONContent => ({
  type: "taskList",
  content: items,
});

const make = (content: JSONContent[]) => {
  host = document.createElement("div");
  document.body.appendChild(host);
  editor = new Editor({
    element: host,
    extensions: pageEditorExtensions,
    content: { type: "doc", content },
  });
  removed = [];
  onTaskItemsRemoved(editor, (ids) => removed.push(ids));
  return editor;
};

afterEach(() => {
  editor?.destroy();
  host?.remove();
});

const items = () => {
  const out: Array<{ attrs: Record<string, unknown>; text: string }> = [];
  editor.state.doc.descendants((node) => {
    if (node.type.name === "taskItem") {
      out.push({ attrs: node.attrs, text: node.textContent });
    }
    return true;
  });
  return out;
};

const type = (text: string) => {
  const { from, to } = editor.state.selection;
  const handled = editor.view.someProp("handleTextInput", (f) =>
    f(editor.view, from, to, text, () => editor.state.tr)
  );
  if (!handled)
    editor.view.dispatch(editor.state.tr.insertText(text, from, to));
};
const typeChars = (text: string) => [...text].forEach(type);

describe("starting a task item", () => {
  it("[] and a space make a task item with its own id", () => {
    make([para()]);
    editor.commands.focus("start");
    typeChars("[] ");
    const [only] = items();
    expect(only.attrs.task).toBe(true);
    expect(typeof only.attrs.taskId).toBe("string");
    expect((only.attrs.taskId as string).length).toBeGreaterThan(8);
  });

  it("[ ] and [x] stay plain checklist items", () => {
    make([para(), para()]);
    editor.commands.focus("start");
    typeChars("[ ] ");
    editor.commands.focus("end");
    typeChars("[x] ");
    const rows = items();
    expect(rows.map((r) => r.attrs.task)).toEqual([false, false]);
    expect(rows.map((r) => r.attrs.checked)).toEqual([false, true]);
    expect(rows.every((r) => !r.attrs.taskId)).toBe(true);
  });

  it("Enter at the end of a task item starts another task item with a new id", () => {
    make([list(item("First", { task: true, taskId: "a" }))]);
    editor.commands.focus("end");
    editor.commands.splitListItem("taskItem");
    const rows = items();
    expect(rows).toHaveLength(2);
    expect(rows[0].attrs.taskId).toBe("a");
    expect(rows[1].attrs.task).toBe(true);
    expect(rows[1].attrs.taskId).toBeTruthy();
    expect(rows[1].attrs.taskId).not.toBe("a");
  });

  it("the Task command turns a line into a task item, and again turns it off", () => {
    make([para("Write it up")]);
    editor.commands.focus("start");
    withTaskItem(editor.chain().focus()).run();
    expect(items()[0].attrs.task).toBe(true);
    expect(items()[0].attrs.taskId).toBeTruthy();
    withTaskItem(editor.chain().focus()).run();
    expect(items()[0].attrs).toMatchObject({ task: false, taskId: null });
    // Turning the link off keeps the item: no removal prompt.
    expect(removed).toEqual([]);
  });
});

describe("the date chip", () => {
  it("shows only on a task item, with the day as words", () => {
    make([
      list(
        item("Plain"),
        item("Task", { task: true, taskId: "a", taskDue: "2026-10-20" })
      ),
    ]);
    const metas = Array.from(
      host.querySelectorAll<HTMLElement>(".needt-task-meta")
    );
    expect(metas).toHaveLength(2);
    expect(metas[0].hidden).toBe(true);
    expect(metas[1].hidden).toBe(false);
    expect(metas[1].querySelector(".needt-task-due-label")?.textContent).toBe(
      "Oct 20"
    );
    expect(chipLabel("2026-01-05")).toBe("Jan 5");
    expect(chipLabel("nonsense")).toBe("");
  });

  it("choosing a day writes taskDue; the clear button removes it", () => {
    make([list(item("Task", { task: true, taskId: "a" }))]);
    const input = host.querySelector<HTMLInputElement>(
      ".needt-task-due-input"
    )!;
    input.value = "2026-11-02";
    input.dispatchEvent(new Event("change", { bubbles: true }));
    expect(items()[0].attrs.taskDue).toBe("2026-11-02");
    expect(host.querySelector(".needt-task-due-label")?.textContent).toBe(
      "Nov 2"
    );
    host.querySelector<HTMLButtonElement>(".needt-task-due-clear")!.click();
    expect(items()[0].attrs.taskDue).toBeNull();
  });

  it("is inert in a read-only page", () => {
    make([
      list(
        item("Dated", { task: true, taskId: "a", taskDue: "2026-10-20" }),
        item("Undated", { task: true, taskId: "b" })
      ),
    ]);
    editor.setEditable(false);
    const rows = Array.from(
      host.querySelectorAll<HTMLElement>(".needt-task-meta")
    );
    // setEditable repaints through the node view update on the next change.
    editor.view.dispatch(editor.state.tr.setMeta("repaint", true));
    expect(rows.length).toBe(2);
  });
});

describe("ids", () => {
  it("a copy of a task item gets its own id; the original keeps its link", () => {
    make([list(item("Pay", { task: true, taskId: "a" }))]);
    // Paste the same item above the original.
    editor.view.dispatch(
      editor.state.tr.insert(
        1,
        editor.schema.nodeFromJSON(item("Pay", { task: true, taskId: "a" }))
      )
    );
    const rows = items();
    expect(rows).toHaveLength(2);
    const ids = rows.map((r) => r.attrs.taskId);
    expect(new Set(ids).size).toBe(2);
    // The original was the second one after the insert; it kept "a".
    expect(ids[1]).toBe("a");
  });

  it("a task item that arrives without an id gets one", () => {
    make([list(item("No id", { task: true }))]);
    editor.view.dispatch(editor.state.tr.insertText("!", 3));
    expect(items()[0].attrs.taskId).toBeTruthy();
  });
});

describe("taking a task item out of the page", () => {
  const two = () =>
    make([
      list(
        item("A", { task: true, taskId: "a" }),
        item("B", { task: true, taskId: "b" })
      ),
    ]);

  it("announces the ids that left", () => {
    two();
    let from = 0;
    let to = 0;
    editor.state.doc.descendants((node, pos) => {
      if (node.attrs.taskId === "b") {
        from = pos;
        to = pos + node.nodeSize;
      }
      return true;
    });
    editor.view.dispatch(editor.state.tr.delete(from, to));
    expect(removed).toEqual([["b"]]);
  });

  it("does not for a move, a cut, or the sync's own write", () => {
    two();
    const nodes: Array<{ pos: number; size: number }> = [];
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name === "taskItem")
        nodes.push({ pos, size: node.nodeSize });
      return true;
    });
    // Move: delete the first item and insert it after the second, in one step.
    const first = editor.state.doc.nodeAt(nodes[0].pos)!;
    const tr = editor.state.tr.delete(
      nodes[0].pos,
      nodes[0].pos + nodes[0].size
    );
    tr.insert(tr.doc.content.size - 1, first);
    editor.view.dispatch(tr);
    expect(removed).toEqual([]);

    // Cut.
    const cut = editor.state.tr;
    cut.delete(1, 1 + editor.state.doc.firstChild!.firstChild!.nodeSize);
    cut.setMeta("uiEvent", "cut");
    editor.view.dispatch(cut);
    expect(removed).toEqual([]);
  });

  it("not when the sync unlinks an item", () => {
    two();
    unlinkItem(editor, "a");
    expect(items()[0].attrs).toMatchObject({ task: false, taskId: null });
    expect(removed).toEqual([]);
  });
});

describe("applying a pull to the page", () => {
  it("ticks, dates and renames the item without an undo step or a prompt", () => {
    make([list(item("Old title", { task: true, taskId: "a" }), item("Other"))]);
    const ok = applyItemPatch(editor, "a", {
      text: "New title",
      checked: true,
      due: "2026-12-24",
    });
    expect(ok).toBe(true);
    expect(items()[0]).toMatchObject({
      text: "New title",
      attrs: { checked: true, taskDue: "2026-12-24", taskId: "a" },
    });
    expect(removed).toEqual([]);
  });

  it("does not rewrite a title that has formatting in it", () => {
    make([
      list({
        type: "taskItem",
        attrs: { task: true, taskId: "a" },
        content: [
          {
            type: "paragraph",
            content: [
              { type: "text", text: "Bold", marks: [{ type: "bold" }] },
              { type: "text", text: " plain" },
            ],
          },
        ],
      }),
    ]);
    applyItemPatch(editor, "a", { text: "Replaced", checked: true });
    expect(items()[0].text).toBe("Bold plain");
    expect(items()[0].attrs.checked).toBe(true);
  });

  it("marks its own transaction so the page does not sync it back", () => {
    make([list(item("T", { task: true, taskId: "a" }))]);
    const metas: unknown[] = [];
    editor.on("update", ({ transaction }) =>
      metas.push(transaction.getMeta(TASK_SYNC_META))
    );
    applyItemPatch(editor, "a", { checked: true });
    expect(metas).toEqual([true]);
  });

  it("an item that is not on the page is reported", () => {
    make([list(item("T", { task: true, taskId: "a" }))]);
    expect(applyItemPatch(editor, "zzz", { checked: true })).toBe(false);
  });
});
