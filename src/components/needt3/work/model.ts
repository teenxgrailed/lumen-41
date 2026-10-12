/**
 * Tasks and Projects ($P/work.jsx WorkScreen, WkProjectPage, ProjectCard;
 * $P/stores.jsx projectsSorted) as pure functions: v3 tasks and projects in,
 * the sections and numbers the screens draw out. The prototype's fixed week
 * (WK_TODAY = 1, "Wednesday, 2 Sep") becomes the person's own `today`.
 */
import {
  addDays,
  at,
  dayLabel,
  daysBetween,
  weekday,
} from "@/lib/needt3/derive";
import type { V3Project, V3Task } from "@/lib/needt3/map";

export type WorkTab = "inbox" | "today" | "upcoming" | "all";
export type ProjectSort = "manual" | "name" | "open";
/** A Tasks project filter: a project id, or "__none" for No project. */
export type ProjectFilter = string | null;
export const NO_PROJECT = "__none";

/** How many days Upcoming covers after today (prototype: Tomorrow … +6). */
export const UPCOMING_DAYS = 6;

export interface Section {
  /** Stable key (fold state); the title can change with the day. */
  key: string;
  title: string;
  tasks: V3Task[];
  tone?: "late";
}

type WorkTask = Pick<
  V3Task,
  "id" | "done" | "dueDate" | "scheduledStart" | "projectId"
> &
  Partial<Pick<V3Task, "noSlot" | "isFixed">>;

/** Open and due before today. */
export const isOverdue = (t: WorkTask, today: string) =>
  !t.done && !!t.dueDate && t.dueDate < today;

/** By the hour it sits at; unplaced tasks last, order otherwise kept. */
export function byTime<T extends WorkTask>(a: T, b: T) {
  return (at(a) ?? 99) - (at(b) ?? 99);
}

/** By due day (no day last), then by hour. */
export function byDay<T extends WorkTask>(a: T, b: T) {
  const da = a.dueDate ?? "9999-12-31";
  const db = b.dueDate ?? "9999-12-31";
  return da < db ? -1 : da > db ? 1 : byTime(a, b);
}

const sorted = <T extends WorkTask>(l: T[], f: (a: T, b: T) => number) =>
  l.slice().sort(f);

/** The project list in the chosen order. "open" needs the tasks. */
export function projectsSorted<P extends Pick<V3Project, "id" | "name">>(
  list: readonly P[],
  sort: ProjectSort,
  tasks?: readonly WorkTask[]
) {
  const l = list.slice();
  if (sort === "name") l.sort((a, b) => a.name.localeCompare(b.name));
  if (sort === "open" && tasks) {
    const n = (p: P) =>
      tasks.filter((t) => t.projectId === p.id && !t.done && !t.noSlot).length;
    l.sort((a, b) => n(b) - n(a));
  }
  return l;
}

export const readProjectSort = (v: unknown): ProjectSort =>
  v === "name" || v === "open" ? v : "manual";

const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

/** "Tomorrow, 9 Sep" / "Thursday, 10 Sep". */
export function upcomingTitle(day: string, today: string) {
  const name =
    daysBetween(today, day) === 1 ? "Tomorrow" : WEEKDAYS[weekday(day)];
  return `${name}, ${dayLabel(day)}`;
}

export interface WorkModel {
  /** Tasks the screen counts: live, not "no slot", after the project filter. */
  live: V3Task[];
  /** The filter in force (a dropped project clears it). */
  filter: ProjectFilter;
  counts: Record<WorkTab, number | null>;
  sections: Section[];
  done: V3Task[];
}

/**
 * The Tasks / Projects-list body for one tab. Sections hold open tasks
 * only; a ticked task lands in one Done list. Empty sections are dropped.
 * `projects` are the live projects in display order.
 */
