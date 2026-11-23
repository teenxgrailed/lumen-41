import { dayInZone } from "@/services/scheduling/spread";

import {
  addCalendarDays,
  formatInTimeZone,
  fromZonedTime,
} from "@/lib/date-utils";

/**
 * Pure rules of idea cards (openspec idea-cards). No database, no clock, no AI:
 * every rule takes its inputs, so each one is tested alone.
 */

/* ---------- numbers the owner decided (22.11.2026) ---------- */

/** At most this many cards per local day, counting ones taken or skipped. */
export const CARDS_PER_DAY = 2;
/** Skip hides an idea this long. */
export const SNOOZE_DAYS = 7;
/** The idea is archived on this skip. */
export const ARCHIVE_AFTER_SKIPS = 3;
/** A task overdue this many days is converted by the sweep. */
export const AUTO_OVERDUE_DAYS = 2;
/** The sweep converts at most this many per person per run, and per day. */
export const MAX_CONVERT_PER_RUN = 5;
export const MAX_CONVERT_PER_DAY = 20;
/** Take gives the new task this long when the idea has no estimate. */
export const TAKE_DEFAULT_MINUTES = 30;
/** Where the cards sit: after the Nth visible task. */
export const FIRST_CARD_AFTER = 2;
export const SECOND_CARD_AFTER = 5;

/* ---------- the shape of an idea ---------- */

/** What an idea may not carry, as the error a caller reads. */
export const IDEA_NO_DATES =
  "An idea has no due date, deadline, start date or schedule. Take it to make it a task.";

/**
 * A patch (a task update through the app, the API, the connector or MCP) that
 * asks an idea to carry a date, a schedule, a repeat, or to be started or
 * finished. Refused with `IDEA_NO_DATES`, never silently dropped. A null or
 * false value clears and is always fine, so a client echoing the idea back
 * still works.
 */
export function ideaPatchRefused(patch: object): boolean {
  const fields = patch as Record<string, unknown>;
  const set = (key: string) =>
    fields[key] !== undefined && fields[key] !== null;
  return (
    [
      "dueDate",
      "deadline",
      "startDate",
      "scheduledStart",
      "scheduledEnd",
      "postponedUntil",
      "recurrenceRule",
      "start",
    ].some(set) ||
    fields.isRecurring === true ||
    fields.isAutoScheduled === true ||
    fields.autoSchedule === true ||
    fields.scheduleLocked === true ||
    fields.pinned === true ||
    fields.status === "completed" ||
    fields.status === "in_progress"
  );
}

/* ---------- words ---------- */

/**
 * Whole-word matching without building a regex from data: the title and each
 * listed word or phrase are cut into letter/digit runs, lower-cased and joined
 * by single spaces, then compared as space-padded strings. "listen to" matches
 * "Listen  to" and "LISTEN-TO", and "read" does not match "ready".
 */
const WORD_RUN = /[\p{L}\p{N}]+/gu;

const normalize = (text: string) =>
  ` ${(text.toLowerCase().match(WORD_RUN) ?? []).join(" ")} `;

const wordMatcher = (words: readonly string[]) => {
  const needles = words.map(normalize).filter((w) => w.trim() !== "");
  return (title: string) => {
    const hay = normalize(title);
    return needles.some((needle) => hay.includes(needle));
  };
};

/**
 * Titles that name something optional to read, watch or look at (EN, RU, UK,
 * DE). Whole words only, case-insensitive.
 */
export const ACTIVITY_WORDS = [
  // EN
  "read",
  "reading",
  "watch",
  "watching",
  "listen",
  "listen to",
  "news",
  "tutorial",
  "explore",
  "browse",
  "look at",
  "check out",
  "try out",
  "podcast",
  "article",
  "video",
  // RU
  "прочитать",
  "прочесть",
  "почитать",
  "прочитай",
  "почитай",
  "посмотреть",
  "посмотри",
  "новости",
  "новость",
  "туториал",
  "изучить",
  "глянуть",
  "глянь",
  "послушать",
  "подкаст",
  "статья",
  "статью",
  "видео",
  // UK
  "прочитати",
  "почитати",
  "подивитися",
  "подивись",
  "переглянути",
  "новини",
  "туторіал",
  "вивчити",
  "глянути",
  "послухати",
  "стаття",
  "статтю",
  "відео",
  // DE
  "lesen",
  "durchlesen",
  "ansehen",
  "anschauen",
  "angucken",
  "anhören",
  "nachrichten",
  "tutorial",
  "erkunden",
  "stöbern",
  "ausprobieren",
  "reinschauen",
  "podcast",
  "artikel",
  "video",
] as const;

