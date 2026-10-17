/**
 * What the table bar does to the table the caret is in. Plain functions over a
 * Tiptap editor, so the rules (the last row or column cannot be deleted on its
 * own; deleting it deletes the table) are tested without any React.
 */
import type { Editor } from "@tiptap/core";

export type TableActionId =
  | "rowAbove"
  | "rowBelow"
  | "deleteRow"
  | "columnLeft"
  | "columnRight"
  | "deleteColumn"
  | "headerRow"
  | "headerColumn"
  | "deleteTable";

export interface TableAction {
  id: TableActionId;
  label: string;
}

export const TABLE_ACTIONS: readonly TableAction[] = [
  { id: "rowAbove", label: "Add row above" },
  { id: "rowBelow", label: "Add row below" },
  { id: "deleteRow", label: "Delete row" },
  { id: "columnLeft", label: "Add column left" },
  { id: "columnRight", label: "Add column right" },
  { id: "deleteColumn", label: "Delete column" },
  { id: "headerRow", label: "Header row" },
  { id: "headerColumn", label: "Header column" },
  { id: "deleteTable", label: "Delete table" },
];

/** Size of the table around the caret, and whether its first row/column is a header. */
export function tableInfo(editor: Editor): {
  rows: number;
  columns: number;
  headerRow: boolean;
  headerColumn: boolean;
} | null {
  const { $from } = editor.state.selection;
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const node = $from.node(depth);
    if (node.type.name !== "table") continue;
    const rows = node.childCount;
    let columns = 0;
    node.firstChild?.forEach(() => {
      columns += 1;
    });
    const firstRow = node.firstChild;
    const headerRow =
      !!firstRow &&
      firstRow.childCount > 0 &&
      Array.from({ length: firstRow.childCount }, (_, i) =>
        firstRow.child(i)
      ).every((cell) => cell.type.name === "tableHeader");
    let headerColumn = rows > 0;
    node.forEach((row) => {
      const first = row.firstChild;
      if (!first || first.type.name !== "tableHeader") headerColumn = false;
    });
    return { rows, columns, headerRow, headerColumn };
  }
  return null;
}

/** Run one table action on the table at the caret. False when there is none. */
export function runTableAction(editor: Editor, id: TableActionId): boolean {
  const info = tableInfo(editor);
  if (!info) return false;
  const chain = editor.chain().focus();
  switch (id) {
    case "rowAbove":
      return chain.addRowBefore().run();
    case "rowBelow":
      return chain.addRowAfter().run();
    case "deleteRow":
      // The last row cannot go on its own: that is the table.
      return info.rows <= 1
        ? chain.deleteTable().run()
        : chain.deleteRow().run();
    case "columnLeft":
      return chain.addColumnBefore().run();
    case "columnRight":
      return chain.addColumnAfter().run();
    case "deleteColumn":
      return info.columns <= 1
        ? chain.deleteTable().run()
        : chain.deleteColumn().run();
    case "headerRow":
      return chain.toggleHeaderRow().run();
    case "headerColumn":
      return chain.toggleHeaderColumn().run();
    case "deleteTable":
      return chain.deleteTable().run();
    default:
      return false;
  }
}

/** The element the table bar floats over: the table's wrapper in the editor. */
export function tableElement(editor: Editor): HTMLElement | null {
  const { $from } = editor.state.selection;
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    if ($from.node(depth).type.name !== "table") continue;
    const dom = editor.view.nodeDOM($from.before(depth));
    return dom instanceof HTMLElement ? dom : null;
  }
  return null;
}
