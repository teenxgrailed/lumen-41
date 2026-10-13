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
 * //todo: Markdown, Google Docs, .ics and CSV once their import routes exist.
 */
const SOURCES: ReadonlyArray<{
  id: SourceId;
  title: string;
  art: "stack" | "task";
}> = [
  { id: "notion", title: "From Notion", art: "stack" },
  { id: "todoist", title: "From Todoist", art: "task" },
];

/** Import sources worth showing: the feature is on and the server has them set up. */
export function importItems(
  state: ImportsState | undefined,
  start: (source: SourceId) => void
): RichMenuItem[] {
  if (!state?.enabled) return [];
  return SOURCES.filter((s) => state.sources[s.id]?.configured).map((s) => ({
    art: s.art,
    title: s.title,
    onClick: () => start(s.id),
  }));
}
