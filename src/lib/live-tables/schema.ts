/**
 * The shape of a live table, shared by the API, the MCP tools, the block in the
 * page and the .xlsx export. Pure functions only, so the rules (what a cell of
 * each column type accepts, how a row given as a list or as an object becomes
 * stored cells) are tested without a database.
 */
import { z } from "zod";

export const LIVE_TABLE_COLUMN_TYPES = [
  "text",
  "number",
  "select",
  "checkbox",
  "date",
  "url",
] as const;

export type LiveTableColumnType = (typeof LIVE_TABLE_COLUMN_TYPES)[number];

export interface LiveTableColumn {
  id: string;
  name: string;
  type: LiveTableColumnType;
  /** Dropdown choices, in order; `select` only. */
  options?: string[];
}

export type LiveTableCell = string | number | boolean | null;
export type LiveTableCells = Record<string, LiveTableCell>;

export interface LiveTableRowView {
  id: string;
  position: number;
  cells: LiveTableCells;
}

export interface LiveTableView {
  id: string;
  pageId: string;
  title: string;
  columns: LiveTableColumn[];
  rows: LiveTableRowView[];
  createdBy: "HUMAN" | "AI";
  createdAt: string;
  updatedAt: string;
}

export const LIVE_TABLE_MAX_COLUMNS = 30;
export const LIVE_TABLE_MAX_ROWS = 1000;
export const LIVE_TABLE_MAX_ROWS_PER_APPEND = 200;
export const LIVE_TABLE_MAX_OPTIONS = 50;
const MAX_TEXT = 4000;

export const liveTableColumnInput = z.object({
  name: z.string().trim().min(1).max(120).describe("Column header."),
  type: z
    .enum(LIVE_TABLE_COLUMN_TYPES)
    .default("text")
    .describe(
      "text, number, select (a dropdown: give options), checkbox, date (YYYY-MM-DD) or url."
    ),
  options: z
    .array(z.string().trim().min(1).max(120))
    .max(LIVE_TABLE_MAX_OPTIONS)
    .optional()
    .describe("Dropdown choices for a select column, in order."),
});

export type LiveTableColumnInput = z.input<typeof liveTableColumnInput>;

export const liveTableCellInput = z.union([
  z.string().max(MAX_TEXT),
  z.number(),
  z.boolean(),
  z.null(),
]);

/** A row is either a list in column order or an object keyed by column name. */
export const liveTableRowInput = z.union([
  z.array(liveTableCellInput).max(LIVE_TABLE_MAX_COLUMNS),
  z.record(z.string(), liveTableCellInput),
]);

export type LiveTableRowInput = z.infer<typeof liveTableRowInput>;

export class LiveTableInputError extends Error {}

/** Short, stable column ids: c1, c2 … in the order the columns were given. */
export function buildColumns(input: LiveTableColumnInput[]): LiveTableColumn[] {
  if (input.length === 0) {
    throw new LiveTableInputError("A table needs at least one column");
  }
  if (input.length > LIVE_TABLE_MAX_COLUMNS) {
    throw new LiveTableInputError(
      `A table has at most ${LIVE_TABLE_MAX_COLUMNS} columns`
    );
  }
  const seen = new Set<string>();
  return input.map((raw, index) => {
    const column = liveTableColumnInput.parse(raw);
    const key = column.name.toLowerCase();
    if (seen.has(key)) {
      throw new LiveTableInputError(`Column "${column.name}" is given twice`);
    }
    seen.add(key);
    if (column.type === "select") {
      const options = Array.from(new Set(column.options ?? []));
      if (options.length === 0) {
        throw new LiveTableInputError(
          `Column "${column.name}" is a dropdown and needs options`
        );
      }
      return {
        id: `c${index + 1}`,
        name: column.name,
        type: column.type,
        options,
      };
    }
    return { id: `c${index + 1}`, name: column.name, type: column.type };
  });
}

