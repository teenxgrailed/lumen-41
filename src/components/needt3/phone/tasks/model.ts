/**
 * Phone Tasks and Projects (phone-tasks.jsx) as pure functions: v3 tasks and
 * projects in, the tab's sections, the header numbers, the drop zones and the
 * pull-down's hits out. The prototype's fixed day (MB_TODAY) is the person's
 * own `today` ("YYYY-MM-DD"); nothing here reads the clock.
 *
 * The day rules are the desktop's (`work/model.ts`: isOverdue, byTime, byDay,
 * projectGroups, projectStats); what is particular to the phone is which
 * sections a tab shows, and what a drop into each one means.
 */
import { clock } from "@/lib/needt3/day";
import {
  addDays,
  daysBetween,
  dueLabel,
  at as hourAt,
} from "@/lib/needt3/derive";
import type { V3Project, V3Task } from "@/lib/needt3/map";
import { isOnToday, taskDay } from "@/lib/needt3/task-day";

import {
  UPCOMING_DAYS,
  byDay,
  byTime,
  byTimeOn,
  isOverdue,
  projectGroups,
  upcomingTitle,
} from "../../work/model";
import type { ZoneSpec } from "../drag";
import type { PullHit } from "../kit";
import { copy } from "./strings";

export type PtkTab = "inbox" | "today" | "upcoming" | "all";

export const PTK_TABS: readonly (readonly [PtkTab, string])[] = [
  ["inbox", copy.PTK_TABS.inbox],
  ["today", copy.PTK_TABS.today],
  ["upcoming", copy.PTK_TABS.upcoming],
  ["all", copy.PTK_TABS.all],
];

export interface PtkSection {
  /** Stable key: the fold state and the drop zone are keyed by it. */
  key: string;
  title: string;
  tasks: V3Task[];
  tone?: "late";
  /** Upcoming: the day the section stands for. */
  day?: string;
}

/** The key of the Done zone (a locked one: a row may only leave it). */
export const DONE_ZONE = "Done";
/** Where the Done fold is kept: the desktop's key, so a face swap keeps it shut or open. */
export const DONE_FOLD = "__done";

const pickable = (t: Pick<V3Task, "noSlot" | "trashedAt">) =>
  !t.noSlot && !t.trashedAt;

/** After today and not late: a swipe to "tomorrow" has nothing to do. */
export const isAhead = (
  t: Pick<V3Task, "done" | "dueDate" | "scheduledStart">,
  today: string
) => !isOverdue(t as V3Task, today) && (taskDay(t, today) ?? "") > today;

/** The live project a task is filed under, or null (none, or an archived one). */
export function projectOf(
  id: string | null | undefined,
  projects: readonly V3Project[]
) {
  return id ? (projects.find((p) => p.id === id) ?? null) : null;
}

export interface PtkModel {
  /** Tasks the screen counts: live, not "no slot". */
  live: V3Task[];
  /** Everything the tab covers, done ones included. */
  scope: V3Task[];
  sections: PtkSection[];
  /** The tab's ticked tasks: one Done fold at the bottom. */
  done: V3Task[];
  counts: Record<PtkTab, number | null>;
}

/**
 * One tab of the Tasks screen. Sections hold open tasks only (sorted by hour
 * on Today, by day then hour elsewhere); the ticked ones sit in `done`. Empty
 * sections are dropped. "All" files a dated task under its live project, else
 * under No project (a project archived elsewhere reads as none).
 */
