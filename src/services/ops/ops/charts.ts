import { z } from "zod";

import {
  CHARTS_PER_PLACE_MAX,
  CHART_DEFAULT_STYLE,
  CHART_METRICS,
  CHART_RANGES,
  CHART_STYLES,
  CHART_TITLE_MAX,
  type ChartMetric,
  type ChartSeries,
  type ChartStyle,
  type ChartView,
  chartDays,
  defaultChartTitle,
  habitSeries,
  progressSeries,
  timeSeries,
} from "@/lib/charts";
import { formatInTimeZone, newDate } from "@/lib/date-utils";

import { OpError } from "../errors";
import {
  dateOrNull,
  findScopedProject,
  isoOrNull,
  publishTasksUpdated,
  startOfZonedDay,
  touched,
  userTimeZone,
} from "../helpers";
import { defineOp } from "../types";
import type { OpContext } from "../types";

const chartId = z.string().min(1);
const title = z.string().trim().min(1).max(CHART_TITLE_MAX);
const metric = z.enum(CHART_METRICS);
const style = z.enum(CHART_STYLES);
const rangeDays = z
  .number()
  .int()
  .refine((n) => (CHART_RANGES as readonly number[]).includes(n), {
    message: `rangeDays must be one of ${CHART_RANGES.join(", ")}`,
  });

/** How far back streaks are counted, so a long one is not cut at the range. */
const STREAK_HISTORY_DAYS = 400;

