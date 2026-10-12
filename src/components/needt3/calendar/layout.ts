/* CALENDAR LAYOUT — the pure half of $P/calendar2.jsx (lines 1–206, 480–533).
 *
 * Where a block sits on the week grid (lanes, cascade, the density cap and
 * its "+N" chips), how the Agenda folds a crowded half hour, which time a
 * drop between two agenda rows takes, and which days a view shows. No DOM,
 * no clock, no React: every function is numbers and strings in, numbers and
 * strings out, so the jest suite pins the prototype's behaviour.
 *
 * The prototype keyed a block by day of the month on one fixed week; here a
 * block carries its real day ("YYYY-MM-DD"), so a week can cross a month.
 */
import {
  addDays,
  dayLabel,
  daysBetween,
  hhmm,
  weekday,
} from "@/lib/needt3/derive";

/** First and last hour the week grid draws by default, and px per hour. */
export const C2_START = 7;
export const C2_END = 21;
export const C2_H = 52;
/** A block is drawn at least this tall (+3px gap). */
export const C2_MIN_H = 20;
/** Lanes stay at least this wide; a cascade steps this far right. */
export const C2_MINW = 72;
export const C2_STEP = 14;
export const C2_NEAR = 20 / C2_H;
export const C2_SPLIT_MIN = 64;
/** Gutter for the "+N" chips, and the side-by-side cap (desktop). */
export const C2_GUT = 30;
export const C2_CAP = 3;

/** What a view draws: a task or an event, by day + decimal hour + minutes. */
export interface CalBlock {
  id: string;
  /** "YYYY-MM-DD". */
  date: string;
  /** Decimal hour; null = all day / no hour. */
  at: number | null;
  /** Minutes. */
  len: number;
  title: string;
  done?: boolean;
  event?: boolean;
  /** The person's own event (a Needt calendar of theirs): editable here. */
  own?: boolean;
  /** Part of a recurring series: read-only until occurrences are expanded. */
  recurring?: boolean;
  /** Project name (tasks) for the slot list. */
  project?: string | null;
  draft?: boolean;
}

export type TimedBlock = CalBlock & { at: number };

export interface Placed<B extends TimedBlock = TimedBlock> {
  b: B;
  col: number;
  cols: number;
  cl: number;
  /** Placement in px inside the column (left includes the 4px inset). */
  off?: number;
  left?: number;
  width?: number;
  z?: number;
  /** No measured width yet: place by percent. */
  pct?: boolean;
  split?: boolean;
  full?: number;
  base?: number;
  cascade?: boolean;
  padTop?: number;
}

export interface MoreChip<B extends TimedBlock = TimedBlock> {
  key: string;
  at: number;
  n: number;
  left: number;
  width: number;
  /** Every block touching the half hour, hidden or not. */
  items: B[];
  hidden: string[];
}

export const c2Time = (h: number) => hhmm(h) ?? "";

/** Where a block's drawn rect ends (hours): never shorter than the min height. */
export const c2VEnd = (b: { at: number; len: number }) =>
  b.at + Math.max((b.len / 60) * C2_H, C2_MIN_H + 3) / C2_H;
export const c2End = (b: { at: number; len: number }) => b.at + b.len / 60;
export const c2Slot = (at: number) => Math.floor(at * 2) / 2;

/**
 * Overlap clusters for one day: blocks whose drawn rects touch share a
 * cluster; each takes the first free column, and the cluster's width is its
 * column count.
 */
export function c2Lay<B extends TimedBlock>(list: readonly B[]): Placed<B>[] {
  const sorted = list
    .slice()
    .sort((a, b) => a.at - b.at || c2VEnd(b) - c2VEnd(a));
  const out: Placed<B>[] = [];
  let cluster: { b: B; col: number }[] = [];
  let cEnd = -1;
  let colEnds: number[] = [];
  let cid = 0;
  const flush = () => {
    const n = colEnds.length;
    cluster.forEach((x) => out.push({ ...x, cols: n, cl: cid }));
    cid++;
    cluster = [];
    colEnds = [];
    cEnd = -1;
  };
  sorted.forEach((b) => {
    if (cluster.length && b.at >= cEnd) flush();
    let col = colEnds.findIndex((e) => e <= b.at);
    if (col < 0) {
      col = colEnds.length;
      colEnds.push(c2VEnd(b));
    } else colEnds[col] = c2VEnd(b);
    cluster.push({ b, col });
    cEnd = Math.max(cEnd, c2VEnd(b));
  });
  flush();
  return out;
}

