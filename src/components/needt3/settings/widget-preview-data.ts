/* The rows the Settings -> Widgets preview shows. The lab's own week (Tue 27 Oct,
   14:20) is the fallback; when the person has tasks planned for today, their next
   tasks replace it. Pure: `now` and the time zone come in, nothing is read here. */
import { formatInTimeZone, newDate } from "@/lib/date-utils";

export interface PreviewTask {
  title: string;
  /** "HH:MM", or "" when the task has no time. */
  time: string;
  done: boolean;
  /** Area colour (a CSS colour). */
  color: string;
}

export interface PreviewDay {
  weekday: string;
  date: string;
  clock: string;
  /** How far the day has gone, 0..1 (the sun on the arc). */
  dayProgress: number;
  tasks: PreviewTask[];
  left: number;
  done: number;
  /** True when these are the person's own tasks, not the lab's sample. */
  real: boolean;
}

const AREA_COLORS = ["#5b4ee6", "#1f9d8a", "#f0a020", "#e5484d", "#0ea5e9"];

/** Lab D.tasks. */
export const SAMPLE_TASKS: PreviewTask[] = [
  { title: "Reply to emails", time: "09:30", done: true, color: "#5b4ee6" },
  { title: "Review the lecture", time: "11:00", done: true, color: "#1f9d8a" },
  {
    title: "Write the weekly report",
    time: "15:00",
    done: false,
    color: "#5b4ee6",
  },
  { title: "Call mom", time: "16:30", done: false, color: "#f0a020" },
  { title: "Gym", time: "18:00", done: false, color: "#e5484d" },
  { title: "Duolingo", time: "21:00", done: false, color: "#0ea5e9" },
];

export function sampleDay(): PreviewDay {
  return summarize(
    {
      weekday: "Tuesday",
      date: "27 Oct",
      clock: "14:20",
      dayProgress: 0.45,
    },
    SAMPLE_TASKS,
    false
  );
}

function summarize(
  head: Pick<PreviewDay, "weekday" | "date" | "clock" | "dayProgress">,
  tasks: PreviewTask[],
  real: boolean
): PreviewDay {
  const left = tasks.filter((t) => !t.done).length;
  return { ...head, tasks, left, done: tasks.length - left, real };
}

interface ApiTask {
  title?: unknown;
  status?: unknown;
  scheduledStart?: unknown;
  dueDate?: unknown;
  project?: { color?: unknown } | null;
}

function asDate(v: unknown): Date | null {
  if (typeof v !== "string" && typeof v !== "number") return null;
  const d = newDate(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Today's tasks from the `/api/tasks` response, soonest first, finished ones
 * before open ones the way the widget lists them. Falls back to the lab's week
 * when nothing is planned for today.
 */
export function previewDay(
  raw: unknown,
  now: Date,
  timeZone: string
): PreviewDay {
  const head = {
    weekday: formatInTimeZone(now, timeZone, "EEEE"),
    date: formatInTimeZone(now, timeZone, "d MMM"),
    clock: formatInTimeZone(now, timeZone, "HH:mm"),
    dayProgress: dayProgress(now, timeZone),
  };
  if (!Array.isArray(raw)) return { ...sampleDay(), ...head };
  const dayKey = (d: Date) => formatInTimeZone(d, timeZone, "yyyy-MM-dd");
  const today = dayKey(now);
  const rows: { at: Date; task: PreviewTask }[] = [];
  (raw as ApiTask[]).forEach((t, i) => {
    if (typeof t?.title !== "string" || !t.title.trim()) return;
    const at = asDate(t.scheduledStart) ?? asDate(t.dueDate);
    if (!at || dayKey(at) !== today) return;
    const hasTime = asDate(t.scheduledStart) !== null;
    const color =
      typeof t.project?.color === "string" && t.project.color
        ? t.project.color
        : AREA_COLORS[i % AREA_COLORS.length];
    rows.push({
      at,
      task: {
        title: t.title.trim(),
        time: hasTime ? formatInTimeZone(at, timeZone, "HH:mm") : "",
        done: t.status === "completed",
        color,
      },
    });
  });
  if (rows.length === 0) return { ...sampleDay(), ...head };
  rows.sort((a, b) => a.at.getTime() - b.at.getTime());
  // The widget shows the last finished task above the open ones.
  const finished = rows.filter((r) => r.task.done).slice(-1);
  const open = rows.filter((r) => !r.task.done);
  return summarize(
    head,
    [...finished, ...open].map((r) => r.task),
    true
  );
}

/** 08:00 → 22:00 across the arc, clamped. */
export function dayProgress(now: Date, timeZone: string): number {
  const h = Number(formatInTimeZone(now, timeZone, "H"));
  const m = Number(formatInTimeZone(now, timeZone, "m"));
  const p = (h + m / 60 - 8) / 14;
  return Math.min(1, Math.max(0, p));
}

/** Where the Sky sun sits on its arc (lab `arcSun`). */
export function arcSun(
  p: number,
  w: number,
  h: number,
  l: number,
  b: number
): { left: number; top: number } {
  const d = w * (1 + 2 * l);
  const r = d / 2 - 3.5;
  const cx = w / 2;
  const cy = h + b * h - d / 2;
  const vis = Math.min(1, Math.max(0.05, (cy - 8) / r));
  const span = Math.asin(vis);
  const a0 = Math.PI / 2 + span * 0.82;
  const a1 = Math.PI / 2 - span * 0.82;
  const a = a0 + (a1 - a0) * p;
  return { left: cx + r * Math.cos(a), top: cy - r * Math.sin(a) };
}

/** 52 cells of 15 minutes, 08:00 → 21:00, for the Pixel strip (levels 0..3, -1 = now). */
export function pixelLevels(tasks: PreviewTask[], now: string): number[] {
  const cells = Array<number>(52).fill(0);
  const slot = (t: string) => {
    const [h, m] = t.split(":").map(Number);
    return Math.floor(((h - 8) * 60 + m) / 15);
  };
  tasks.forEach((t) => {
    if (!t.time) return;
    const s = slot(t.time);
    for (let i = s; i < s + 2; i += 1)
      if (i >= 0 && i < 52) cells[i] = t.done ? 3 : 2;
  });
  const n = slot(now);
  if (n >= 0 && n < 52) cells[n] = -1;
  return cells;
}
