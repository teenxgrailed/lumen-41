/**
 * @jest-environment jsdom
 *
 * Tables: the actions the table bar runs, header rows and columns, and Tab
 * moving through the cells (Tab in the last cell adds a row).
 */
import { Editor, type JSONContent } from "@tiptap/core";
import { columnResizingPluginKey } from "@tiptap/pm/tables";

import {
  TABLE_ACTIONS,
  runTableAction,
  tableElement,
  tableInfo,
} from "@/components/pages/page-table";

import { pageEditorExtensions } from "@/lib/pages/page-editor-schema";

let host: HTMLElement;
let editor: Editor;

const json = () => editor.getJSON() as JSONContent;
const table = () => json().content!.find((node) => node.type === "table")!;

beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  editor = new Editor({
    element: host,
    extensions: pageEditorExtensions,
    content: { type: "doc", content: [{ type: "paragraph" }] },
  });
  editor.commands.insertTable({ rows: 3, cols: 3, withHeaderRow: true });
  // the caret in the first cell
  editor.commands.focus("start");
  editor.commands.setTextSelection(3);
});
afterEach(() => {
  editor.destroy();
  host.remove();
});

const cellText = (row: number, col: number) =>
  table().content![row].content![col].content?.[0].content?.[0]?.text;

const type = (text: string) => editor.commands.insertContent(text);
const key = (init: KeyboardEventInit) =>
  editor.view.dom.dispatchEvent(
    new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init })
  );

describe("table bar actions", () => {
  it("reads the table around the caret", () => {
    expect(tableInfo(editor)).toEqual({
      rows: 3,
      columns: 3,
      headerRow: true,
      headerColumn: false,
    });
    expect(tableElement(editor)).toBeInstanceOf(HTMLElement);
  });

  it("is nothing outside a table", () => {
    editor.commands.setTextSelection(1);
    editor.commands.insertContentAt(0, "plain");
    editor.commands.setTextSelection(1);
    // move the caret to the paragraph after the table
    editor.commands.focus("end");
    expect(tableInfo(editor)).toBeNull();
    expect(runTableAction(editor, "rowBelow")).toBe(false);
  });

  it("adds rows and columns on either side of the caret", () => {
    type("A");
    runTableAction(editor, "rowBelow");
    expect(table().content).toHaveLength(4);
    expect(cellText(0, 0)).toBe("A");
    expect(cellText(1, 0)).toBeUndefined();

    runTableAction(editor, "rowAbove");
    expect(table().content).toHaveLength(5);
    // the row above the caret's row is new, so "A" moved down one
    expect(cellText(1, 0)).toBe("A");

    runTableAction(editor, "columnRight");
    expect(table().content![0].content).toHaveLength(4);
    runTableAction(editor, "columnLeft");
    expect(table().content![0].content).toHaveLength(5);
  });

  it("deletes the row or column the caret is in", () => {
    runTableAction(editor, "rowBelow");
    runTableAction(editor, "deleteRow");
    expect(table().content).toHaveLength(3);
    runTableAction(editor, "columnRight");
    runTableAction(editor, "deleteColumn");
    expect(table().content![0].content).toHaveLength(3);
  });

  it("deleting the only row or column deletes the table", () => {
    runTableAction(editor, "deleteTable");
    expect(json().content!.some((n) => n.type === "table")).toBe(false);

    editor.commands.insertTable({ rows: 1, cols: 2, withHeaderRow: false });
    editor.commands.focus("start");
    editor.commands.setTextSelection(3);
    runTableAction(editor, "deleteRow");
    expect(json().content!.some((n) => n.type === "table")).toBe(false);

    editor.commands.insertTable({ rows: 2, cols: 1, withHeaderRow: false });
    editor.commands.setTextSelection(3);
    runTableAction(editor, "deleteColumn");
    expect(json().content!.some((n) => n.type === "table")).toBe(false);
  });

  it("switches the header row and the header column", () => {
    expect(tableInfo(editor)?.headerRow).toBe(true);
    runTableAction(editor, "headerRow");
    expect(tableInfo(editor)?.headerRow).toBe(false);
    expect(table().content![0].content![0].type).toBe("tableCell");
    runTableAction(editor, "headerRow");
    expect(table().content![0].content![0].type).toBe("tableHeader");

    runTableAction(editor, "headerColumn");
    expect(tableInfo(editor)?.headerColumn).toBe(true);
    expect(table().content![1].content![0].type).toBe("tableHeader");
  });

  it("lists every action once, with a label", () => {
    const ids = TABLE_ACTIONS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(TABLE_ACTIONS.every((a) => a.label.length > 0)).toBe(true);
  });

  it("keeps the table's blockId through every change", () => {
    const id = table().attrs?.blockId;
    runTableAction(editor, "rowBelow");
    runTableAction(editor, "columnRight");
    expect(table().attrs?.blockId).toBe(id);
  });
});

describe("Tab in a table", () => {
  it("moves to the next cell, and Shift+Tab back", () => {
    type("one");
    key({ key: "Tab" });
    type("two");
    expect(cellText(0, 0)).toBe("one");
    expect(cellText(0, 1)).toBe("two");
    key({ key: "Tab", shiftKey: true });
    // The previous cell is entered with its text selected, as in a sheet.
    type("!");
    expect(cellText(0, 0)).toBe("!");
    expect(cellText(0, 1)).toBe("two");
  });

  it("goes to the next row at the end of a row", () => {
    editor.commands.setTextSelection(3);
    key({ key: "Tab" });
    key({ key: "Tab" });
    key({ key: "Tab" });
    type("next");
    expect(cellText(1, 0)).toBe("next");
  });

  it("adds a row when Tab is pressed in the last cell", () => {
    // 9 cells: eight Tabs reach the last one
    for (let i = 0; i < 8; i += 1) key({ key: "Tab" });
    expect(table().content).toHaveLength(3);
    key({ key: "Tab" });
    expect(table().content).toHaveLength(4);
  });
});

describe("column resizing", () => {
  it("is on for the table", () => {
    expect(columnResizingPluginKey.getState(editor.state)).toBeDefined();
  });
});
