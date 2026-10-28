import type { Prisma } from "@prisma/client";

import {
  type GoalCheckInView,
  type GoalProgress,
  type GoalStatus,
  type GoalView,
  isGoalTitle,
} from "@/lib/goals";

/** The Goal columns a view needs. */
export interface GoalRow {
  id: string;
  title: string;
  description: string | null;
  deadline: Date | null;
  area: string | null;
  status: string;
  achievedAt: Date | null;
  parentId: string | null;
  position: number;
  targetValue: number | null;
  currentValue: number | null;
  unit: string | null;
  manualPercent: number | null;
  checkInEnabled: boolean;
  checkInWeekday: number;
  checkInHour: number;
  lastCheckInAt: Date | null;
  sourceTaskId: string | null;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface TaskTally {
  done: number;
  total: number;
}

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value));
}

function result(
  source: GoalProgress["source"],
  ratio: number | null,
  goal: Pick<GoalRow, "currentValue" | "targetValue" | "unit">,
  tally: TaskTally = { done: 0, total: 0 }
): GoalProgress {
  return {
    source,
    ratio,
    percent: ratio === null ? null : Math.round(ratio * 100),
    done: source === "tasks" ? tally.done : 0,
    total: source === "tasks" ? tally.total : 0,
    current: goal.currentValue,
    target: goal.targetValue,
    unit: goal.unit,
  };
}

/** The goal's own manual value as 0..1, or null when it has none. */
export function manualRatio(
  goal: Pick<GoalRow, "targetValue" | "currentValue" | "manualPercent">
): number | null {
  if (
    goal.targetValue !== null &&
    goal.targetValue > 0 &&
    goal.currentValue !== null
  ) {
    return clamp01(goal.currentValue / goal.targetValue);
  }
  if (goal.manualPercent !== null) return clamp01(goal.manualPercent / 100);
  return null;
}

/**
 * One goal's progress, in this order:
 *  1. linked tasks (directly or through a linked project): closed / total;
 *  2. its own manual value (current / target, or a percentage);
 *  3. the average of its subgoals, a dropped one left out and one with no
 *     progress yet counted as zero;
 *  4. nothing yet (`ratio: null`).
 * An achieved goal is complete whatever the numbers say.
 */
export function computeGoalProgress(
  goal: Pick<
    GoalRow,
    "status" | "targetValue" | "currentValue" | "manualPercent" | "unit"
  >,
  tally: TaskTally,
  children: Array<{ status: string; progress: GoalProgress }> = []
): GoalProgress {
  let progress: GoalProgress;
  if (tally.total > 0) {
    progress = result("tasks", tally.done / tally.total, goal, tally);
  } else {
    const manual = manualRatio(goal);
    if (manual !== null) {
      progress = result("manual", manual, goal);
    } else {
      const counted = children.filter((child) => child.status !== "dropped");
      if (counted.length > 0) {
        const sum = counted.reduce(
          (total, child) =>
            total +
            (child.status === "achieved" ? 1 : (child.progress.ratio ?? 0)),
          0
        );
        progress = result("subgoals", sum / counted.length, goal);
      } else {
        progress = result("none", null, goal);
      }
    }
  }
  if (goal.status === "achieved") {
    return { ...progress, ratio: 1, percent: 100 };
  }
  return progress;
}

function iso(value: Date | null) {
  return value ? value.toISOString() : null;
}

export function goalView(
  goal: GoalRow,
  extra: {
    projectIds: string[];
    childIds: string[];
    progress: GoalProgress;
  }
): GoalView {
  return {
    id: goal.id,
    title: goal.title,
    description: goal.description,
    deadline: iso(goal.deadline),
    area: goal.area,
    status: goal.status as GoalStatus,
    achievedAt: iso(goal.achievedAt),
    parentId: goal.parentId,
    position: goal.position,
    targetValue: goal.targetValue,
    currentValue: goal.currentValue,
    unit: goal.unit,
    manualPercent: goal.manualPercent,
    checkIn: {
      enabled: goal.checkInEnabled,
      weekday: goal.checkInWeekday,
      hour: goal.checkInHour,
      lastAt: iso(goal.lastCheckInAt),
    },
    projectIds: extra.projectIds,
    childIds: extra.childIds,
    sourceTaskId: goal.sourceTaskId,
    archivedAt: iso(goal.archivedAt),
    progress: extra.progress,
    createdAt: goal.createdAt.toISOString(),
    updatedAt: goal.updatedAt.toISOString(),
    href: `/goals?goal=${encodeURIComponent(goal.id)}`,
  };
}

