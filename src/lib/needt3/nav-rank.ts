/**
 * The menu and the sidebar arrange themselves by use, for everyone. Pure,
 * shared by the client and `/api/nav/usage`.
 *
 * One ordered list of places decides both the phone pill (its first three
 * pill places) and the desktop sidebar tiles (its first five sidebar places).
 * Everything lives in `UserSettings.prefs`, so the order, the pins and the
 * counts are readable and writable through `/api/user-settings` as well:
 *
 *   navUsage         { "YYYY-MM-DD": { place: opens } }, the last 14 days
 *   navPinned        place ids that never move
 *   navOrder         the applied order (absent: the order from onboarding)
 *   navOrderPending  { order, moved, at }: the next order, applied on the
 *                    next fresh load of the app, never while it is open
 *   navOrderPrev     the order before the last applied change (Undo)
 *   navRankedAt      when the weekly ranking last ran (ISO)
 *   navReorderTip    { moved, day }: the reorder tip to show, once
 *   navTipAt         the day the last "you can change this" tip was shown
 *   navTipIndex      which tip comes next (they rotate)
 */
import { newDate } from "@/lib/date-utils";

export type NavId =
  | "today"
  | "calendar"
  | "tasks"
  | "docs"
  | "mail"
  | "ask"
  | "projects"
  | "goals"
  | "moodboards"
  | "habits"
  | "templates"
  | "shared"
  | "trash";

export const NAV_IDS: readonly NavId[] = [
  "today",
  "calendar",
  "tasks",
  "docs",
  "mail",
  "ask",
  "projects",
  "goals",
  "moodboards",
  "habits",
  "templates",
  "shared",
  "trash",
];

const NAV_SET = new Set<string>(NAV_IDS);

export const isNavId = (v: unknown): v is NavId =>
  typeof v === "string" && NAV_SET.has(v);

/**
 * The order with no onboarding answers: the phone's three (Home, Docs, Ask)
 * first, then the desktop's other tiles, then the rest of the registry.
 */
export const DEFAULT_NAV_ORDER: readonly NavId[] = [
  "today",
  "docs",
  "ask",
  "calendar",
  "tasks",
  "mail",
  "projects",
  "goals",
  "moodboards",
  "habits",
  "templates",
  "shared",
  "trash",
];

/** What each onboarding answer (`prefs.uses`) puts near the top. */
export const USE_PLACES: Readonly<Record<string, readonly NavId[]>> = {
  work: ["calendar", "tasks", "projects", "mail", "docs"],
  study: ["calendar", "tasks", "docs", "goals"],
  personal: ["tasks", "habits", "calendar", "goals"],
  side: ["projects", "docs", "tasks", "moodboards"],
};

/** Days of counts kept and read. */
export const USAGE_DAYS = 14;
/** How often the order is ranked again. */
export const RANK_EVERY_MS = 7 * 24 * 60 * 60 * 1000;
/** Opens a place needs in the window before it can move up. */
export const MIN_PLACE_OPENS = 3;
/** Opens in the window, all places together, before anything moves at all. */
export const MIN_TOTAL_OPENS = 10;
/** Change tips: at most one per this many days. */
export const TIP_EVERY_DAYS = 7;

export type NavUsage = Record<string, Partial<Record<NavId, number>>>;