export function ptkModel(opts: {
  tasks: readonly V3Task[];
  projects: readonly V3Project[];
  today: string;
  tab: PtkTab;
}): PtkModel {
  const { projects, today, tab } = opts;
  const live = opts.tasks.filter(pickable);
  const last = addDays(today, UPCOMING_DAYS);
  const dayOf = (t: V3Task) => taskDay(t, today);
  const inbox = live.filter((t) => !dayOf(t) && !t.isFixed);
  // Today = overdue (due before today) + due or scheduled today
  const todayL = live.filter((t) => isOverdue(t, today) || isOnToday(t, today));
  const upcoming = live.filter(
    (t) => isAhead(t, today) && (dayOf(t) as string) <= last
  );
  const scope = { inbox, today: todayL, upcoming, all: live }[tab];

  let sections: PtkSection[] = [];
  if (tab === "inbox")
    sections = [{ key: "inbox", title: copy.PtkTasks.inbox, tasks: inbox }];
  else if (tab === "today")
    sections = [
      {
        key: "overdue",
        title: "Overdue",
        tone: "late",
        tasks: todayL.filter((t) => isOverdue(t, today)),
      },
      {
        key: "today",
        title: copy.PtkTasks.today,
        tasks: todayL.filter((t) => !isOverdue(t, today)),
      },
    ];
  else if (tab === "upcoming") {
    const days = [...new Set(upcoming.map((t) => dayOf(t) as string))].sort();
    sections = days.map((day) => ({
      // the desktop's key (day-1 = tomorrow): both faces fold the same section
      key: `day-${daysBetween(today, day)}`,
      title: upcomingTitle(day, today),
      day,
      tasks: upcoming.filter((t) => dayOf(t) === day),
    }));
  } else {
    const ids = new Set(projects.map((p) => p.id));
    const dated = (t: V3Task) => !!t.dueDate || t.isFixed;
    sections = [
      { key: "inbox", title: copy.PtkTasks.inbox, tasks: inbox },
      ...projects.map((p) => ({
        key: `p-${p.id}`,
        title: p.name,
        tasks: live.filter((t) => t.projectId === p.id && dated(t)),
      })),
      {
        key: "none",
        title: copy.PtkTasks.no_project,
        tasks: live.filter(
          (t) => (!t.projectId || !ids.has(t.projectId)) && dated(t)
        ),
      },
    ];
  }
  sections = sections
    .map((s) => ({
      ...s,
      tasks: s.tasks
        .filter((t) => !t.done)
        .sort(s.key === "today" ? byTimeOn(today) : byDay),
    }))
    .filter((s) => s.tasks.length);

  const open = (l: readonly V3Task[]) => l.filter((t) => !t.done).length;
  return {
    live,
    scope,
    sections,
    done: scope.filter((t) => t.done).sort(byTime),
    counts: {
      inbox: open(inbox),
      today: open(todayL),
      upcoming: open(upcoming),
      all: null,
    },
  };
}

export interface PtkHeader {
  doneN: number;
  total: number;
  openN: number;
  /** Minutes of open work left, rows still leaving not counted. */
  mins: number;
  late: number;
}

/** "Done 3 of 9 · 2 h 50 left · 1 overdue" and the bar: the tab's numbers. */
export function ptkHeader(
  scope: readonly V3Task[],
  today: string,
  busy: Readonly<Record<string, unknown>> = {}
): PtkHeader {
  const open = scope.filter((t) => !t.done);
  return {
    doneN: scope.length - open.length,
    total: scope.length,
    openN: open.length,
    mins: open
      .filter((t) => !busy[t.id])
      .reduce((n, t) => n + (t.estimatedMinutes || 0), 0),
    late: open.filter((t) => isOverdue(t, today)).length,
  };
}

/**
 * What a drop into each section means (`dropPatch` reads it). Overdue and
 * Done are locked: a row may leave them, nothing comes in.
 */
export function ptkSpecs(
  tab: PtkTab,
  sections: readonly PtkSection[],
  projects: readonly V3Project[],
  today: string
): Record<string, ZoneSpec> {
  const specs: Record<string, ZoneSpec> = {
    overdue: { mode: "none" },
    [DONE_ZONE]: { mode: "none" },
  };
  const inbox: ZoneSpec = {
    mode: "move",
    date: null,
    label: copy.PtkTasks.inbox,
  };
  if (tab === "inbox") specs.inbox = inbox;
  if (tab === "today")
    specs.today = {
      mode: "move",
      date: today,
      timed: true,
      label: copy.PtkTasks.today,
    };
  if (tab === "upcoming")
    for (const s of sections)
      if (s.day)
        specs[s.key] = {
          mode: "move",
          date: s.day,
          timed: true,
          // "Tomorrow" / "Thursday": the title before its comma
          label: s.title.split(",")[0],
        };
  if (tab === "all") {
    specs.inbox = inbox;
    for (const p of projects)
      specs[`p-${p.id}`] = {
        mode: "move",
        date: "nb",
        fallback: today,
        timed: true,
        projectId: p.id,
        label: p.name,
      };
    specs.none = {
      mode: "move",
      date: "nb",
      fallback: today,
      timed: true,
      projectId: null,
      label: copy.PtkTasks.no_project,
    };
  }
  return specs;
}