export function workModel(opts: {
  tasks: readonly V3Task[];
  projects: readonly Pick<V3Project, "id" | "name">[];
  today: string;
  tab: WorkTab;
  filter?: ProjectFilter;
  /** Projects → List: no Inbox section, Done only from projects. */
  projectsOnly?: boolean;
}): WorkModel {
  const { projects, today, tab, projectsOnly } = opts;
  const liveAll = opts.tasks.filter((t) => !t.noSlot && !t.trashedAt);
  const noneOpen = liveAll.some((t) => !t.projectId && !t.done);
  const ok = (k: string) =>
    k === NO_PROJECT ? noneOpen : projects.some((p) => p.id === k);
  const filter =
    !projectsOnly && opts.filter && ok(opts.filter) ? opts.filter : null;
  const live = filter
    ? liveAll.filter((t) =>
        filter === NO_PROJECT ? !t.projectId : t.projectId === filter
      )
    : liveAll;

  const last = addDays(today, UPCOMING_DAYS);
  const inbox = live.filter((t) => !t.dueDate && !t.isFixed && !t.done);
  const todayL = live.filter((t) => isOverdue(t, today) || t.dueDate === today);
  const upcoming = live.filter(
    (t) =>
      !isOverdue(t, today) &&
      !!t.dueDate &&
      t.dueDate > today &&
      t.dueDate <= last
  );

  let sections: Section[] = [];
  let done: V3Task[] = [];
  if (tab === "inbox") {
    sections = [{ key: "inbox", title: "Inbox", tasks: inbox }];
    done = live.filter((t) => !t.dueDate && !t.isFixed && t.done);
  } else if (tab === "today") {
    sections = [
      {
        key: "overdue",
        title: "Overdue",
        tone: "late",
        tasks: todayL.filter((t) => isOverdue(t, today)),
      },
      {
        key: "today",
        title: "Today",
        tasks: todayL.filter((t) => !isOverdue(t, today)),
      },
    ];
    done = todayL.filter((t) => t.done);
  } else if (tab === "upcoming") {
    for (let i = 1; i <= UPCOMING_DAYS; i++) {
      const day = addDays(today, i);
      sections.push({
        key: `day-${i}`,
        title: upcomingTitle(day, today),
        tasks: upcoming.filter((t) => t.dueDate === day),
      });
    }
    done = upcoming.filter((t) => t.done);
  } else {
    if (!projectsOnly)
      sections.push({ key: "inbox", title: "Inbox", tasks: inbox });
    for (const p of projects)
      sections.push({
        key: `p-${p.id}`,
        title: p.name,
        tasks: live.filter((t) => t.projectId === p.id),
      });
    sections.push({
      key: "none",
      title: "No project",
      tasks: live.filter((t) => !t.projectId && !!t.dueDate),
    });
    const ids = new Set(projects.map((p) => p.id));
    done = live.filter(
      (t) =>
        t.done && (!projectsOnly || (!!t.projectId && ids.has(t.projectId)))
    );
  }
  sections = sections
    .map((s) => ({
      ...s,
      tasks: sorted(
        s.tasks.filter((t) => !t.done),
        byTime
      ),
    }))
    .filter((s) => s.tasks.length);

  return {
    live,
    filter,
    counts: {
      inbox: inbox.length,
      today: todayL.filter((t) => !t.done).length,
      upcoming: upcoming.filter((t) => !t.done).length,
      all: null,
    },
    sections,
    done: sorted(done, byTime),
  };
}

export interface ProjectStats {
  /** Every live task in the project. */
  total: number;
  open: number;
  done: number;
  late: number;
  /** Minutes of open work left (estimates). */
  left: number;
  /** 0…1, done / total. */
  pct: number;
}

export function projectStats(
  projectId: string,
  tasks: readonly V3Task[],
  today: string
): ProjectStats {
  const mine = tasks.filter((t) => t.projectId === projectId);
  const open = mine.filter((t) => !t.done);
  const done = mine.length - open.length;
  return {
    total: mine.length,
    open: open.length,
    done,
    late: open.filter((t) => isOverdue(t, today)).length,
    left: open.reduce((n, t) => n + (t.estimatedMinutes || 0), 0),
    pct: mine.length ? done / mine.length : 0,
  };
}