export interface ChartRow {
  id: string;
  userId: string;
  workspaceId: string;
  projectId: string | null;
  title: string;
  metric: string;
  habitId: string | null;
  style: string;
  rangeDays: number;
  position: number;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export function chartView(row: ChartRow, series?: ChartSeries): ChartView {
  return {
    id: row.id,
    title: row.title,
    metric: row.metric as ChartMetric,
    style: row.style as ChartStyle,
    rangeDays: row.rangeDays,
    projectId: row.projectId,
    habitId: row.habitId,
    position: row.position,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    ...(series ? { series } : {}),
  };
}

async function findScopedChart(
  ctx: OpContext,
  id: string,
  options: { includeArchived?: boolean } = {}
) {
  const chart = await ctx.tx.chart.findFirst({
    where: {
      id,
      ...ctx.scope,
      ...(options.includeArchived ? {} : { archivedAt: null }),
    },
  });
  if (!chart) throw new OpError("NOT_FOUND", "Chart not found");
  return chart as ChartRow;
}

async function assertHabitUsable(ctx: OpContext, habitId: string) {
  const habit = await ctx.tx.habit.findFirst({
    where: { id: habitId, ...ctx.scope },
    select: { id: true, title: true },
  });
  if (!habit) throw new OpError("INVALID_INPUT", "Unknown habit id");
  return habit;
}

// ---------------------------------------------------------------- series

const dayKeyIn = (instant: Date, timeZone: string) =>
  formatInTimeZone(instant, timeZone, "yyyy-MM-dd");

/**
 * The chart's numbers, from the person's own rows. A project chart counts
 * that project's tasks, habits and tracked time; a Home chart counts the
 * whole workspace.
 */
export async function loadChartSeries(
  ctx: Pick<OpContext, "tx" | "scope" | "userId">,
  chart: ChartRow,
  now: Date = newDate()
): Promise<ChartSeries> {
  const timeZone = await userTimeZone(ctx.tx, ctx.userId);
  const today = dayKeyIn(now, timeZone);
  const days = chartDays(today, chart.rangeDays);
  const from = startOfZonedDay(days[0], timeZone);
  const inProject = chart.projectId ? { projectId: chart.projectId } : {};

  switch (chart.metric as ChartMetric) {
    case "task_progress": {
      const tasks = await ctx.tx.task.findMany({
        where: {
          ...ctx.scope,
          ...inProject,
          trashedAt: null,
          isArchived: false,
          // A repeating task counts once, by its occurrences' master.
          recurrenceMasterId: null,
        },
        select: {
          createdAt: true,
          completedAt: true,
          updatedAt: true,
          status: true,
        },
      });
      return progressSeries(
        days,
        tasks.map((t) => ({
          created: dayKeyIn(t.createdAt, timeZone),
          completed:
            t.status === "completed"
              ? dayKeyIn(t.completedAt ?? t.updatedAt, timeZone)
              : null,
        }))
      );
    }
    case "habit_streak": {
      const since = startOfZonedDay(
        chartDays(today, STREAK_HISTORY_DAYS)[0],
        timeZone
      );
      const completions = await ctx.tx.habitCompletion.findMany({
        where: {
          date: { gte: since },
          habit: chart.habitId
            ? { id: chart.habitId, ...ctx.scope }
            : { ...ctx.scope, ...inProject, archivedAt: null },
        },
        select: { date: true },
      });
      // Completion dates are calendar days stored at UTC midnight.
      return habitSeries(
        days,
        completions.map((c) => c.date.toISOString().slice(0, 10)),
        today
      );
    }
    case "time_spent": {
      const entries = await ctx.tx.timeEntry.findMany({
        where: {
          startedAt: { gte: from },
          endedAt: { not: null },
          task: { ...ctx.scope, ...inProject },
        },
        select: { startedAt: true, endedAt: true },
      });
      return timeSeries(
        days,
        entries.map((e) => ({
          day: dayKeyIn(e.startedAt, timeZone),
          minutes:
            ((e.endedAt as Date).getTime() - e.startedAt.getTime()) / 60000,
        }))
      );
    }
  }
}

async function viewWithSeries(ctx: OpContext, row: ChartRow) {
  return chartView(row, await loadChartSeries(ctx, row));
}

// ----------------------------------------------------------------- reads

export const chartList = defineOp({
  name: "chart.list",
  description:
    "List chart blocks with their series. projectId lists the charts on that project; home: true lists the charts on Home; neither lists every chart. withSeries: false leaves the numbers out.",
  risk: "read",
  input: z
    .object({
      projectId: z.string().min(1).optional(),
      home: z.boolean().optional(),
      withSeries: z.boolean().default(true),
      includeArchived: z.boolean().default(false),
    })
    .strict(),
  async run(ctx, input) {
    const rows = (await ctx.tx.chart.findMany({
      where: {
        ...ctx.scope,
        ...(input.includeArchived ? {} : { archivedAt: null }),
        ...(input.projectId
          ? { projectId: input.projectId }
          : input.home
            ? { projectId: null }
            : {}),
      },
      orderBy: [{ position: "asc" }, { createdAt: "asc" }],
      take: 200,
    })) as ChartRow[];
    const charts = input.withSeries
      ? await Promise.all(rows.map((row) => viewWithSeries(ctx, row)))
      : rows.map((row) => chartView(row));
    return { result: { charts } };
  },
});

export const chartGet = defineOp({
  name: "chart.get",
  description:
    "Read one chart block with its series: one point per day (value, and total for progress) and a summary (progress: done/total/percent; habit streak: current/best/daysKept; time spent: totalMinutes/averageMinutes).",
  risk: "read",
  input: z.object({ chartId }).strict(),
  async run(ctx, input) {
    const chart = await findScopedChart(ctx, input.chartId, {
      includeArchived: true,
    });
    return { result: { chart: await viewWithSeries(ctx, chart) } };
  },
});

// ---------------------------------------------------------------- writes

export const chartCreate = defineOp({
  name: "chart.create",
  description:
    "Add a chart block. metric: task_progress (tasks done against all tasks, over time), habit_streak (check-ins per day and the streak; habitId picks one habit, else every habit in scope), time_spent (tracked minutes per day). projectId puts it on that project and limits it to that project's data; without projectId it goes on Home and counts the whole workspace. style line or bar, rangeDays 7, 14, 30 or 90. Undo removes it.",
  risk: "reversible",
  input: z
    .object({
      metric,
      projectId: z.string().min(1).optional(),
      habitId: z.string().min(1).optional(),
      title: title.optional(),
      style: style.optional(),
      rangeDays: rangeDays.optional(),
    })
    .strict()
    .refine((v) => !v.habitId || v.metric === "habit_streak", {
      message: "habitId only applies to habit_streak",
    }),
  async run(ctx, input) {
    if (input.projectId) await findScopedProject(ctx, input.projectId);
    const habit = input.habitId
      ? await assertHabitUsable(ctx, input.habitId)
      : null;
    const placed = await ctx.tx.chart.findMany({
      where: {
        ...ctx.scope,
        archivedAt: null,
        projectId: input.projectId ?? null,
      },
      select: { position: true },
      orderBy: { position: "desc" },
    });
    if (placed.length >= CHARTS_PER_PLACE_MAX) {
      throw new OpError(
        "INVALID_INPUT",
        `A place holds at most ${CHARTS_PER_PLACE_MAX} charts; remove one first`
      );
    }
    const chart = (await ctx.tx.chart.create({
      data: {
        userId: ctx.userId,
        workspaceId: ctx.workspaceId,
        projectId: input.projectId ?? null,
        habitId: habit?.id ?? null,
        metric: input.metric,
        title: input.title ?? defaultChartTitle(input.metric, habit?.title),
        style: input.style ?? CHART_DEFAULT_STYLE[input.metric],
        rangeDays: input.rangeDays ?? 30,
        position: (placed[0]?.position ?? 0) + 1,
      },
    })) as ChartRow;
    return {
      result: { chart: await viewWithSeries(ctx, chart) },
      before: null,
      inverse: { op: "chart.delete", input: { chartId: chart.id } },
      touched: [touched("chart", chart, null)],
      afterCommit: [publishTasksUpdated(ctx.userId)],
    };
  },
});

/** Columns a chart write may change, and undo may write back. */
const restorable = z
  .object({
    title: z.string(),
    metric: z.string(),
    habitId: z.string().nullable(),
    style: z.string(),
    rangeDays: z.number().int(),
    position: z.number(),
    archivedAt: isoOrNull,
  })
  .partial()
  .strict();
type Restorable = z.infer<typeof restorable>;

function snapshot(row: ChartRow, keys: (keyof Restorable)[]): Restorable {
  const out: Record<string, unknown> = {};
  for (const key of new Set(keys)) {
    const v = row[key];
    out[key] = v instanceof Date ? v.toISOString() : (v ?? null);
  }
  return out as Restorable;
}

export const chartUpdate = defineOp({
  name: "chart.update",
  description:
    "Change a chart block: title, metric, habitId (habit_streak; null = every habit in scope), style (line, bar), rangeDays (7, 14, 30, 90) or position. Undo writes the previous values back.",
  risk: "reversible",
  input: z
    .object({
      chartId,
      title: title.optional(),
      metric: metric.optional(),
      habitId: z.string().min(1).nullable().optional(),
      style: style.optional(),
      rangeDays: rangeDays.optional(),
      position: z.number().finite().optional(),
    })
    .strict()
    .refine((v) => Object.keys(v).length > 1, { message: "Nothing to update" }),
  async run(ctx, input) {
    const chart = await findScopedChart(ctx, input.chartId);
    const { chartId: _id, ...fields } = input;
    void _id;
    const nextMetric = fields.metric ?? chart.metric;
    if (fields.habitId) await assertHabitUsable(ctx, fields.habitId);
    const data: Record<string, unknown> = { ...fields };
    // A habit belongs only to a habit chart.
    if (nextMetric !== "habit_streak") {
      if (fields.habitId) {
        throw new OpError(
          "INVALID_INPUT",
          "habitId only applies to habit_streak"
        );
      }
      if (chart.habitId) data.habitId = null;
    }
    const keys = Object.keys(data) as (keyof Restorable)[];
    const before = snapshot(chart, keys);
    const updated = (await ctx.tx.chart.update({
      where: { id: chart.id },
      data: { ...data, updatedAt: newDate() },
    })) as ChartRow;
    return {
      result: { chart: await viewWithSeries(ctx, updated) },
      before,
      inverse: {
        op: "chart.restore",
        input: { chartId: chart.id, fields: before },
      },
      touched: [touched("chart", updated, chart)],
      afterCommit: [publishTasksUpdated(ctx.userId)],
    };
  },
});

export const chartDelete = defineOp({
  name: "chart.delete",
  description:
    "Remove a chart block. Only the block goes; the tasks, habits and time it drew stay. Undo brings it back.",
  risk: "reversible",
  input: z.object({ chartId }).strict(),
  async run(ctx, input) {
    const chart = await findScopedChart(ctx, input.chartId);
    const updated = (await ctx.tx.chart.update({
      where: { id: chart.id },
      data: { archivedAt: newDate() },
    })) as ChartRow;
    return {
      result: { chart: chartView(updated) },
      before: { archivedAt: null },
      inverse: {
        op: "chart.restore",
        input: { chartId: chart.id, fields: { archivedAt: null } },
      },
      touched: [touched("chart", updated, chart)],
      afterCommit: [publishTasksUpdated(ctx.userId)],
    };
  },
});

/** Inverse-only: writes a chart's previous columns back. */
export const chartRestore = defineOp({
  name: "chart.restore",
  description: "Write stored chart columns back. Used only by undo.",
  risk: "reversible",
  internal: true,
  input: z.object({ chartId, fields: restorable }).strict(),
  async run(ctx, input) {
    const chart = await findScopedChart(ctx, input.chartId, {
      includeArchived: true,
    });
    const keys = Object.keys(input.fields) as (keyof Restorable)[];
    const before = snapshot(chart, keys);
    const data: Record<string, unknown> = { ...input.fields };
    if ("archivedAt" in data)
      data.archivedAt = dateOrNull(input.fields.archivedAt ?? null);
    const updated = (await ctx.tx.chart.update({
      where: { id: chart.id },
      data: { ...data, updatedAt: newDate() },
    })) as ChartRow;
    return {
      result: { chart: chartView(updated) },
      before,
      inverse: {
        op: "chart.restore",
        input: { chartId: chart.id, fields: before },
      },
      touched: [touched("chart", updated, chart)],
      afterCommit: [publishTasksUpdated(ctx.userId)],
    };
  },
});

export const chartOps = [
  chartList,
  chartGet,
  chartCreate,
  chartUpdate,
  chartDelete,
  chartRestore,
];
