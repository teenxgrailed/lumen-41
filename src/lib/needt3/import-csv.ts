/**
 * "From a CSV of tasks" (prototype import.jsx `imCsv` / `imTasks`), as a pure
 * function. The header names the columns (title / name / task / content, due /
 * date, project / list, estimate / minutes / duration); without a header the
 * first column is the title. The result is the body `POST /api/import/tasks`
 * takes, so the import runs on the same route Settings → old Import uses.
 */
import { newDate } from "@/lib/date-utils";

export interface CsvTask {
  id: string;
  title: string;
  status: "todo";
  createdAt: string;
  dueDate?: string;
  duration?: number;
  projectId?: string;
}

export interface CsvImportBody {
  tasks: CsvTask[];
  projects: { id: string; name: string; status: "active" }[];
}

/** Rows of cells. Commas or semicolons separate; quotes may hold either. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === "," || c === ";") {
      row.push(cell);
      cell = "";
    } else if (c === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (c !== "\r") cell += c;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((x) => x.trim()));
}

function isoDate(value: string): string | undefined {
  const v = value.trim();
  if (!v) return undefined;
  const d = newDate(v);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

/** The import body for a CSV's rows; empty tasks are dropped. */
export function csvToImport(
  rows: readonly string[][],
  now: Date = newDate()
): CsvImportBody {
  if (!rows.length) return { tasks: [], projects: [] };
  const head = rows[0].map((h) => h.trim().toLowerCase());
  const find = (...keys: string[]) =>
    head.findIndex((h) => keys.some((k) => h.includes(k)));
  let ti = find("title", "name", "task", "content");
  const di = find("due", "date");
  const pi = find("project", "list");
  const ei = find("est", "minute", "duration");
  const hasHead = ti > -1;
  if (!hasHead) ti = 0;

  const projects = new Map<string, string>();
  const created = now.toISOString();
  const tasks: CsvTask[] = [];
  rows.slice(hasHead ? 1 : 0).forEach((r, i) => {
    const title = (r[ti] ?? "").trim();
    if (!title) return;
    const task: CsvTask = {
      id: `csv-${i}`,
      title,
      status: "todo",
      createdAt: created,
    };
    const due = di > -1 ? isoDate(r[di] ?? "") : undefined;
    if (due) task.dueDate = due;
    const minutes = ei > -1 ? parseInt(r[ei] ?? "", 10) : NaN;
    if (minutes > 0) task.duration = minutes;
    const project = pi > -1 ? (r[pi] ?? "").trim() : "";
    if (project) {
      if (!projects.has(project))
        projects.set(project, `csv-project-${projects.size}`);
      task.projectId = projects.get(project);
    }
    tasks.push(task);
  });
  return {
    tasks,
    projects: [...projects].map(([name, id]) => ({
      id,
      name,
      status: "active" as const,
    })),
  };
}