/** A project's page: the drop zones of Overdue / Today / Upcoming / No date. */
export function projectSpecs(today: string): Record<string, ZoneSpec> {
  return {
    Overdue: { mode: "none" },
    [DONE_ZONE]: { mode: "none" },
    Today: {
      mode: "move",
      date: today,
      timed: true,
      label: copy.PtkProjectPage.today,
    },
    Upcoming: {
      mode: "move",
      date: "nb",
      fallback: addDays(today, 1),
      timed: true,
      label: copy.PtkProjectPage.upcoming,
    },
    "No date": {
      mode: "move",
      date: null,
      label: copy.PtkProjectPage.no_date,
    },
  };
}

export { projectGroups };

/* ---------- Projects ---------- */

export interface ProjectRowModel {
  open: V3Task[];
  total: number;
  /** 0…1, done / total. */
  pct: number;
  /** "4 open · next: Call Anna" / "All done" / "No tasks yet". */
  meta: string;
}

export function projectRow(
  p: Pick<V3Project, "id">,
  tasks: readonly V3Task[]
): ProjectRowModel {
  const mine = tasks.filter((t) => t.projectId === p.id);
  const open = mine.filter((t) => !t.done).sort(byDay);
  return {
    open,
    total: mine.length,
    pct: mine.length ? (mine.length - open.length) / mine.length : 0,
    meta: open.length
      ? `${open.length} open · next: ${open[0].title}`
      : mine.length
        ? copy.PtkProjectRow.all_done
        : copy.PtkProjectRow.no_tasks_yet,
  };
}

/** Open tasks filed under a live project (the Projects header's number). */
export function openInProjects(
  tasks: readonly V3Task[],
  projects: readonly Pick<V3Project, "id">[]
) {
  const ids = new Set(projects.map((p) => p.id));
  return tasks.filter((t) => !t.done && !!t.projectId && ids.has(t.projectId))
    .length;
}

/** The ⋯ sheet's Delete line: what happens to the open tasks. */
export function deleteLine(openN: number) {
  const c = copy.PtkProjectPage;
  return openN
    ? `${openN} ${openN === 1 ? c.open_task_moves : c.open_tasks_move} ${c.to_no_project}`
    : c.its_tasks_stay_with_no_project;
}

/** The project edit sheet's rule: a name another project has is taken. */
export { nameTaken } from "../../work/model";

/* ---------- the pull-down ---------- */

/** Titles that hold the query (any case), five at most: the pull-down's search. */
export function taskHits(
  tasks: readonly V3Task[],
  q: string,
  today: string
): PullHit[] {
  const needle = q.trim().toLowerCase();
  if (!needle) return [];
  return tasks
    .filter((t) => t.title.toLowerCase().includes(needle))
    .slice(0, 5)
    .map((t) => {
      const h = hourAt(t);
      const day = t.dueDate
        ? t.dueDate === today
          ? copy.PtkTasks.today
          : (dueLabel(t) ?? copy.PtkTasks.inbox)
        : copy.PtkTasks.inbox;
      return {
        id: t.id,
        title: t.title,
        done: t.done,
        meta: [
          t.done ? copy.PtkTasks.done : isOverdue(t, today) ? "Overdue" : day,
          h != null ? clock(h) : null,
        ]
          .filter(Boolean)
          .join(" · "),
      };
    });
}

/** Project names that hold the query, five at most. */
export function projectHits(
  projects: readonly V3Project[],
  tasks: readonly V3Task[],
  q: string
): PullHit[] {
  const needle = q.trim().toLowerCase();
  if (!needle) return [];
  return projects
    .filter((p) => p.name.toLowerCase().includes(needle))
    .slice(0, 5)
    .map((p) => {
      const n = tasks.filter((t) => t.projectId === p.id && !t.done).length;
      return {
        id: p.id,
        title: p.name,
        meta: n ? `${n} open` : copy.PtkProjectRow.all_done,
      };
    });
}

/** The snack after Delete: the name, and where the open tasks went. */
export function deletedLabel(name: string, openN: number) {
  return `Deleted “${name}”${
    openN
      ? ` — ${openN} ${openN === 1 ? "task" : "tasks"} moved to ${copy.PtkTasks.no_project}`
      : ""
  }`;
}

/** The snack after "Move to today": how many moved. */
export function movedToTodayLabel(n: number) {
  return `${n} ${n === 1 ? "task" : "tasks"} moved to today`;
}