export interface NavPending {
  order: NavId[];
  /** The place that moved up the most (named by the tip). */
  moved: NavId;
  at: string;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

/** "YYYY-MM-DD" of an instant, in UTC (the server's day for counts). */
export function utcDay(at: Date): string {
  return at.toISOString().slice(0, 10);
}

function dayMinus(day: string, n: number): string {
  const t = Date.parse(`${day}T00:00:00Z`) - n * 86_400_000;
  return newDate(t).toISOString().slice(0, 10);
}

/** Known ids once each, in order, then every missing id in `fill` order. */
export function normalizeOrder(
  raw: unknown,
  fill: readonly NavId[] = DEFAULT_NAV_ORDER
): NavId[] {
  const out: NavId[] = [];
  if (Array.isArray(raw))
    for (const v of raw) if (isNavId(v) && !out.includes(v)) out.push(v);
  for (const id of fill) if (!out.includes(id)) out.push(id);
  return out;
}

/**
 * The starting order from onboarding (`prefs.uses`, in the order picked):
 * Home first, Ask third (the phone keeps it in the pill), then each answer's
 * places taken in turn, then the default. No answers: the default.
 */
export function baseOrder(uses: unknown): NavId[] {
  const picked = Array.isArray(uses)
    ? uses.filter((u): u is string => typeof u === "string" && u in USE_PLACES)
    : [];
  if (!picked.length) return DEFAULT_NAV_ORDER.slice();
  const lists = picked.map((u) => USE_PLACES[u]);
  const want: NavId[] = [];
  const longest = Math.max(...lists.map((l) => l.length));
  for (let i = 0; i < longest; i++)
    for (const l of lists) if (l[i] && !want.includes(l[i])) want.push(l[i]);
  const rest = want.filter((id) => id !== "today" && id !== "ask");
  return normalizeOrder([
    "today",
    ...rest.slice(0, 1),
    "ask",
    ...rest.slice(1),
  ]);
}

/** The pins, known ids only. */
export function pinnedFrom(prefs: unknown): NavId[] {
  const raw = isRecord(prefs) ? prefs.navPinned : null;
  return Array.isArray(raw)
    ? raw.filter((v, i): v is NavId => isNavId(v) && raw.indexOf(v) === i)
    : [];
}

/** The usage map, cleaned: known days and places, whole positive counts. */
export function usageFrom(prefs: unknown): NavUsage {
  const raw = isRecord(prefs) ? prefs.navUsage : null;
  const out: NavUsage = {};
  if (!isRecord(raw)) return out;
  for (const [day, row] of Object.entries(raw)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !isRecord(row)) continue;
    const clean: Partial<Record<NavId, number>> = {};
    for (const [id, n] of Object.entries(row))
      if (isNavId(id) && typeof n === "number" && n > 0)
        clean[id] = Math.floor(n);
    out[day] = clean;
  }
  return out;
}

/** The pending order, or null. */
export function pendingFrom(prefs: unknown): NavPending | null {
  const raw = isRecord(prefs) ? prefs.navOrderPending : null;
  if (!isRecord(raw) || !Array.isArray(raw.order) || !isNavId(raw.moved))
    return null;
  return {
    order: normalizeOrder(raw.order),
    moved: raw.moved,
    at: typeof raw.at === "string" ? raw.at : "",
  };
}

/** The order in use: the applied one, else the one from onboarding. */
export function currentOrder(prefs: unknown): NavId[] {
  const p = isRecord(prefs) ? prefs : {};
  const base = baseOrder(p.uses);
  return Array.isArray(p.navOrder) ? normalizeOrder(p.navOrder, base) : base;
}

/** One more open of `id` on `day`; days older than the window drop out. */
export function recordOpen(usage: NavUsage, id: NavId, day: string): NavUsage {
  const oldest = dayMinus(day, USAGE_DAYS - 1);
  const out: NavUsage = {};
  for (const [d, row] of Object.entries(usage))
    if (d >= oldest && d <= day) out[d] = { ...row };
  const row = out[day] ?? {};
  row[id] = (row[id] ?? 0) + 1;
  out[day] = row;
  return out;
}

/** Opens per place over the 14 days that end on `now`'s day. */
export function opensInWindow(
  usage: NavUsage,
  now: Date
): Partial<Record<NavId, number>> {
  const today = utcDay(now);
  const oldest = dayMinus(today, USAGE_DAYS - 1);
  const sum: Partial<Record<NavId, number>> = {};
  for (const [d, row] of Object.entries(usage)) {
    if (d < oldest || d > today) continue;
    for (const [id, n] of Object.entries(row))
      sum[id as NavId] = (sum[id as NavId] ?? 0) + (n ?? 0);
  }
  return sum;
}