export function checkInView(row: {
  id: string;
  goalId: string;
  value: number | null;
  percent: number | null;
  note: string | null;
  createdAt: Date;
}): GoalCheckInView {
  return {
    id: row.id,
    goalId: row.goalId,
    value: row.value,
    percent: row.percent,
    note: row.note,
    createdAt: row.createdAt.toISOString(),
  };
}

type Client = Prisma.TransactionClient;
type Scope = { workspaceId: string } | { userId: string };

/** Tasks that count towards progress: live, not a finished-occurrence record. */
const COUNTED_TASK = {
  isArchived: false,
  trashedAt: null,
  recurrenceMasterId: null,
} as const;

/**
 * Views for `goals`, with progress from one query for links, one for their
 * subgoals and one for every linked task, however many goals there are.
 * Subgoals that are archived do not count.
 */
export async function loadGoalViews(
  client: Client,
  scope: Scope,
  goals: GoalRow[]
): Promise<GoalView[]> {
  if (goals.length === 0) return [];
  const ids = goals.map((goal) => goal.id);
  const known = new Map(goals.map((goal) => [goal.id, goal]));
  const children = (await client.goal.findMany({
    where: { ...scope, parentId: { in: ids }, archivedAt: null },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
  })) as GoalRow[];
  for (const child of children) {
    if (!known.has(child.id)) known.set(child.id, child);
  }
  const all = [...known.values()];
  const allIds = all.map((goal) => goal.id);

  const links = await client.goalProject.findMany({
    where: { goalId: { in: allIds } },
    select: { goalId: true, projectId: true },
  });
  const projectIds = [...new Set(links.map((link) => link.projectId))];
  const rows = await client.task.findMany({
    where: {
      ...scope,
      ...COUNTED_TASK,
      OR: [
        { goalId: { in: allIds } },
        ...(projectIds.length ? [{ projectId: { in: projectIds } }] : []),
      ],
    },
    select: {
      id: true,
      title: true,
      status: true,
      goalId: true,
      projectId: true,
    },
  });

  // A "GOAL:" task stands for a goal, so it is never progress for any goal.
  const tasks = rows.filter((task) => !isGoalTitle(task.title));

  const projectsOf = new Map<string, string[]>();
  for (const link of links) {
    projectsOf.set(link.goalId, [
      ...(projectsOf.get(link.goalId) ?? []),
      link.projectId,
    ]);
  }
  const tallyOf = (goalId: string): TaskTally => {
    const linkedProjects = new Set(projectsOf.get(goalId) ?? []);
    const seen = new Set<string>();
    let done = 0;
    for (const task of tasks) {
      if (seen.has(task.id)) continue;
      if (
        task.goalId === goalId ||
        (task.projectId && linkedProjects.has(task.projectId))
      ) {
        seen.add(task.id);
        if (task.status === "completed") done += 1;
      }
    }
    return { done, total: seen.size };
  };
  const childrenOf = (goalId: string) =>
    all.filter((goal) => goal.parentId === goalId && !goal.archivedAt);

  // One level of subgoals: children first, then the goals that have them.
  const progress = new Map<string, GoalProgress>();
  const progressOf = (goal: GoalRow): GoalProgress => {
    const cached = progress.get(goal.id);
    if (cached) return cached;
    const value = computeGoalProgress(
      goal,
      tallyOf(goal.id),
      childrenOf(goal.id)
        .filter((child) => child.id !== goal.id)
        .map((child) => ({
          status: child.status,
          progress: computeGoalProgress(child, tallyOf(child.id)),
        }))
    );
    progress.set(goal.id, value);
    return value;
  };

  return goals.map((goal) =>
    goalView(goal, {
      projectIds: projectsOf.get(goal.id) ?? [],
      childIds: childrenOf(goal.id).map((child) => child.id),
      progress: progressOf(goal),
    })
  );
}
