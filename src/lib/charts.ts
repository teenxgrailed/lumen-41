/**
 * CHARTS - a chart block a person puts on a project or on Home: progress
 * over time, habit streaks, time spent. The block stores only what to
 * measure (metric, scope, range, style); the numbers are always derived from
 * the person's own tasks, habit completions and time entries when it is read,
 * so a chart can never disagree with the data it draws.
 *
 * Client-safe and pure: the ops (`src/services/ops/ops/charts.ts`) load the
 * rows and turn instants into day keys, these functions do the counting.
 */

export const CHART_METRICS = [
  "task_progress",
  "habit_streak",
  "time_spent",
] as const;
export type ChartMetric = (typeof CHART_METRICS)[number];

export const CHART_STYLES = ["line", "bar"] as const;
export type ChartStyle = (typeof CHART_STYLES)[number];

/** The ranges a chart can show, in days. */
export const CHART_RANGES = [7, 14, 30, 90] as const;
export type ChartRange = (typeof CHART_RANGES)[number];

export const CHART_TITLE_MAX = 80;
/** Charts per place (one project, or Home). */
export const CHARTS_PER_PLACE_MAX = 12;

/** Short names, sized for the 105px form-label column and the add menu. */
export const CHART_METRIC_LABEL: Record<ChartMetric, string> = {
  task_progress: "Progress",
  habit_streak: "Habit streak",
  time_spent: "Time spent",
};

/** The unit a series counts in. */
export const CHART_UNIT: Record<ChartMetric, ChartUnit> = {
  task_progress: "tasks",
  habit_streak: "check-ins",
  time_spent: "minutes",
};
export type ChartUnit = "tasks" | "check-ins" | "minutes";

/** The style a new chart of a metric starts with. */
export const CHART_DEFAULT_STYLE: Record<ChartMetric, ChartStyle> = {
  task_progress: "line",
  habit_streak: "bar",
  time_spent: "bar",
};

export interface ChartPoint {
  /** `YYYY-MM-DD` in the person's time zone. */
  day: string;
  value: number;
  /** Progress only: every task that existed by the end of that day. */
  total?: number;
}

export type ChartSummary =
  | { metric: "task_progress"; done: number; total: number; percent: number }
  | {
      metric: "habit_streak";
      current: number;
      best: number;
      daysKept: number;
    }
  | { metric: "time_spent"; totalMinutes: number; averageMinutes: number };

export interface ChartSeries {
  unit: ChartUnit;
  points: ChartPoint[];
  summary: ChartSummary;
}

/** The stored block, as the API and MCP answer it. */
export interface ChartView {
  id: string;
  title: string;
  metric: ChartMetric;
  style: ChartStyle;
  rangeDays: number;
  /** null = the chart sits on Home. */
  projectId: string | null;
  /** habit_streak only: one habit; null = every habit in scope. */
  habitId: string | null;
  position: number;
  createdAt: string;
  updatedAt: string;
  series?: ChartSeries;
}

export const isChartMetric = (v: unknown): v is ChartMetric =>
  CHART_METRICS.includes(v as ChartMetric);

/** The default title when a person does not give one. */
export function defaultChartTitle(metric: ChartMetric, habitTitle?: string) {
  if (metric === "habit_streak" && habitTitle) return habitTitle;
  return CHART_METRIC_LABEL[metric];
}

// ------------------------------------------------------------- day keys

