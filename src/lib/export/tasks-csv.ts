/**
 * The tasks export as CSV (`GET /api/export/tasks?format=csv`). One row per
 * task with the columns a spreadsheet or another planner reads; the JSON
 * export stays the lossless one.
 */

export interface TaskCsvRow {
  title: string;
  description?: string | null;
  status: string;
  priority?: string | null;
  dueDate?: Date | string | null;
  scheduledStart?: Date | string | null;
  scheduledEnd?: Date | string | null;
  estimatedMinutes?: number | null;
  completedAt?: Date | string | null;
  createdAt?: Date | string | null;
  project?: { name: string } | null;
  tags?: readonly { name: string }[] | null;
}

export const TASK_CSV_HEADER = [
  "Title",
  "Status",
  "Project",
  "Due",
  "Scheduled start",
  "Scheduled end",
  "Estimate (min)",
  "Priority",
  "Tags",
  "Notes",
  "Completed",
  "Created",
] as const;

/**
 * One CSV field. Quotes when it holds a comma, quote or line break, and
 * prefixes a cell a spreadsheet would run as a formula (= + - @, tab, CR)
 * with an apostrophe, so an imported title cannot execute when opened.
 */
export function csvField(value: unknown): string {
  let s = value == null ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const iso = (d: Date | string | null | undefined) =>
  d == null ? "" : d instanceof Date ? d.toISOString() : d;

export function tasksToCsv(rows: readonly TaskCsvRow[]): string {
  const lines = [TASK_CSV_HEADER.join(",")];
  for (const t of rows) {
    lines.push(
      [
        t.title,
        t.status,
        t.project?.name ?? "",
        iso(t.dueDate),
        iso(t.scheduledStart),
        iso(t.scheduledEnd),
        t.estimatedMinutes ?? "",
        t.priority ?? "",
        (t.tags ?? []).map((x) => x.name).join("; "),
        t.description ?? "",
        iso(t.completedAt),
        iso(t.createdAt),
      ]
        .map(csvField)
        .join(",")
    );
  }
  // CRLF is what spreadsheets expect; the BOM keeps Excel reading UTF-8.
  return `﻿${lines.join("\r\n")}\r\n`;
}