/**
 * A word that makes a title a commitment, so it stays a task ("Read contract
 * before Friday"). Deliberately wider than the owner's short list: a missed
 * match here only leaves a task a task.
 */
export const COMMITMENT_WORDS = [
  // EN
  "before",
  "by",
  "until",
  "deadline",
  "due",
  "submit",
  "send",
  "pay",
  "call",
  "asap",
  "urgent",
  // RU
  "до",
  "сдать",
  "отправить",
  "оплатить",
  "позвонить",
  "дедлайн",
  "срок",
  "срочно",
  // UK
  "здати",
  "надіслати",
  "відправити",
  "сплатити",
  "подзвонити",
  "термін",
  "терміново",
  // DE
  "vor",
  "bis",
  "frist",
  "abgeben",
  "senden",
  "schicken",
  "bezahlen",
  "zahlen",
  "anrufen",
  "einreichen",
  "dringend",
] as const;

export const hasActivityWord = wordMatcher(ACTIVITY_WORDS);
export const hasCommitmentWord = wordMatcher(COMMITMENT_WORDS);

/** The title reads as an optional activity and carries no commitment. */
export const looksLikeIdea = (title: string) =>
  hasActivityWord(title) && !hasCommitmentWord(title);

/* ---------- days ---------- */

const dayNumber = (key: string) => {
  const [year, month, day] = key.split("-").map(Number);
  return Date.UTC(year, month - 1, day) / 86_400_000;
};

/** Whole calendar days from `from` to `to` (both "YYYY-MM-DD"). */
export const daysBetween = (from: string, to: string) =>
  Math.round(dayNumber(to) - dayNumber(from));

/** Today's key in the zone, and its start and end as instants. */
export function localDay(now: Date, timeZone: string) {
  const key = formatInTimeZone(now, timeZone, "yyyy-MM-dd");
  const [year, month, day] = key.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + 1))
    .toISOString()
    .slice(0, 10);
  return {
    key,
    start: fromZonedTime(`${key}T00:00:00`, timeZone),
    end: fromZonedTime(`${next}T00:00:00`, timeZone),
  };
}

/* ---------- which tasks are really ideas ---------- */

export interface IdeaTaskFacts {
  title: string;
  kind: "TASK" | "IDEA";
  userId: string | null;
  assigneeId: string | null;
  status: string;
  isArchived: boolean;
  trashedAt: Date | null;
  somedayAt: Date | null;
  isSample: boolean;
  isRecurring: boolean;
  recurrenceMasterId: string | null;
  habitId: string | null;
  externalTaskId: string | null;
  hardDeadline: boolean;
  priorityLevel: string;
  priority?: string | null;
  scheduleLocked: boolean;
  isFrozen: boolean;
  /** Subtasks already ticked: the person has started. */
  doneParts: number;
  projectId?: string | null;
  dueDate: Date | null;
  deadline: Date | null;
  rescheduleCount: number;
}

/** The part of the candidate test that needs no clock: what the task is. */
export function isIdeaShape(
  task: IdeaTaskFacts,
  excludedProjectIds: readonly string[] = []
): boolean {
  if (task.kind !== "TASK") return false;
  if (!task.userId) return false;
  if (task.assigneeId && task.assigneeId !== task.userId) return false;
  if (task.projectId && excludedProjectIds.includes(task.projectId)) {
    return false;
  }
  return (
    task.status === "todo" &&
    !task.isArchived &&
    !task.trashedAt &&
    !task.somedayAt &&
    !task.isSample &&
    !task.isRecurring &&
    !task.recurrenceMasterId &&
    !task.habitId &&
    !task.externalTaskId &&
    !task.hardDeadline &&
    task.priorityLevel !== "HIGH" &&
    task.priorityLevel !== "URGENT" &&
    task.priority !== "high" &&
    !task.scheduleLocked &&
    !task.isFrozen &&
    task.doneParts === 0
  );
}

/**
 * Where the task stands against today: `undated` (no due date), `future` (a
 * commitment, left alone), or `due` with how many whole days it is overdue
 * (0 = due today).
 */
export type DueState =
  | { state: "undated" }
  | { state: "future" }
  | { state: "due"; overdueDays: number };