function keyToUtc(key: string) {
  const [y, m, d] = key.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

function utcToKey(ms: number) {
  return new Date(ms).toISOString().slice(0, 10);
}

/** `days` day keys ending with `lastKey`, oldest first. */
export function chartDays(lastKey: string, days: number): string[] {
  const end = keyToUtc(lastKey);
  const out: string[] = [];
  for (let i = days - 1; i >= 0; i--) out.push(utcToKey(end - i * 86400000));
  return out;
}

/** The day before `key`. */
export function previousDayKey(key: string) {
  return utcToKey(keyToUtc(key) - 86400000);
}

// --------------------------------------------------------------- series

export interface ProgressRow {
  /** Day the task appeared. */
  created: string;
  /** Day it was completed; null while open. */
  completed: string | null;
}

/**
 * Completed tasks against all tasks, as running totals at the end of each
 * day. Tasks created before the range count from its first day.
 */
export function progressSeries(
  days: string[],
  rows: ProgressRow[]
): ChartSeries {
  const points = days.map((day) => {
    let total = 0;
    let value = 0;
    for (const r of rows) {
      if (r.created > day) continue;
      total++;
      if (r.completed !== null && r.completed <= day) value++;
    }
    return { day, value, total };
  });
  const last = points[points.length - 1] ?? { value: 0, total: 0 };
  return {
    unit: "tasks",
    points,
    summary: {
      metric: "task_progress",
      done: last.value,
      total: last.total,
      percent: last.total ? Math.round((last.value / last.total) * 100) : 0,
    },
  };
}

/**
 * Check-ins per day, and streaks: a day counts as kept when at least one
 * habit in scope was checked in. The current streak still stands on a day
 * that has not been kept yet, so it runs to today or yesterday. `history`
 * holds every check-in day known (it may reach back past the range), so a
 * long streak is not cut at the chart's left edge.
 */
export function habitSeries(
  days: string[],
  history: string[],
  today: string
): ChartSeries {
  const perDay = new Map<string, number>();
  for (const key of history) perDay.set(key, (perDay.get(key) ?? 0) + 1);
  const points = days.map((day) => ({ day, value: perDay.get(day) ?? 0 }));

  const kept = [...perDay.keys()].sort();
  let best = 0;
  let run = 0;
  let prev: string | null = null;
  for (const key of kept) {
    run = prev !== null && previousDayKey(key) === prev ? run + 1 : 1;
    best = Math.max(best, run);
    prev = key;
  }
  let current = 0;
  let cursor = perDay.has(today) ? today : previousDayKey(today);
  while (perDay.has(cursor)) {
    current++;
    cursor = previousDayKey(cursor);
  }
  return {
    unit: "check-ins",
    points,
    summary: {
      metric: "habit_streak",
      current,
      best,
      daysKept: points.filter((p) => p.value > 0).length,
    },
  };
}

export interface TimeRow {
  day: string;
  minutes: number;
}

/** Minutes tracked per day (timer, manual and focus entries). */
export function timeSeries(days: string[], rows: TimeRow[]): ChartSeries {
  const perDay = new Map<string, number>();
  for (const r of rows)
    perDay.set(r.day, (perDay.get(r.day) ?? 0) + Math.max(0, r.minutes));
  const points = days.map((day) => ({
    day,
    value: Math.round(perDay.get(day) ?? 0),
  }));
  const totalMinutes = points.reduce((a, p) => a + p.value, 0);
  return {
    unit: "minutes",
    points,
    summary: {
      metric: "time_spent",
      totalMinutes,
      averageMinutes: days.length ? Math.round(totalMinutes / days.length) : 0,
    },
  };
}

// ------------------------------------------------------------ captions

/** "1h 20m", "45m", "0m". */
export function formatMinutes(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (!h) return `${m}m`;
  return m ? `${h}h ${m}m` : `${h}h`;
}

/** The one line beside a chart's title. */
export function chartCaption(summary: ChartSummary): string {
  switch (summary.metric) {
    case "task_progress":
      return summary.total
        ? `${summary.done} of ${summary.total} done`
        : "No tasks yet";
    case "habit_streak":
      return summary.current
        ? `${summary.current}-day streak · best ${summary.best}`
        : summary.best
          ? `Best streak ${summary.best}`
          : "No check-ins yet";
    case "time_spent":
      return `${formatMinutes(summary.totalMinutes)} · ${formatMinutes(summary.averageMinutes)} a day`;
  }
}

/** One point read out, for the tooltip and the screen reader. */
export function pointLabel(unit: ChartUnit, p: ChartPoint) {
  if (unit === "tasks") return `${p.day}: ${p.value} of ${p.total ?? 0} done`;
  if (unit === "minutes") return `${p.day}: ${formatMinutes(p.value)}`;
  return `${p.day}: ${p.value} ${p.value === 1 ? "check-in" : "check-ins"}`;
}

// ------------------------------------------------------------- geometry

export const CHART_W = 300;
export const CHART_H = 72;
/** Room above the tallest mark, so a peak is not cut by the frame. */
const HEADROOM = 4;

export interface ChartShape {
  /** Line style: the polyline's points ("x,y x,y"). */
  line: string;
  /** Progress line only: the "all tasks" line, drawn quieter behind. */
  totalLine: string | null;
  /** Bar style: one rect per day (zero days get no rect). */
  bars: { x: number; y: number; w: number; h: number; day: string }[];
  /** The top of the scale, in the series' unit. */
  peak: number;
}

/**
 * Points to SVG geometry in a CHART_W × CHART_H box. The scale starts at
 * zero (a chart that does not start at zero overstates change) and tops out
 * at the largest value drawn, so a flat line is a real quiet stretch.
 */
export function chartShape(
  points: ChartPoint[],
  style: ChartStyle
): ChartShape {
  const n = points.length;
  const peak = Math.max(
    1,
    ...points.map((p) => Math.max(p.value, p.total ?? 0))
  );
  const usable = CHART_H - HEADROOM;
  const y = (v: number) =>
    Math.round((CHART_H - (v / peak) * usable) * 10) / 10;
  const x = (i: number) =>
    n <= 1 ? CHART_W / 2 : Math.round((i / (n - 1)) * CHART_W * 10) / 10;
  const hasTotal = points.some((p) => p.total !== undefined);
  if (style === "line") {
    return {
      line: points.map((p, i) => `${x(i)},${y(p.value)}`).join(" "),
      totalLine: hasTotal
        ? points.map((p, i) => `${x(i)},${y(p.total ?? 0)}`).join(" ")
        : null,
      bars: [],
      peak,
    };
  }
  const slot = CHART_W / Math.max(1, n);
  const w = Math.max(1, Math.round(slot * 0.6 * 10) / 10);
  return {
    line: "",
    totalLine: null,
    bars: points
      .map((p, i) => {
        const top = y(p.value);
        return {
          x: Math.round((i * slot + (slot - w) / 2) * 10) / 10,
          y: top,
          w,
          h: Math.round((CHART_H - top) * 10) / 10,
          day: p.day,
        };
      })
      .filter((b) => b.h > 0),
    peak,
  };
}