/** One cluster at width `inner`: the placed blocks and the ones that did not fit. */
export function c2PlaceCluster<B extends TimedBlock>(
  cl: Placed<B>[],
  inner: number,
  capIn: number
): { placed: Placed<B>[]; hidden: Placed<B>[] } {
  let cap = capIn;
  /* More than `cap` deep: plain lanes only — as many as stay >= C2_MINW wide
     (never more than cap); the cascade would stack slivers here. */
  if (cl[0].cols > cap)
    cap = Math.max(1, Math.min(cap, Math.floor(inner / C2_MINW)));
  const hidden = cl.filter((x) => x.col >= cap && !x.b.draft);
  const vis = cl.filter((x) => x.col < cap || x.b.draft);
  const n = Math.min(cl[0].cols, cap);
  if (inner / n >= C2_MINW || cl[0].cols > n)
    return {
      placed: vis.map((x) =>
        Object.assign(x, {
          off: (Math.min(x.col, n - 1) * inner) / n,
          width: inner / n - (n > 1 ? 2 : 0),
          z: 2 + x.col,
        })
      ),
      hidden,
    };
  const placed: Placed<B>[] = [];
  vis.forEach((x, k) => {
    const s = x.b.at;
    const over = placed.filter((p) => c2VEnd(p.b) > s);
    x.z = 2 + k;
    if (!over.length) {
      x.off = 0;
      x.width = inner;
      placed.push(x);
      return;
    }
    const near = over.filter((p) => s - p.b.at < C2_NEAR);
    const p0 = near.length === 1 ? near[0] : null;
    const xEnd = c2VEnd(x.b);
    const pEnd = p0 ? c2VEnd(p0.b) : 0;
    if (
      p0 &&
      (pEnd - xEnd) * C2_H >= 22 &&
      !over.some((p) => p !== p0 && (p.off ?? 0) >= (p0.off ?? 0))
    ) {
      /* Same start, longer one underneath: cascade on top and push the longer
         block's text below this one, so both titles stay readable. */
      x.off = Math.min((p0.off ?? 0) + C2_STEP, inner - C2_MINW);
      x.width = inner - x.off;
      x.cascade = true;
      p0.padTop = Math.max(p0.padTop || 0, (xEnd - p0.b.at) * C2_H);
    } else if (near.length) {
      /* A chain of short back-to-back blocks (09:00, 09:15, 09:30): reuse a
         split column whose block has already ended, as long as nothing still
         running sits in it — two columns instead of a third sliver. */
      const free = placed.find(
        (q) =>
          q.split &&
          over.indexOf(q) < 0 &&
          !over.some(
            (o) =>
              (o.off ?? 0) < (q.off ?? 0) + (q.width ?? 0) &&
              (q.off ?? 0) < (o.off ?? 0) + (o.width ?? 0)
          )
      );
      if (free) {
        Object.assign(x, {
          off: free.off,
          width: free.width,
          split: true,
          full: free.full,
          base: free.base,
        });
        placed.push(x);
        return;
      }
      const grp = near.concat([x]);
      const base = Math.min(...near.map((p) => p.off ?? 0));
      const w = (inner - base) / grp.length;
      if (w < C2_SPLIT_MIN && !x.b.draft) {
        hidden.push(x);
        return;
      }
      grp.forEach((p, q) => {
        p.off = base + q * w;
        p.width = w - (q < grp.length - 1 ? 2 : 0);
        p.split = true;
        p.full = inner - base;
        p.base = base;
      });
    } else {
      x.off = Math.min(
        Math.max(...over.map((p) => p.off ?? 0)) + C2_STEP,
        inner - C2_MINW
      );
      x.width = inner - x.off;
      x.cascade = true;
    }
    placed.push(x);
  });
  return { placed, hidden };
}

/**
 * Placement in px for one day column of width `W` (08.10.26 density cap).
 * Lanes split side by side while each stays >= 72px; below that the cluster
 * cascades. At most `cap` blocks overlap side by side; what does not fit goes
 * into a "+N" chip in its half-hour slot, in a gutter on the right.
 */
