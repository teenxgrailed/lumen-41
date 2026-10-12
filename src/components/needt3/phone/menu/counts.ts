/**
 * The numbers behind menu A's rows and tile marks (prototype mobile-nav.jsx
 * `mnCounts`), read from the data the app already holds: the same hooks the
 * desktop rail reads, no new route. Pure; `now` is the person's local stamp
 * "YYYY-MM-DDTHH:mm" and `nowMs` an instant, so nothing here reads a clock.
 *
 * //todo: one `GET /api/needt/counts` (docs/port/01-data-map.md §4) would
 * replace these client-side counts, and also carry the trash count and the
 * last successful sync, which no existing route returns.
 */
import {
  type Checkin,
  habitDoneOn,
  liveHabits,
  minutesBetween,
} from "@/lib/needt3/derive";
import type { V3Connection } from "@/lib/needt3/hooks/connections";
import type {
  V3Board,
  V3Doc,
  V3Event,
  V3Habit,
  V3MailThread,
  V3Project,
  V3Task,
} from "@/lib/needt3/map";

import { overdueCount, unreadCount } from "../../shell/live";
import type { MenuCounts } from "./status";

/** How long ago, in the words of a grey line: "5 min ago", "2 h ago", "yesterday". */
export function agoLabel(ageMs: number): string {
  const min = Math.floor(Math.max(0, ageMs) / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.floor(h / 24);
  if (d < 2) return "yesterday";
  if (d < 14) return `${d} d ago`;
  return "a while ago";
}

/** The next timed event still to start today: its title, clock time and minutes away. */
export function nextEventOf(
  events: readonly Pick<V3Event, "title" | "startAt" | "isAllDay">[],
  now: string
) {
  const today = now.slice(0, 10);
  let next: (typeof events)[number] | null = null;
  for (const e of events) {
    if (e.isAllDay || e.startAt.slice(0, 10) !== today || e.startAt < now)
      continue;
    if (!next || e.startAt < next.startAt) next = e;
  }
  return next
    ? {
        title: next.title || "Event",
        at: next.startAt.slice(11, 16),
        inMin: minutesBetween(now, next.startAt),
      }
    : null;
}

export interface CountsInput {
  /** "YYYY-MM-DDTHH:mm", the person's local now. */
  now: string;
  /** The same instant in ms (for "edited N min ago"). */
  nowMs: number;
  /** Each source is undefined until it has loaded. */
  tasks?: readonly V3Task[];
  mail?: readonly V3MailThread[];
  events?: readonly V3Event[];
  docs?: readonly V3Doc[];
  /** Instants of each live doc's last edit, in ms, by doc id. */
  docEditedMs?: ReadonlyMap<string, number>;
  boards?: readonly V3Board[];
  projects?: readonly V3Project[];
  habits?: readonly V3Habit[];
  checkins?: readonly Checkin[];
  connections?: readonly V3Connection[];
}

export function buildMenuCounts(i: CountsInput): MenuCounts {
  const today = i.now.slice(0, 10);
  const c: MenuCounts = {};

  if (i.tasks) {
    const open = i.tasks.filter((t) => !t.done);
    c.overdue = overdueCount(i.tasks, today);
    c.today = open.filter((t) => !t.noSlot && t.dueDate === today).length;
    c.open = open.length;
    c.unplaced = open.filter(
      (t) => !t.isFixed && !t.noSlot && !t.scheduledStart
    ).length;
  }

  if (i.mail) c.mail = unreadCount(i.mail);
  if (i.events) c.nextEvent = nextEventOf(i.events, i.now);

  if (i.docs) {
    const live = i.docs.filter((d) => !d.trashedAt);
    c.docs = live.length;
    let latest = -Infinity;
    for (const d of live) {
      const ms = i.docEditedMs?.get(d.id);
      if (ms !== undefined && ms > latest) latest = ms;
    }
    c.docsEdited = Number.isFinite(latest) ? agoLabel(i.nowMs - latest) : null;
  }

  if (i.boards) c.boards = i.boards.filter((b) => !b.trashedAt).length;
  if (i.projects) c.projects = i.projects.filter((p) => !p.archived).length;

  if (i.habits) {
    const live = liveHabits(i.habits);
    c.habits = live.length;
    // Kept today needs the check-in strip; until it loads, none are counted.
    if (i.checkins)
      c.habitsDone = live.filter((h) =>
        habitDoneOn(h.id, today, i.checkins ?? [])
      ).length;
  }

  if (i.connections) {
    c.connected = i.connections.filter((x) => x.state === "connected").length;
    const down = i.connections.filter((x) => x.state !== "connected");
    c.connectionsDown = down.map((x) => x.label);
    c.mailDown = down.filter((x) => x.kind === "mail").map((x) => x.label);
  }

  return c;
}