/**
 * The ranking. `base` is the order in use now; the result is the order to
 * apply next.
 *
 * - Pinned places keep their index in `base`.
 * - Below `MIN_TOTAL_OPENS` opens in the window nothing moves.
 * - The other places with at least `MIN_PLACE_OPENS` opens come first, most
 *   opened first; ties keep their order in `base`. The rest follow in `base`
 *   order, so a place seldom opened never jumps a place nobody opened.
 */
export function rankPlaces(
  usage: NavUsage,
  pinned: readonly NavId[],
  base: readonly NavId[],
  now: Date
): NavId[] {
  const order = normalizeOrder(base);
  const opens = opensInWindow(usage, now);
  const total = Object.values(opens).reduce((a, n) => a + (n ?? 0), 0);
  if (total < MIN_TOTAL_OPENS) return order;
  const pins = new Set(pinned);
  const free = order.filter((id) => !pins.has(id));
  const index = new Map(order.map((id, i) => [id, i]));
  const hot = free
    .filter((id) => (opens[id] ?? 0) >= MIN_PLACE_OPENS)
    .sort(
      (a, b) =>
        (opens[b] ?? 0) - (opens[a] ?? 0) || index.get(a)! - index.get(b)!
    );
  const cold = free.filter((id) => !hot.includes(id));
  const queue = [...hot, ...cold];
  return order.map((id) => (pins.has(id) ? id : (queue.shift() as NavId)));
}

/** The place that rose the most from `from` to `to` (null: nothing rose). */
export function movedUp(
  from: readonly NavId[],
  to: readonly NavId[]
): NavId | null {
  let best: NavId | null = null;
  let gain = 0;
  to.forEach((id, i) => {
    const g = from.indexOf(id) - i;
    if (g > gain) {
      gain = g;
      best = id;
    }
  });
  return best;
}

const sameOrder = (a: readonly NavId[], b: readonly NavId[]) =>
  a.length === b.length && a.every((id, i) => id === b[i]);

/**
 * The server's write after one open: the count, and once a week a ranking
 * that lands in `navOrderPending` when it changes the order. Returns the
 * prefs patch (only nav keys).
 */
export function afterOpen(
  prefs: unknown,
  id: NavId,
  now: Date
): Record<string, unknown> {
  const p = isRecord(prefs) ? prefs : {};
  const usage = recordOpen(usageFrom(p), id, utcDay(now));
  const patch: Record<string, unknown> = { navUsage: usage };
  const last =
    typeof p.navRankedAt === "string" ? Date.parse(p.navRankedAt) : NaN;
  if (!Number.isFinite(last)) {
    // The first week only counts.
    patch.navRankedAt = now.toISOString();
    return patch;
  }
  if (now.getTime() - last < RANK_EVERY_MS || pendingFrom(p)) return patch;
  patch.navRankedAt = now.toISOString();
  const cur = currentOrder(p);
  const next = rankPlaces(usage, pinnedFrom(p), cur, now);
  const moved = movedUp(cur, next);
  if (!sameOrder(cur, next) && moved)
    patch.navOrderPending = { order: next, moved, at: now.toISOString() };
  return patch;
}

/**
 * The order this load of the app draws: a pending order counts as applied
 * (the client writes it on the first load that sees it).
 */
export function effectiveOrder(prefs: unknown): NavId[] {
  return pendingFrom(prefs)?.order ?? currentOrder(prefs);
}

