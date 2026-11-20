import type { RichMenuItem } from "../menu/RichMenu";

export type SourceId = "notion" | "todoist";

export interface ImportsState {
  enabled: boolean;
  sources: Partial<Record<SourceId, { configured: boolean }>>;
}

/**
 * The prototype's menu offers five sources (Markdown files, Notion, Google
 * Docs, a calendar file, a CSV of tasks). Only Notion and Todoist have a route
 * behind them (`/api/imports`, the same one Settings → Data uses), so those are
 * the entries drawn; the prototype's Notion label is kept, Todoist follows it.
 * The menu also lists the prototype's other rows (`importMenuItems`): a CSV of
 * tasks is backed (read in the browser, sent to `/api/import/tasks`); Markdown
 * files and a calendar file are shown disabled as "Soon" rather
 * than pretending.
 * //todo: Markdown, Google Docs and .ics once pages take a body and a
 * calendar-file route exists.
 * Google Docs is not listed: we hold no real Google Docs mark, and a third-party
 * app is drawn with its own icon or not at all (owner, 20.11.26).
 */
const SOURCES: ReadonlyArray<{
  id: SourceId;
  title: string;
}> = [
  { id: "notion", title: "From Notion" },
  { id: "todoist", title: "From Todoist" },
];

/** Import sources worth showing: the feature is on and the server has them set up. */
export function importItems(
  state: ImportsState | undefined,
  start: (source: SourceId) => void
): RichMenuItem[] {
  if (!state?.enabled) return [];
  return SOURCES.filter((s) => state.sources[s.id]?.configured).map((s) => ({
    brand: s.id,
    title: s.title,
    onClick: () => start(s.id),
  }));
}

const soon = (art: "markdown" | "calendarfile", title: string) =>
  ({ art, title, kbd: "Soon", disabled: true }) satisfies RichMenuItem;

/**
 * The whole menu, in the prototype's order: Markdown, Notion (and Todoist),
 * Google Docs, a calendar file, a CSV of tasks. The CSV row always works, so
 * the button is always there.
 */
export function importMenuItems(
  state: ImportsState | undefined,
  handlers: { start: (source: SourceId) => void; csv: () => void }
): RichMenuItem[] {
  return [
    soon("markdown", "From Markdown files"),
    ...importItems(state, handlers.start),
    soon("calendarfile", "From a calendar file (.ics)"),
    { art: "sheet", title: "From a CSV of tasks", onClick: handlers.csv },
  ];
}
