/**
 * The sidebar Import menu's rows, and which of them have something behind
 * them (prototype Sidebar.jsx / import.jsx). Pure, so the honesty is checked:
 * a row that cannot import yet says so instead of pretending to.
 *
 *   notion     the Notion importer (`POST /api/imports`, the consent screen);
 *              on only while the `imports` flag is on for this person and the
 *              server has the Notion app configured
 *   csv        a CSV of tasks, read in the browser and sent to
 *              `POST /api/import/tasks`
 *   markdown, gdocs, ics
 *              nothing behind them: pages cannot be created with a body
 *              through the API yet, and there is no calendar-file route
 */
import type { ArtName } from "../menu/Art";

export type ImportKind = "markdown" | "notion" | "gdocs" | "ics" | "csv";

export interface ImportRow {
  kind: ImportKind;
  art: ArtName;
  title: string;
  backed: boolean;
  /** Why it is off, for the row's right-hand note. */
  note?: string;
}

/** The slice of `GET /api/imports` the menu reads. */
export interface ImportsFacts {
  enabled: boolean;
  sources: Partial<Record<string, { configured: boolean }>>;
}

export const IMPORT_PROMPT = "Where would you like to import from?";

export function importRows(
  imports: ImportsFacts | null | undefined
): ImportRow[] {
  const notion = !!imports?.enabled && !!imports.sources.notion?.configured;
  return [
    {
      kind: "markdown",
      art: "markdown",
      title: "From Markdown files",
      backed: false,
      note: "Soon",
    },
    {
      kind: "notion",
      art: "stack",
      title: "From Notion",
      backed: notion,
      note: notion ? undefined : "Not set up",
    },
    {
      kind: "gdocs",
      art: "gdoc",
      title: "From Google Docs",
      backed: false,
      note: "Soon",
    },
    {
      kind: "ics",
      art: "calendarfile",
      title: "From a calendar file (.ics)",
      backed: false,
      note: "Soon",
    },
    {
      kind: "csv",
      art: "sheet",
      title: "From a CSV of tasks",
      backed: true,
    },
  ];
}
