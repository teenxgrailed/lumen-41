"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { type NodeViewProps, NodeViewWrapper } from "@tiptap/react";

import { NeedtPicker } from "@/components/ui/needt-picker";

import { newDate } from "@/lib/date-utils";
import {
  type LiveTableCell,
  type LiveTableColumn,
  type LiveTableView,
  cellText,
} from "@/lib/live-tables/schema";
import { notify } from "@/lib/notifications";
import { exportFileName } from "@/lib/pages/export-markdown";

import { arrivalDelays, isBuilding } from "./live-table-motion";

export const liveTableQueryKey = (id: string) => ["live-table", id] as const;

async function fetchTable(id: string): Promise<LiveTableView> {
  const response = await fetch(`/api/live-tables/${id}`);
  if (!response.ok) {
    throw new Error(response.status === 404 ? "missing" : "failed");
  }
  return ((await response.json()) as { table: LiveTableView }).table;
}

async function downloadXlsx(table: LiveTableView) {
  // Through fetch, not a link, so the request carries the workspace header.
  const response = await fetch(`/api/live-tables/${table.id}/export`);
  if (!response.ok) throw new Error("export failed");
  const url = URL.createObjectURL(await response.blob());
  const link = window.document.createElement("a");
  link.href = url;
  link.download = exportFileName(table.title, "xlsx");
  link.rel = "noopener";
  window.document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * The live table inside a page. It reads the table on its own (the document
 * only carries the id), polls while the table is being built, and animates
 * what arrives: the header rises first, then each new row on its own 55ms
 * step. A table opened long after it was built appears without motion.
 */
export function LiveTableBlock({ node, editor, selected }: NodeViewProps) {
  const tableId = String(node.attrs.tableId || "");
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: liveTableQueryKey(tableId),
    queryFn: () => fetchTable(tableId),
    enabled: Boolean(tableId),
    retry: (count, error) => error.message !== "missing" && count < 2,
    refetchInterval: (current) =>
      current.state.data && isBuilding(current.state.data, newDate())
        ? 1200
        : false,
  });
  const table = query.data;

  // Rows already on screen; everything else that arrives gets an entry delay.
  const known = useRef<Set<string> | null>(null);
  const firstLoadAnimates = useRef<boolean | null>(null);
  if (table && firstLoadAnimates.current === null) {
    firstLoadAnimates.current = isBuilding(table, newDate());
  }
  const delays = useMemo(
    () =>
      table
        ? arrivalDelays(
            table.rows.map((row) => row.id),
            known.current,
            firstLoadAnimates.current === true
          )
        : new Map<string, number>(),
    [table]
  );
  useEffect(() => {
    if (table) known.current = new Set(table.rows.map((row) => row.id));
  }, [table]);

  const [exporting, setExporting] = useState(false);
  const editable = editor.isEditable;

  const saveCell = async (
    rowId: string,
    column: LiveTableColumn,
    value: LiveTableCell
  ) => {
    if (!table) return;
    const previous = table;
    queryClient.setQueryData<LiveTableView>(liveTableQueryKey(tableId), {
      ...table,
      rows: table.rows.map((row) =>
        row.id === rowId
          ? { ...row, cells: { ...row.cells, [column.id]: value } }
          : row
      ),
    });
    const response = await fetch(
      `/api/live-tables/${tableId}/rows/${rowId}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ cells: { [column.id]: value } }),
      }
    ).catch(() => null);
    if (!response?.ok) {
      queryClient.setQueryData(liveTableQueryKey(tableId), previous);
      const body = (await response?.json().catch(() => null)) as {
        error?: string;
      } | null;
      notify.error(body?.error || "Could not save the cell");
      return;
    }
    const body = (await response.json()) as { table: LiveTableView };
    queryClient.setQueryData(liveTableQueryKey(tableId), body.table);
  };

  const animateHeader = firstLoadAnimates.current === true;

  return (
    <NodeViewWrapper
      className="needt-live-table"
      data-needt-live-table={tableId}
      data-selected={selected ? "" : undefined}
      contentEditable={false}
    >
      {!table ? (
        <div className="needt-live-table-empty">
          {query.isError
            ? query.error.message === "missing"
              ? "This table is no longer available."
              : "The table could not be loaded."
            : "Loading table…"}
        </div>
      ) : (
        <>
          <div
            className="needt-live-table-bar"
            data-arriving={animateHeader ? "" : undefined}
          >
            <span className="needt-live-table-title">{table.title}</span>
            <button
              type="button"
              className="needt-live-table-action"
              disabled={exporting}
              onClick={() => {
                setExporting(true);
                downloadXlsx(table)
                  .catch(() => notify.error("Could not export the table"))
                  .finally(() => setExporting(false));
              }}
            >
              Export .xlsx
            </button>
          </div>
          <div className="needt-live-table-scroll">
            <table>
              <thead>
                <tr
                  data-arriving={animateHeader ? "" : undefined}
                  style={animateHeader ? { animationDelay: "0ms" } : undefined}
                >
                  {table.columns.map((column) => (
                    <th key={column.id} data-type={column.type}>
                      {column.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {table.rows.map((row) => {
                  const delay = delays.get(row.id);
                  return (
                    <tr
                      key={row.id}
                      data-row-id={row.id}
                      data-arriving={delay === undefined ? undefined : ""}
                      style={
                        delay === undefined
                          ? undefined
                          : { animationDelay: `${delay}ms` }
                      }
                    >
                      {table.columns.map((column) => (
                        <td key={column.id} data-type={column.type}>
                          <LiveTableCellView
                            column={column}
                            value={row.cells[column.id] ?? null}
                            editable={editable}
                            onSave={(value) =>
                              void saveCell(row.id, column, value)
                            }
                          />
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </NodeViewWrapper>
  );
}

function LiveTableCellView({
  column,
  value,
  editable,
  onSave,
}: {
  column: LiveTableColumn;
  value: LiveTableCell;
  editable: boolean;
  onSave: (value: LiveTableCell) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const cancelled = useRef(false);

  if (column.type === "checkbox") {
    return (
      <input
        type="checkbox"
        className="needt-live-table-check"
        checked={value === true}
        disabled={!editable}
        aria-label={column.name}
        onChange={(event) => onSave(event.target.checked)}
      />
    );
  }

  if (column.type === "select") {
    if (!editable) return <span>{cellText(column, value)}</span>;
    return (
      <NeedtPicker
        ariaLabel={column.name}
        triggerVariant="inline"
        className="needt-live-table-picker"
        value={typeof value === "string" ? value : ""}
        placeholder=""
        options={[
          ...(column.options ?? []).map((option) => ({
            value: option,
            label: option,
          })),
          { value: "", label: "Empty" },
        ]}
        onValueChange={(next) => {
          if (next !== (value ?? "")) onSave(next === "" ? null : next);
        }}
      />
    );
  }

  const text = cellText(column, value);
  if (!editable) {
    return column.type === "url" && text ? (
      <a href={text} target="_blank" rel="noreferrer noopener">
        {text}
      </a>
    ) : (
      <span>{text}</span>
    );
  }
  return (
    <input
      className="needt-live-table-input"
      type={
        column.type === "number"
          ? "number"
          : column.type === "date"
            ? "date"
            : column.type === "url"
              ? "url"
              : "text"
      }
      aria-label={column.name}
      value={draft ?? text}
      onFocus={() => setDraft(text)}
      onChange={(event) => setDraft(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
        if (event.key === "Escape") {
          cancelled.current = true;
          event.currentTarget.blur();
        }
      }}
      onBlur={() => {
        const next = draft;
        setDraft(null);
        if (cancelled.current) {
          cancelled.current = false;
          return;
        }
        if (next === null || next === text) return;
        if (next.trim() === "") return onSave(null);
        onSave(column.type === "number" ? Number(next) : next);
      }}
    />
  );
}
