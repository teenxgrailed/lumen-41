/**
 * What the phone composer makes of a typed line: pure, so the rules are
 * provable without a browser. The words are read by the desktop composer's
 * parser (`co-parse.ts`, reused as is); this file only turns its verdict into
 * the draft `useCreateTask` takes (`createDraft`, day.ts) and into the words
 * the date / project / priority chips write back into the line.
 */
import {
  type CoFacetKind,
  type CoParse,
  type CoVocabulary,
  coParse,
} from "@/components/needt/composer/co-parse";

import { toLocalDateKey } from "@/lib/date-utils";
import { createDraft } from "@/lib/needt3/day";
import { toDate } from "@/lib/needt3/derive";
import type { V3Project, V3TaskPatch } from "@/lib/needt3/map";

/**
 * The words this person's projects are known by. Labels stay out of the
 * vocabulary on purpose: a task has no label column yet, and a parser that
 * claims "money" as a label would underline a word the task then forgets.
 */
export function vocabularyOf(projects: readonly V3Project[]): CoVocabulary {
  return {
    projects: projects.map((p) => ({
      id: p.id,
      name: p.name,
      hue: p.color ?? "",
      glyph: p.icon ?? "",
    })),
    aliases: {},
    labels: [],
  };
}

/** A parsed day as the person's "YYYY-MM-DD": their own today decides "tomorrow". */
function dayOfFacet(facet: { text: string; on: Date }, today: string): string {
  const words = facet.text.replace(/^(by|due)\s+/i, "");
  return toDate(words, today) ?? toLocalDateKey(facet.on);
}

export interface ComposedTask {
  draft: V3TaskPatch & { title: string };
  /** Everything after a `/` in the line: parts of the task, one level. */
  parts: string[];
}

/**
 * The task a parse describes. It lands on today unless the line named a day
 * (`createDraft`); a time places it on that day and fixes it there.
 * //todo: `repeat` and labels are parsed but not written; a task has no label
 * column, and the recurrence rule's format is not settled for the phone.
 */
export function composeFromParse(
  p: CoParse,
  today: string
): ComposedTask | null {
  const title = p.title.trim();
  if (!title) return null;
  const f = p.found;
  const draft = createDraft(
    {
      title,
      date: f.date ? dayOfFacet(f.date, today) : null,
      time: f.time ? f.time.minutes / 60 : null,
      duration: f.duration ? f.duration.minutes : null,
      projectId: f.project ? f.project.project.id : undefined,
      priority: f.priority ? f.priority.level : null,
    },
    today
  );
  if (f.deadline) draft.deadline = dayOfFacet(f.deadline, today);
  return { draft, parts: [...p.parts] };
}

/** A typed line → the task it makes, or null while it says nothing. */
export function composeFromLine(
  line: string,
  now: Date,
  today: string,
  projects: readonly V3Project[]
): ComposedTask | null {
  const text = line.trim();
  if (!text) return null;
  return composeFromParse(coParse(text, now, vocabularyOf(projects)), today);
}

/** The chip a facet kind is drawn by: the three the phone composer offers. */
export type ChipKind = Extract<CoFacetKind, "date" | "project" | "priority">;

/**
 * A chip's pick written into the line: the words the line already used for
 * that facet are replaced (so Tomorrow → Fri swaps, never doubles); with
 * nothing there the words are appended; empty `words` removes the facet.
 */
export function writeFacet(
  line: string,
  p: Pick<CoParse, "marks">,
  kind: ChipKind,
  words: string
): string {
  const mark = p.marks.find((m) => m.kind === kind);
  const out = mark
    ? line.slice(0, mark.from) + words + line.slice(mark.to)
    : words
      ? `${line.replace(/\s+$/, "")} ${words}`
      : line;
  return out.replace(/\s{2,}/g, " ").replace(/^\s+/, "");
}

/** The words each chip offers: [label shown, words written into the line]. */
export const CHIP_ROWS: Record<
  Exclude<ChipKind, "project">,
  readonly (readonly [string, string])[]
> = {
  date: [
    ["Today", "today"],
    ["Tomorrow", "tomorrow"],
    ["This weekend", "this weekend"],
    ["Next week", "next week"],
  ],
  priority: [
    ["Urgent", "urgent"],
    ["Important", "important"],
    ["Whenever", "whenever"],
  ],
};

/* ── Adding: nothing is cleared or closed before the server has said yes ─── */

/** A line can be sent when it says something and no send is already running. */
export function canCommit(
  composed: ComposedTask | null,
  pending: boolean
): composed is ComposedTask {
  return composed !== null && !pending;
}

/** What the sheet does once the create call has settled. */
export interface CommitOutcome<T> {
  ok: boolean;
  /** Clear the line and shut the sheet; false keeps both for another try. */
  clear: boolean;
  close: boolean;
  value?: T;
}

/**
 * Run the create call and decide what the sheet does with its answer: on
 * success the line is cleared and the sheet closes; on failure the text stays
 * and the sheet stays open (the write hook has already said what went wrong).
 */
export async function settleCommit<T>(
  send: () => Promise<T>
): Promise<CommitOutcome<T>> {
  try {
    const value = await send();
    return { ok: true, clear: true, close: true, value };
  } catch {
    return { ok: false, clear: false, close: false };
  }
}
