/**
 * Plan 11 (docs/plans/11-task-model.md): the shapes a task's progress takes,
 * as pure functions over a task.
 *
 * T-1 — a counter. `0/3` is three unnamed subtasks: parts with an empty
 * title. There is no task type and no extra column; a task whose parts are
 * all unnamed is a counter, and ticking one is "one more done".
 *
 * T-2 — a way in. A task moved to a later day two or more times asks for a
 * two-minute first step (`entry`), which the person writes by hand.
 *
 * T-4 — a value-bearing group. Tasks carry `value` (the asking amount) and
 * `earned` (the amount that came in). A group's headline is money received;
 * what is still listed sits beside it, smaller, as an estimate.
 */
import type { V3Task, V3TaskPart } from "./map";

/** The most a counter counts to: past this it is a habit or a project. */
export const COUNT_MAX = 30; // = MAX_SUBTASKS (src/services/tasks/subtasks.ts)

/** Moves before a task asks for a way in (plan 11 T-2: "two or more times"). */
export const WAY_IN_MOVES = 2;

const unnamed = (p: Pick<V3TaskPart, "title">) => !p.title.trim();

/** The task is a counter: it has parts and none of them has a name. */
export function isCounter(
  parts: readonly Pick<V3TaskPart, "title">[] | null | undefined
) {
  return !!parts?.length && parts.every(unnamed);
}

/** `done` of `total`, for a counter or any list of parts. */
export function partCount(
  parts: readonly Pick<V3TaskPart, "done">[] | null | undefined
) {
  const list = parts ?? [];
  return { done: list.filter((p) => p.done).length, total: list.length };
}

/** A counter can only be set on a task with no named parts. */
export function canCount(
  parts: readonly Pick<V3TaskPart, "title">[] | null | undefined
) {
  return !parts?.length || isCounter(parts);
}

/** Clamp a requested count into what the API accepts. */
export function clampCount(target: number, done: number) {
  const t = Math.max(0, Math.min(COUNT_MAX, Math.floor(target) || 0));
  return { target: t, done: Math.max(0, Math.min(t, Math.floor(done) || 0)) };
}

/**
 * The parts of a counter set to `target`, `done` of them ticked, reusing the
 * ids of `prev` in order so a step keeps its identity across a change.
 */
export function countedParts(
  prev: readonly V3TaskPart[],
  target: number,
  done: number,
  makeId: () => string
): V3TaskPart[] {
  const out: V3TaskPart[] = [];
  for (let i = 0; i < target; i++)
    out.push({ id: prev[i]?.id ?? makeId(), title: "", done: i < done });
  return out;
}

/**
 * The task asks for a way in: still open, no first step written, and moved
 * to a later day at least twice.
 */
export function needsWayIn(
  t: Pick<V3Task, "done" | "entry"> & { moveCount?: number | null }
) {
  return !t.done && !t.entry?.trim() && (t.moveCount ?? 0) >= WAY_IN_MOVES;
}

export interface GroupMoney {
  /** Money that came in: the sum of `earned`. Only ever goes up. */
  earned: number;
  /** Still listed: the asking amount of items with nothing received yet. */
  listed: number;
  /** Items closed with no amount entered — sold, but how much is unknown. */
  unpriced: number;
  /** Tasks that carry an amount at all. */
  items: number;
}

/**
 * The money of a group (a project). Earned is what was received; listed is
 * what is still on offer. An item that sold for less than its asking price
 * leaves `listed` by its asking price and enters `earned` by what it sold
 * for, so no number shown is one the person did not receive. Null when no
 * task in the group carries an amount: a work-only group shows no money slot.
 */
export function groupMoney(
  tasks: readonly Pick<V3Task, "done" | "value" | "earned" | "trashedAt">[]
): GroupMoney | null {
  let earned = 0;
  let listed = 0;
  let unpriced = 0;
  let items = 0;
  for (const t of tasks) {
    if (t.trashedAt) continue;
    if (t.value == null && t.earned == null) continue;
    items++;
    if (t.earned != null) earned += t.earned;
    else if (t.done) unpriced++;
    else listed += t.value ?? 0;
  }
  return items ? { earned, listed, unpriced, items } : null;
}

/** Whole francs, grouped with a narrow no-break space so it never wraps. */
export function chf(amount: number) {
  const n = Math.round(amount * 100) / 100;
  const [whole, frac] = Math.abs(n)
    .toFixed(n % 1 ? 2 : 0)
    .split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `${n < 0 ? "−" : ""}CHF ${grouped}${frac ? `.${frac}` : ""}`;
}

/** The most an amount can be: the columns hold integer cents in an Int4. */
export const AMOUNT_MAX = 20_000_000;

/**
 * An amount as typed, in francs. "" clears it (null); something that is not
 * an amount is undefined, so the caller keeps the last good value.
 * Accepts 1200, 1’200, 1 200, 1,200, 1200.50, 1200,50, 1,234.50, 1.234,50.
 */
export function parseAmount(raw: string): number | null | undefined {
  let s = raw.replace(/[\s\u00A0\u202F'’]|CHF|Fr\.?/gi, "");
  if (!s) return null;
  const dots = s.split(".").length - 1;
  const commas = s.split(",").length - 1;
  if (dots && commas) {
    // Both: the later one is the decimal mark, the other groups thousands.
    const dec = s.lastIndexOf(".") > s.lastIndexOf(",") ? "." : ",";
    const group = dec === "." ? "," : ".";
    s = s.split(group).join("").replace(dec, ".");
  } else if (commas) {
    // One comma before exactly three digits groups thousands; else decimal.
    s =
      commas === 1 && !/,\d{3}$/.test(s)
        ? s.replace(",", ".")
        : s.split(",").join("");
  } else if (dots > 1) {
    s = s.split(".").join("");
  }
  if (!/^\d+(\.\d+)?$/.test(s)) return undefined;
  const n = Number(s);
  return n <= AMOUNT_MAX ? Math.round(n * 100) / 100 : undefined;
}