export function dueState(
  task: Pick<IdeaTaskFacts, "dueDate" | "deadline">,
  now: Date,
  timeZone: string
): DueState {
  const due = task.dueDate ?? task.deadline;
  if (!due) return { state: "undated" };
  const day = dayInZone(due, timeZone);
  if (!day) return { state: "undated" };
  const today = formatInTimeZone(now, timeZone, "yyyy-MM-dd");
  const overdueDays = daysBetween(day, today);
  return overdueDays < 0 ? { state: "future" } : { state: "due", overdueDays };
}

/**
 * A task that may be an idea: open, the person's own, not parked, repeating,
 * synced or a sample, not a hard deadline, not high priority, not pinned, not
 * started; the title names an optional activity and no commitment; and it has
 * no due date, is overdue, or was moved to a later day. A future due date is a
 * commitment and is left alone.
 */
export function isIdeaCandidate(
  task: IdeaTaskFacts,
  now: Date,
  timeZone: string,
  excludedProjectIds: readonly string[] = []
): boolean {
  if (!isIdeaShape(task, excludedProjectIds)) return false;
  if (!looksLikeIdea(task.title)) return false;
  const due = dueState(task, now, timeZone);
  if (due.state === "future") return false;
  if (due.state === "undated") return true;
  return due.overdueDays >= 1 || task.rescheduleCount >= 1;
}

/**
 * The sweep converts a candidate that is overdue 2 or more days or has been
 * moved to a later day. A fresh "Read news" with no date that has not slipped
 * stays a task.
 */
export function shouldAutoConvert(
  task: IdeaTaskFacts,
  now: Date,
  timeZone: string,
  excludedProjectIds: readonly string[] = []
): boolean {
  if (!isIdeaCandidate(task, now, timeZone, excludedProjectIds)) return false;
  if (task.rescheduleCount >= 1) return true;
  const due = dueState(task, now, timeZone);
  return due.state === "due" && due.overdueDays >= AUTO_OVERDUE_DAYS;
}

/* ---------- cards ---------- */

/**
 * How many more cards may be shown today. `stampedToday` counts every idea
 * shown today, taken or skipped included, so skipping never opens a slot. A
 * day with no visible task gets one card, not two.
 */
export function cardSlots(input: {
  stampedToday: number;
  visibleTasks: number;
}): number {
  const limit = input.visibleTasks <= 0 ? 1 : CARDS_PER_DAY;
  return Math.max(0, limit - input.stampedToday);
}

/**
 * The position hint of the card at `index` (0-based): the number of visible
 * tasks it sits after. The first card after the 2nd task, the second after the
 * 5th; with fewer tasks, at the end; never the first row when there is a task.
 */
export function cardAfter(index: number, visibleTasks: number): number {
  if (visibleTasks <= 0) return 0;
  const want = index === 0 ? FIRST_CARD_AFTER : SECOND_CARD_AFTER;
  return Math.max(1, Math.min(want, visibleTasks));
}

export interface SkipResult {
  ideaSkipCount: number;
  ideaSnoozedUntil: Date;
  /** The 3rd skip archives the idea so the same card never nags. */
  archive: boolean;
}

export function skipResult(skipCount: number, now: Date): SkipResult {
  const count = skipCount + 1;
  return {
    ideaSkipCount: count,
    ideaSnoozedUntil: addCalendarDays(now, SNOOZE_DAYS),
    archive: count >= ARCHIVE_AFTER_SKIPS,
  };
}

/** An idea can be offered now: not snoozed, not archived or trashed. */
export function isOffered(
  idea: {
    isArchived: boolean;
    trashedAt: Date | null;
    ideaSnoozedUntil: Date | null;
  },
  now: Date
): boolean {
  return (
    !idea.isArchived &&
    !idea.trashedAt &&
    (!idea.ideaSnoozedUntil || idea.ideaSnoozedUntil <= now)
  );
}

/* ---------- the one line ---------- */

const LINE_MAX = 110;

const clip = (text: string, max: number) => {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1).trimEnd()}…` : flat;
};

/** "Moved 3 to Ideas: Read AI agents news, ..." as the person reads it. */
export function movedToIdeasLine(titles: readonly string[]): string {
  const n = titles.length;
  if (n === 0) return "";
  if (n === 1) return clip(`Moved to Ideas: ${clip(titles[0], 60)}`, LINE_MAX);
  const shown = titles.slice(0, 2).map((title) => clip(title, 32));
  const rest = n > 2 ? ", ..." : "";
  return clip(`Moved ${n} to Ideas: ${shown.join(", ")}${rest}`, LINE_MAX);
}