/** The prefs patch that applies a pending order, with its tip. Null: none. */
export function applyPendingPatch(
  prefs: unknown,
  day: string
): Record<string, unknown> | null {
  const pending = pendingFrom(prefs);
  if (!pending) return null;
  return {
    navOrder: pending.order,
    navOrderPrev: currentOrder(prefs),
    navOrderPending: null,
    navReorderTip: { moved: pending.moved, day },
  };
}

/** Undo of an applied reorder: the previous order back, the tip gone. */
export function undoReorderPatch(
  prefs: unknown,
  now: Date
): Record<string, unknown> | null {
  const raw = isRecord(prefs) ? prefs.navOrderPrev : null;
  if (!Array.isArray(raw)) return null;
  return {
    navOrder: normalizeOrder(raw, currentOrder(prefs)),
    navOrderPrev: null,
    navOrderPending: null,
    navReorderTip: null,
    // The undone order holds for another full week.
    navRankedAt: now.toISOString(),
  };
}

/** `prefs` with the pins toggled for `id`. */
export function togglePin(prefs: unknown, id: NavId): NavId[] {
  const pins = pinnedFrom(prefs);
  return pins.includes(id) ? pins.filter((x) => x !== id) : [...pins, id];
}

/**
 * The ranked list both surfaces read. Free has no mailbox, so on Free an
 * unpinned Mailbox is kept out of the first five (the desktop's tiles).
 */
export function rankedPlaces(
  prefs: unknown,
  plan: { free?: boolean } = {}
): NavId[] {
  const order = effectiveOrder(prefs);
  if (!plan.free || pinnedFrom(prefs).includes("mail")) return order;
  const i = order.indexOf("mail");
  if (i < 0 || i >= 5) return order;
  const next: NavId[] = order.filter((id) => id !== "mail");
  next.splice(5, 0, "mail");
  return next;
}

/* ---------- tips ---------- */

export interface NavTip {
  id: string;
  title: string;
  body: string;
}

/** The "you can change this" tips, in turn. */
export const NAV_TIPS: readonly NavTip[] = [
  {
    id: "pin",
    title: "Keep a place where it is",
    body: "Pin it in Settings and it never moves.",
  },
  {
    id: "order",
    title: "Your menu follows what you open",
    body: "Once a week the places you use most move up. Pins stay put.",
  },
  {
    id: "more",
    title: "Every place is still here",
    body: "What is not in the menu waits under More. Pin it to keep it on top.",
  },
];

export type TipPick =
  | { kind: "reorder"; moved: NavId; patch: Record<string, unknown> }
  | { kind: "tip"; tip: NavTip; patch: Record<string, unknown> }
  | null;

/**
 * What to say on this load, at most one thing: the reorder tip on the day it
 * was applied, else a change tip when none was shown in `TIP_EVERY_DAYS`
 * days and no reorder tip was shown today. `patch` marks it shown.
 */
export function pickTip(prefs: unknown, day: string): TipPick {
  const p = isRecord(prefs) ? prefs : {};
  const re = isRecord(p.navReorderTip) ? p.navReorderTip : null;
  if (re && isNavId(re.moved) && re.shown !== true)
    return {
      kind: "reorder",
      moved: re.moved,
      patch: { navReorderTip: { moved: re.moved, day, shown: true } },
    };
  if (re && re.day === day) return null;
  const last = typeof p.navTipAt === "string" ? p.navTipAt : null;
  if (last && last > dayMinus(day, TIP_EVERY_DAYS)) return null;
  const at =
    typeof p.navTipIndex === "number" && p.navTipIndex >= 0
      ? Math.floor(p.navTipIndex)
      : 0;
  const tip = NAV_TIPS[at % NAV_TIPS.length];
  return {
    kind: "tip",
    tip,
    patch: { navTipAt: day, navTipIndex: (at + 1) % NAV_TIPS.length },
  };
}

/** A new account's very first day gets no change tip. */
export function firstDayQuiet(
  createdAt: string | null | undefined,
  day: string
) {
  return !!createdAt && createdAt.slice(0, 10) >= day;
}