export function c2Place<B extends TimedBlock>(
  list: readonly B[],
  W: number,
  cap = C2_CAP
): { placed: Placed<B>[]; more: MoreChip<B>[] } {
  const laid = c2Lay(list);
  const placed: Placed<B>[] = [];
  const more: MoreChip<B>[] = [];
  if (!W) {
    laid.forEach((x) => {
      if (x.col < cap || x.b.draft)
        placed.push({
          ...x,
          pct: true,
          cols: Math.min(x.cols, cap),
          z: 2 + x.col,
        });
    });
    return { placed, more };
  }
  const inner = W - 8;
  let i = 0;
  while (i < laid.length) {
    let j = i;
    while (j < laid.length && laid[j].cl === laid[i].cl) j++;
    const cl = laid.slice(i, j);
    i = j;
    let r = c2PlaceCluster(
      cl.map((x) => ({ ...x })),
      inner,
      cap
    );
    let room = inner;
    /* Anything hidden: give the cluster's chips a gutter and lay it out again. */
    if (r.hidden.length) {
      room = inner - C2_GUT;
      r = c2PlaceCluster(
        cl.map((x) => ({ ...x })),
        room,
        cap
      );
    }
    r.placed.forEach((x) => {
      x.left = 4 + (x.off ?? 0);
      placed.push(x);
    });
    if (r.hidden.length) {
      const slots = new Map<number, B[]>();
      r.hidden.forEach((x) => {
        const k = c2Slot(x.b.at);
        slots.set(k, [...(slots.get(k) ?? []), x.b]);
      });
      slots.forEach((hiddenHere, at) => {
        const items = list
          .filter((b) => !b.draft && b.at < at + 0.5 && c2End(b) > at)
          .sort((a, b) => a.at - b.at || c2End(b) - c2End(a));
        more.push({
          key: `more-${hiddenHere[0].date}-${at}`,
          at,
          n: hiddenHere.length,
          left: 4 + room + 3,
          width: C2_GUT - 5,
          items,
          hidden: hiddenHere.map((b) => b.id),
        });
      });
    }
  }
  return { placed, more };
}

/** CSS left / width for a placed block (percent before the column is measured). */
export function c2PosStyle(pos: Partial<Placed> | null | undefined): {
  left: string | number;
  width: string | number;
} {
  const x = pos ?? {};
  if (x.pct || x.left == null) {
    const c = x.col ?? 0;
    const n = x.cols || 1;
    return {
      left: `calc(${c} * (100% / ${n}) + 4px)`,
      width: `calc(100% / ${n} - 8px)`,
    };
  }
  return { left: x.left, width: x.width ?? 0 };
}

/* ---------- Agenda ---------- */

export type AgendaRow<B extends CalBlock = CalBlock> =
  | { more?: false; b: B }
  | {
      more: true;
      key: string;
      at: number;
      n: number;
      items: (B & { at: number })[];
    };

/**
 * Agenda density: timed rows grouped by half hour; past `cap` rows in one
 * slot the rest fold into a "+N" row that opens the slot list.
 */
export function c2AgendaFold<B extends CalBlock>(
  rows: readonly B[],
  cap = C2_CAP
): AgendaRow<B>[] {
  const out: AgendaRow<B>[] = [];
  const seen = new Map<
    number,
    { n: number; more: Extract<AgendaRow<B>, { more: true }> | null }
  >();
  rows.forEach((b) => {
    if (b.at == null) {
      out.push({ b });
      return;
    }
    const k = c2Slot(b.at);
    const g = seen.get(k) ?? { n: 0, more: null };
    seen.set(k, g);
    g.n++;
    if (g.n <= cap) {
      out.push({ b });
      return;
    }
    if (!g.more) {
      g.more = {
        more: true,
        key: `more-${b.date}-${k}`,
        at: k,
        n: 0,
        items: rows.filter(
          (x): x is B & { at: number } => x.at != null && c2Slot(x.at) === k
        ),
      };
      out.push(g.more);
    }
    g.more.n++;
  });
  return out;
}

const up15 = (h: number) => Math.ceil(h * 4 - 1e-6) / 4;
const down15 = (h: number) => Math.floor(h * 4 + 1e-6) / 4;

function rowEnd(r: AgendaRow) {
  return r.more
    ? Math.max(...r.items.map(c2End))
    : c2End(r.b as { at: number; len: number });
}
const rowAt = (r: AgendaRow) => (r.more ? r.at : (r.b.at ?? 0));

/** The time a drop between `a` (above) and `b` (below) takes. */
export function c2GapTime(a: AgendaRow | null, b: AgendaRow | null) {
  if (a && b) {
    const after = up15(rowEnd(a));
    if (after <= rowAt(b) - 0.25) return after;
    return Math.max(rowAt(a), down15((rowAt(a) + rowAt(b)) / 2));
  }
  if (b) return Math.max(0, down15(rowAt(b) - 0.5));
  if (a) return Math.min(23.75, up15(rowEnd(a)));
  return 9;
}