/** "3 tasks to do" / "All done" / "No tasks yet" (project card). */
export function cardLine(s: Pick<ProjectStats, "open" | "total">) {
  return s.open
    ? `${s.open} tasks to do`
    : s.total
      ? "All done"
      : "No tasks yet";
}

/** "3 open" / "All done" / "No tasks yet" (mini card, project page). */
export function openLine(s: Pick<ProjectStats, "open" | "total">) {
  return s.open ? `${s.open} open` : s.total ? "All done" : "No tasks yet";
}

/** The next open tasks a project card lists, by hour. */
export function cardTasks(projectId: string, tasks: readonly V3Task[], n = 4) {
  return sorted(
    tasks.filter((t) => t.projectId === projectId && !t.done),
    byTime
  ).slice(0, n);
}

/** The project page: open tasks grouped by when, and the Done list. */
export function projectGroups(
  projectId: string,
  tasks: readonly V3Task[],
  today: string
) {
  const mine = tasks.filter((t) => t.projectId === projectId);
  const open = mine.filter((t) => !t.done);
  const late = (t: V3Task) => isOverdue(t, today);
  const groups: Section[] = [
    {
      key: "Overdue",
      title: "Overdue",
      tone: "late" as const,
      tasks: sorted(open.filter(late), byDay),
    },
    {
      key: "Today",
      title: "Today",
      tasks: sorted(
        open.filter((t) => !late(t) && t.dueDate === today),
        byTime
      ),
    },
    {
      key: "Upcoming",
      title: "Upcoming",
      tasks: sorted(
        open.filter((t) => !late(t) && !!t.dueDate && t.dueDate > today),
        byDay
      ),
    },
    {
      key: "No date",
      title: "No date",
      tasks: open.filter((t) => !late(t) && !t.dueDate),
    },
  ].filter((g) => g.tasks.length);
  return {
    groups,
    done: sorted(
      mine.filter((t) => t.done),
      byTime
    ),
  };
}

/** 95 → "1 h 35 min", 60 → "1 h", 20 → "20 min" ($P/work.jsx wkMins). */
export function wkMins(m: number) {
  const h = Math.floor(m / 60);
  const r = m % 60;
  return h ? `${h} h${r ? ` ${r} min` : ""}` : `${r} min`;
}

/** Empty states per tab ($P/work.jsx WK_EMPTY). */
export const WK_EMPTY: Record<WorkTab | "projects", [string, string]> = {
  inbox: ["Inbox is clear", "Anything you jot down without a time lands here."],
  today: ["Nothing due today", "Add a task, or pull one in from Upcoming."],
  upcoming: ["Nothing coming up", "Tasks with a date this week show up here."],
  all: ["No tasks yet", "Press N anywhere to add one."],
  projects: [
    "No open tasks in your projects",
    "Tasks filed under a project show up here.",
  ],
};

/** The five project colours ($P/stores.jsx PROJECT_SWATCHES). */
export const PROJECT_SWATCHES: readonly [string, string][] = [
  ["accent", "var(--accent)"],
  ["info", "var(--info)"],
  ["success", "var(--success)"],
  ["destructive", "var(--destructive)"],
  ["muted", "var(--text-muted)"],
];

/** A project's colour, or the neutral mark when it has none. */
export const projectHue = (p: Pick<V3Project, "color"> | null | undefined) =>
  p?.color || "var(--text-tertiary)";

/** True when `name` is taken by another project (case-insensitive). */
export function nameTaken(
  name: string,
  projects: readonly Pick<V3Project, "id" | "name">[],
  selfId?: string | null
) {
  const n = name.trim().toLowerCase();
  return (
    !!n && projects.some((p) => p.id !== selfId && p.name.toLowerCase() === n)
  );
}