/** Reads columns back from the stored JSON, dropping anything malformed. */
export function parseStoredColumns(value: unknown): LiveTableColumn[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((raw) => {
    if (!raw || typeof raw !== "object") return [];
    const column = raw as Record<string, unknown>;
    if (typeof column.id !== "string" || typeof column.name !== "string") {
      return [];
    }
    const type = (LIVE_TABLE_COLUMN_TYPES as readonly string[]).includes(
      String(column.type)
    )
      ? (column.type as LiveTableColumnType)
      : "text";
    const options = Array.isArray(column.options)
      ? column.options.filter((o): o is string => typeof o === "string")
      : undefined;
    return [
      {
        id: column.id,
        name: column.name,
        type,
        ...(type === "select" ? { options: options ?? [] } : {}),
      },
    ];
  });
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * A number typed by a person: spaces and ' are thousands marks; with both a
 * comma and a dot the last one is the decimal mark; a lone comma is decimal
 * unless it groups thousands ("1,5" is 1.5, "1,234" is 1234).
 */
export function parseNumberText(raw: string): number {
  let text = raw.replace(/[\s'\u00a0]/g, "");
  const comma = text.lastIndexOf(",");
  const dot = text.lastIndexOf(".");
  if (comma >= 0 && dot >= 0) {
    text =
      comma > dot
        ? text.replace(/\./g, "").replace(",", ".")
        : text.replace(/,/g, "");
  } else if (comma >= 0) {
    text = /^-?\d{1,3}(,\d{3})+$/.test(text)
      ? text.replace(/,/g, "")
      : text.replace(",", ".");
  }
  return text === "" ? Number.NaN : Number(text);
}

/**
 * One cell, checked against its column. Empty input (null, "") is stored as
 * null in every type. A dropdown value matches its option case-insensitively
 * and is stored in the option's own spelling.
 */
export function normalizeCell(
  column: LiveTableColumn,
  value: LiveTableCell | undefined
): LiveTableCell {
  if (value === undefined || value === null) return null;
  if (typeof value === "string" && value.trim() === "") return null;
  const fail = (what: string): never => {
    throw new LiveTableInputError(
      `"${String(value)}" is not ${what} (column "${column.name}")`
    );
  };
  switch (column.type) {
    case "text":
      return String(value).slice(0, MAX_TEXT);
    case "number": {
      if (typeof value === "number") {
        return Number.isFinite(value) ? value : fail("a number");
      }
      if (typeof value === "boolean") return fail("a number");
      const parsed = parseNumberText(value);
      return Number.isFinite(parsed) ? parsed : fail("a number");
    }
    case "checkbox": {
      if (typeof value === "boolean") return value;
      if (typeof value === "number") return value !== 0;
      const text = value.trim().toLowerCase();
      if (["true", "yes", "1", "x", "✓"].includes(text)) return true;
      if (["false", "no", "0"].includes(text)) return false;
      return fail("yes or no");
    }
    case "date": {
      const text = String(value).trim();
      if (!DATE_RE.test(text)) return fail("a date as YYYY-MM-DD");
      const [y, m, d] = text.split("-").map(Number);
      const probe = new Date(Date.UTC(y, m - 1, d));
      if (probe.getUTCMonth() !== m - 1 || probe.getUTCDate() !== d) {
        return fail("a real date");
      }
      return text;
    }
    case "url": {
      const text = String(value).trim();
      try {
        const url = new URL(text);
        if (url.protocol !== "http:" && url.protocol !== "https:") {
          return fail("a web address");
        }
        return url.toString();
      } catch {
        return fail("a web address");
      }
    }
    case "select": {
      const text = String(value).trim();
      const match = (column.options ?? []).find(
        (option) => option.toLowerCase() === text.toLowerCase()
      );
      if (!match) {
        return fail(
          `one of the options (${(column.options ?? []).join(", ")})`
        );
      }
      return match;
    }
  }
}

/** A row given as a list (column order) or an object (column name or id). */
export function normalizeRow(
  columns: LiveTableColumn[],
  row: LiveTableRowInput
): LiveTableCells {
  const cells: LiveTableCells = {};
  if (Array.isArray(row)) {
    if (row.length > columns.length) {
      throw new LiveTableInputError(
        `A row has ${row.length} values but the table has ${columns.length} columns`
      );
    }
    columns.forEach((column, index) => {
      cells[column.id] = normalizeCell(column, row[index]);
    });
    return cells;
  }
  const byKey = new Map<string, LiveTableColumn>();
  for (const column of columns) {
    byKey.set(column.id, column);
    byKey.set(column.name.toLowerCase(), column);
  }
  for (const column of columns) cells[column.id] = null;
  for (const [key, value] of Object.entries(row)) {
    const column = byKey.get(key) ?? byKey.get(key.toLowerCase());
    if (!column) {
      throw new LiveTableInputError(`There is no column "${key}"`);
    }
    cells[column.id] = normalizeCell(column, value);
  }
  return cells;
}

/** Stored cells read back for the current columns (unknown keys dropped). */
export function parseStoredCells(
  columns: LiveTableColumn[],
  value: unknown
): LiveTableCells {
  const stored =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const cells: LiveTableCells = {};
  for (const column of columns) {
    const cell = stored[column.id];
    cells[column.id] =
      typeof cell === "string" ||
      typeof cell === "number" ||
      typeof cell === "boolean"
        ? cell
        : null;
  }
  return cells;
}

/** The text a cell shows and exports as, for any column type. */
export function cellText(
  column: LiveTableColumn,
  value: LiveTableCell
): string {
  if (value === null || value === undefined) return "";
  if (column.type === "checkbox") return value ? "Yes" : "No";
  return String(value);
}