export type AgendaItem<B extends CalBlock = CalBlock> =
  | { gap: true; key: string; at: number }
  | { gap?: false; row: AgendaRow<B> };

/** Rows with the drop gaps between the timed ones (and before / after them). */
export function c2WithGaps<B extends CalBlock>(
  rows: readonly AgendaRow<B>[]
): AgendaItem<B>[] {
  const out: AgendaItem<B>[] = [];
  let prev: AgendaRow<B> | null = null;
  rows.forEach((r, i) => {
    const timed = r.more || r.b.at != null;
    if (timed)
      out.push({
        gap: true,
        key: `gap-${i}`,
        at: c2GapTime(prev as AgendaRow | null, r as AgendaRow),
      });
    out.push({ row: r });
    if (timed) prev = r;
  });
  if (prev)
    out.push({
      gap: true,
      key: "gap-end",
      at: c2GapTime(prev as AgendaRow, null),
    });
  return out;
}

/* ---------- days, hours, free slot ---------- */

export const WD_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const WD_LONG = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

export interface CalDay {
  /** "YYYY-MM-DD". */
  date: string;
  /** Day of the month. */
  n: number;
  /** "Mon". */
  wd: string;
  /** "Monday". */
  long: string;
  /** "Sep". */
  mo: string;
  weekend: boolean;
}

export function calDay(date: string): CalDay {
  const w = weekday(date);
  const label = dayLabel(date) ?? "";
  const [n, mo] = label.split(" ");
  return {
    date,
    n: Number(n),
    wd: WD_SHORT[w],
    long: WD_LONG[w],
    mo: mo ?? "",
    weekend: w === 0 || w === 6,
  };
}

/** `n` consecutive days from `from`. */
export function daySpan(from: string, n: number): CalDay[] {
  return Array.from({ length: n }, (_, i) => calDay(addDays(from, i)));
}

/** First day of the week that holds `day` ("monday" or "sunday" start). */
export function weekStart(day: string, startDay: string = "monday") {
  const w = weekday(day);
  const back = startDay === "sunday" ? w : (w + 6) % 7;
  return addDays(day, -back);
}

/** ISO week number of a day. */
export function isoWeek(day: string) {
  const thursday = addDays(day, 3 - ((weekday(day) + 6) % 7));
  const jan4 = `${thursday.slice(0, 4)}-01-04`;
  const firstThursday = addDays(jan4, 3 - ((weekday(jan4) + 6) % 7));
  return 1 + daysBetween(firstThursday, thursday) / 7;
}

/** "31 Aug – 6 Sep · week 36" (week) or "1 Sep – 3 Sep" (a short span). */
export function spanLabel(days: readonly CalDay[], withWeek: boolean) {
  if (!days.length) return "";
  const a = days[0];
  const b = days[days.length - 1];
  const range = `${a.n} ${a.mo} – ${b.n} ${b.mo}`;
  return withWeek ? `${range} · week ${isoWeek(a.date)}` : range;
}

/**
 * The hours the grid draws: 07–21 as designed, widened to hold any block
 * that starts earlier or ends later (real calendars do).
 */
export function hourBounds(blocks: readonly { at: number; len: number }[]) {
  let start = C2_START;
  let end = C2_END;
  blocks.forEach((b) => {
    start = Math.min(start, Math.floor(b.at));
    end = Math.max(end, Math.ceil(c2End(b)));
  });
  return { start: Math.max(0, start), end: Math.min(24, end) };
}

/**
 * First half hour on `date`, from `now` on, where a 60-min event touches
 * nothing; else the next half hour (or the last hour of the grid).
 */
export function freeSlot(
  blocks: readonly { date: string; at: number; len: number }[],
  date: string,
  now: number,
  end = C2_END
) {
  const mine = blocks.filter((b) => b.date === date);
  const first = Math.ceil(now * 2) / 2;
  for (let at = first; at + 1 <= end; at += 0.5) {
    if (!mine.some((b) => at < b.at + b.len / 60 && b.at < at + 1)) return at;
  }
  return Math.min(first, end - 1);
}

/** The half hour a click at `y` px inside a day column lands on. */
export function slotAt(y: number, start: number, end: number) {
  return Math.min(
    Math.max(start + Math.floor(y / (C2_H / 2)) / 2, start),
    end - 1
  );
}
