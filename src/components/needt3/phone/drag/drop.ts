/**
 * Where a dropped row goes (phone-tasks.jsx `ptkDropWrite`, the data half):
 * the zone it landed in and the rows around the gap decide a `V3TaskPatch`.
 * Pure; the hook sends the patch through `useUpdateTask` and the toast carries
 * Undo.
 *
 * //todo: the prototype also wrote the row's place in "the one task order".
 * A task has no manual-order column, so a drop changes what the zone says
 * (day, hour, project) and nothing else: in a list that is not sorted by that
 * field, the row lands where the sort puts it (the FLIP settle covers the
 * hop).
 */
import { clock } from "@/lib/needt3/day";
import { at as hourAt, moveDay, placeAt } from "@/lib/needt3/derive";
import type { V3Task, V3TaskPatch } from "@/lib/needt3/map";

import { moved } from "../overlays/strings";
import type { ZoneMode } from "./geometry";

/**
 * A zone, as `<PkDropZone>` declares it.
 *
 *   mode      "move": rows may be reordered here and dropped in · "reorder":
 *             rows of this zone reorder, nothing comes in · "none": locked
 *             (Overdue, Done): a row may only leave
 *   date      a "YYYY-MM-DD" · null = no date (Inbox) · "nb" = the day of the
 *             row it lands next to (`fallback` when it lands alone) ·
 *             undefined = keep its day
 *   timed     the section is sorted by time: the gap is a time slot
 *   projectId set on a move into the zone (null = no project)
 */
export interface ZoneSpec {
  mode: ZoneMode;
  label?: string;
  date?: string | null;
  fallback?: string;
  timed?: boolean;
  projectId?: string | null;
}

/** What phone-drag reports on release. */
export interface DropRequest {
  id: string;
  from: string | null;
  to: string;
  /** The ids of the rows around the gap, in the target zone (null at an end). */
  after: string | null;
  before: string | null;
  folded: boolean;
}

export interface Drop {
  id: string;
  patch: V3TaskPatch;
  /** The toast's words. */
  say: string;
}

/** The phone's times are half hours: a dropped time is too. */
const up = (h: number) => Math.ceil(h * 2 - 1e-6) / 2;
const down = (h: number) => Math.floor(h * 2 + 1e-6) / 2;

type Neighbour = Pick<
  V3Task,
  "dueDate" | "scheduledStart" | "estimatedMinutes"
>;

/**
 * In a section sorted by time the gap is a time: right after the row above,
 * else just before the row below; a time the row already has that sorts there
 * is kept. `null` = the row above has no time, so neither does this one.
 */
export function slotHour(
  t: Neighbour,
  day: string,
  prev: Neighbour | null,
  next: Neighbour | null
): number | null {
  const dur = (x: Neighbour) => (x.estimatedMinutes || 30) / 60;
  const P = prev && prev.dueDate === day ? prev : null;
  const X = next && next.dueDate === day ? next : null;
  const pA = P ? hourAt(P) : null;
  const xA = X ? hourAt(X) : null;
  const own = t.dueDate === day ? hourAt(t) : null;
  const fits =
    own != null && (pA == null ? !P : own >= pA) && (xA == null || own <= xA);
  if (fits) return own;
  if (P && pA == null) return null;
  if (P && pA != null) {
    const c = up(pA + dur(P));
    return (xA != null && c > xA) || c >= 24 ? pA : c;
  }
  if (X && xA != null) {
    const c = down(xA - dur(t));
    return c >= 0 ? c : xA;
  }
  return hourAt(t);
}

export function dropPatch(
  r: DropRequest,
  specs: Readonly<Record<string, ZoneSpec>>,
  list: readonly V3Task[],
  today: string
): Drop | null {
  const find = (id: string | null) =>
    id == null ? null : (list.find((x) => String(x.id) === String(id)) ?? null);
  const t = find(r.id);
  const spec = specs[r.to];
  if (!t || !spec || (spec.mode === "none" && r.to !== r.from)) return null;
  const prev = find(r.after);
  const next = find(r.before);
  const cross = r.to !== r.from;
  const patch: V3TaskPatch = {};
  if (cross && spec.projectId !== undefined) patch.projectId = spec.projectId;

  const day =
    spec.date === "nb"
      ? (prev?.dueDate ?? next?.dueDate ?? spec.fallback ?? t.dueDate ?? today)
      : spec.date === undefined
        ? t.dueDate
        : spec.date;

  if (day == null) {
    if (t.dueDate || t.scheduledStart || t.isFixed)
      Object.assign(patch, {
        dueDate: null,
        scheduledStart: null,
        scheduledEnd: null,
        isFixed: false,
      });
  } else if (spec.timed) {
    const hour = slotHour(t, day, prev, next);
    if (hour == null) {
      if (t.dueDate !== day || t.scheduledStart || t.isFixed)
        Object.assign(patch, {
          dueDate: day,
          scheduledStart: null,
          scheduledEnd: null,
          isFixed: false,
        });
    } else if (hour !== hourAt(t) || day !== t.dueDate) {
      Object.assign(patch, placeAt(t, day, hour, today));
    }
  } else if (day !== t.dueDate) {
    Object.assign(patch, moveDay(t, day, today));
  }

  if (!Object.keys(patch).length) return null;
  const now = hourAt({ ...t, ...patch } as V3Task);
  const timeMoved = now != null && now !== hourAt(t);
  const say = cross
    ? `Moved to ${spec.label ?? r.to}${timeMoved ? ` · ${clock(now)}` : ""}`
    : timeMoved
      ? `Now at ${clock(now)}`
      : moved;
  return { id: t.id, patch, say };
}
