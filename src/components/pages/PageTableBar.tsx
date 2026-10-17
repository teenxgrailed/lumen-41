"use client";

import type { ComponentType } from "react";

import type { Editor } from "@tiptap/core";
import { useEditorState } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import {
  BetweenHorizontalEnd,
  BetweenHorizontalStart,
  BetweenVerticalEnd,
  BetweenVerticalStart,
  Columns3,
  PanelTop,
  Rows3,
  Trash2,
} from "lucide-react";

import { cn } from "@/lib/utils";

import {
  TABLE_ACTIONS,
  type TableActionId,
  runTableAction,
  tableElement,
  tableInfo,
} from "./page-table";

const ICONS: Record<TableActionId, ComponentType<{ className?: string }>> = {
  rowAbove: BetweenHorizontalStart,
  rowBelow: BetweenHorizontalEnd,
  deleteRow: Rows3,
  columnLeft: BetweenVerticalStart,
  columnRight: BetweenVerticalEnd,
  deleteColumn: Columns3,
  headerRow: PanelTop,
  headerColumn: PanelTop,
  deleteTable: Trash2,
};

/** Destructive rows are marked so the stylesheet can set them apart. */
const DELETES: ReadonlySet<TableActionId> = new Set([
  "deleteRow",
  "deleteColumn",
  "deleteTable",
]);

/**
 * The bar over a table while the caret is in it: add a row or column on either
 * side, delete the row, column or table, and switch the header row or column.
 * It is the table counterpart of the selection bar for text.
 */
export function PageTableBar({ editor }: { editor: Editor }) {
  const info = useEditorState({
    editor,
    selector: ({ editor: current }) => tableInfo(current),
    equalityFn: (a, b) =>
      a === b ||
      (!!a &&
        !!b &&
        a.rows === b.rows &&
        a.columns === b.columns &&
        a.headerRow === b.headerRow &&
        a.headerColumn === b.headerColumn),
  });
  return (
    <BubbleMenu
      editor={editor}
      pluginKey="tableBar"
      shouldShow={({ editor: current }) =>
        current.isEditable && current.isActive("table")
      }
      getReferencedVirtualElement={() => {
        const element = tableElement(editor);
        return element
          ? {
              getBoundingClientRect: () => element.getBoundingClientRect(),
              getClientRects: () => element.getClientRects(),
              contextElement: element,
            }
          : null;
      }}
      options={{
        placement: "top-end",
        offset: 8,
        flip: true,
        shift: { padding: 8 },
      }}
    >
      <div
        className="needt-overlay-depth needt-table-bar flex max-w-[calc(100vw-16px)] items-center gap-0.5 overflow-x-auto rounded-[var(--control-radius)] border border-[var(--popover-border)] p-1"
        role="toolbar"
        aria-label="Table actions"
      >
        {TABLE_ACTIONS.map((action) => {
          const Icon = ICONS[action.id];
          const pressed =
            action.id === "headerRow"
              ? info?.headerRow
              : action.id === "headerColumn"
                ? info?.headerColumn
                : undefined;
          return (
            <button
              key={action.id}
              type="button"
              aria-label={action.label}
              title={action.label}
              aria-pressed={pressed}
              data-table-action={action.id}
              data-danger={DELETES.has(action.id) ? "" : undefined}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => runTableAction(editor, action.id)}
              className={cn(
                "flex h-11 w-11 flex-none items-center justify-center rounded-[var(--control-radius)] text-[var(--text-secondary)] hover:bg-[var(--menu-item-hover)] sm:h-8 sm:w-8",
                pressed &&
                  "bg-[var(--menu-item-hover)] text-[var(--text-primary)]",
                action.id === "headerColumn" && "[&>svg]:-rotate-90",
                (action.id === "deleteTable" || action.id === "headerColumn") &&
                  "ml-1"
              )}
            >
              <Icon className="h-4 w-4" />
            </button>
          );
        })}
      </div>
    </BubbleMenu>
  );
}
