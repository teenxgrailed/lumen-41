import { loadScheduleInput } from "@/services/scheduling/TaskSchedulingService";

import type { WorkspaceAccess } from "@/lib/auth/workspace-auth";
import { workspaceDataScopeWhere } from "@/lib/auth/workspace-auth";
import { formatInTimeZone, newDate } from "@/lib/date-utils";
import { prisma } from "@/lib/prisma";
import { UNSCHEDULED_REASON_MESSAGES } from "@/lib/scheduling-reasons";

import { occupiedMinutes } from "./capacity";
import {
  type PlacementTrace,
  type ScheduleResult,
  type SchedulingTaskPriority,
  getWorkWindows,
  scheduleTasks,
} from "./engine";

/**
 * "Why this time?" for one auto-scheduled task, built from what the
 * scheduler actually read and decided. It runs the same deterministic pass
 * the live run does, on the same inputs, with a trace and no writes, and
 * says which of those inputs put the task where it is. It never changes a
 * placement; if a fresh pass would put the task somewhere else than it is
 * now, it says so instead of explaining a time the scheduler would not pick.
 */

export type ExplanationFactKind =
  | "pinned"
  | "order"
  | "earliest"
  | "deadline"
  | "hours"
  | "before"
  | "deep-work"
  | "length"
  | "unplaced"
  | "stale";

export interface ExplanationFact {
  kind: ExplanationFactKind;
  /** Short row label (fits the 105px form label column). */
  label: string;
  text: string;
  /** True when the fact is the one that decided the time. */
  decisive?: boolean;
}

export interface ScheduleExplanation {
  taskId: string;
  status: "placed" | "unplaced" | "pinned" | "not-auto" | "not-in-plan";
  /** Where the task is now (database). */
  current: { start: string | null; end: string | null };
  /** Where a fresh pass puts it (first block); null when it does not. */
  planned: { start: string; end: string } | null;
  /** The fresh pass agrees with the current time. */
  upToDate: boolean;
  atRisk: boolean;
  facts: ExplanationFact[];
  /** The inputs read for this task, for API callers building their own view. */
  inputs: {
    priority: SchedulingTaskPriority | null;
    deadline: string | null;
    hardDeadline: boolean;
    energyRequired: string | null;
    estimateMinutes: number | null;
    blockMinutes: number[];
    dependencyIds: string[];
    earliestStart: string | null;
    rank: number | null;
    queueSize: number | null;
  };
  /** Work minutes between the earliest start and the planned start, by what used them. */
  before: {
    workMinutes: number;
    meetingMinutes: number;
    personalMinutes: number;
    fixedTaskMinutes: number;
    tasksAheadMinutes: number;
    tasksAhead: Array<{ id: string; title: string }>;
  } | null;
  timeZone: string | null;
}

type Input = Parameters<typeof scheduleTasks>[0];

const PRIORITY_LABEL: Record<SchedulingTaskPriority, string> = {
  URGENT: "ASAP",
  HIGH: "High",
  MEDIUM: "Medium",
  LOW: "Low",
};

function ordinal(n: number) {
  const tail = n % 100;
  if (tail >= 11 && tail <= 13) return `${n}th`;
  return `${n}${{ 1: "st", 2: "nd", 3: "rd" }[n % 10] ?? "th"}`;
}

export function formatMinutes(minutes: number) {
  const m = Math.max(0, Math.round(minutes));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest ? `${h}h ${rest}m` : `${h}h`;
}

function when(date: Date, timeZone?: string, pattern = "EEE d MMM, HH:mm") {
  return timeZone
    ? formatInTimeZone(date, timeZone, pattern)
    : formatInTimeZone(
        date,
        Intl.DateTimeFormat().resolvedOptions().timeZone,
        pattern
      );
}

function hhmm(date: Date, timeZone?: string) {
  return when(date, timeZone, "HH:mm");
}

/** Work windows of the task's schedule from `from` up to `to`. */
function workWindowsBetween(
  input: Input,
  scheduleId: string | null | undefined,
  from: Date,
  to: Date
) {
  const windows: Array<{ start: Date; end: Date }> = [];
  const seen = new Set<string>();
  // Step by 12h so every calendar day (clock changes included) is visited.
  for (let t = from.getTime() - 12 * 3_600_000; t <= to.getTime(); ) {
    for (const window of getWorkWindows(new Date(t), input.prefs, scheduleId)) {
      const key = window.start.toISOString();
      if (seen.has(key)) continue;
      seen.add(key);
      const start = window.start > from ? window.start : from;
      const end = window.end < to ? window.end : to;
      if (end > start) windows.push({ start, end });
    }
    t += 12 * 3_600_000;
  }
  return windows;
}

function sum(windows: Array<{ start: Date; end: Date }>, busy: typeof windows) {
  return windows.reduce((total, w) => total + occupiedMinutes(w, busy), 0);
}

/**
 * Pure: explains `taskId` from a pass's input, result and trace. Exported for
 * tests; `explainTaskSchedule` loads the inputs and runs the pass.
 */
export function explainPlacement(args: {
  input: Input;
  result: ScheduleResult;
  trace: Map<string, PlacementTrace>;
  taskId: string;
  current: { start: Date | null; end: Date | null };
}): ScheduleExplanation {
  const { input, result, trace, taskId, current } = args;
  const tz = input.prefs.timeZone;
  const task = input.tasks.find((item) => item.id === taskId);
  const placement = trace.get(taskId);
  const blocks = result.blocks
    .filter((block) => block.taskId === taskId)
    .sort((a, b) => a.start.getTime() - b.start.getTime());
  const first = blocks[0] ?? null;
  const atRisk = (result.atRisk ?? []).some((item) => item.taskId === taskId);
  const unplaced = result.unscheduled.find((item) => item.taskId === taskId);
  const upToDate =
    !!first &&
    !!current.start &&
    first.start.getTime() === current.start.getTime();

  const base: ScheduleExplanation = {
    taskId,
    status: "placed",
    current: {
      start: current.start?.toISOString() ?? null,
      end: current.end?.toISOString() ?? null,
    },
    planned: first
      ? { start: first.start.toISOString(), end: first.end.toISOString() }
      : null,
    upToDate,
    atRisk,
    facts: [],
    inputs: {
      priority: task?.priority ?? null,
      deadline: (placement?.deadline ?? task?.deadline)?.toISOString() ?? null,
      hardDeadline: Boolean(task?.hardDeadline),
      energyRequired: task?.energyRequired ?? null,
      estimateMinutes: task
        ? (task.estimatedMinutes ?? task.durationMinutes ?? null)
        : null,
      blockMinutes: placement?.chunkMinutes ?? [],
      dependencyIds: task
        ? [
            ...new Set([
              ...(task.dependsOnId ? [task.dependsOnId] : []),
              ...(task.dependencyIds ?? []),
            ]),
          ]
        : [],
      earliestStart: placement?.earliestStart.toISOString() ?? null,
      rank: placement?.rank ?? null,
      queueSize: placement?.queueSize ?? null,
    },
    before: null,
    timeZone: tz ?? null,
  };

  if (!task) {
    return {
      ...base,
      status: "not-in-plan",
      facts: [
        {
          kind: "unplaced",
          label: "Not planned",
          text: "The planner does not place this task for you: it is assigned to someone else, started, or done.",
          decisive: true,
        },
      ],
    };
  }

  if (task.isFrozen) {
    return {
      ...base,
      status: "pinned",
      upToDate: true,
      facts: [
        {
          kind: "pinned",
          label: "Pinned",
          text: "You set this time. The planner keeps it and plans around it.",
          decisive: true,
        },
      ],
    };
  }

  const titleById = new Map(input.tasks.map((item) => [item.id, item.title]));
  const facts: ExplanationFact[] = [];

  if (unplaced) {
    facts.push({
      kind: "unplaced",
      label: "No time",
      text: UNSCHEDULED_REASON_MESSAGES[unplaced.reason],
      decisive: true,
    });
  }

  if (placement) {
    // The order rule, in the engine's own order (sortTasks).
    const reasons: string[] = [];
    if (task.priority === "URGENT") reasons.push("marked ASAP");
    if (task.hardDeadline && placement.deadline) reasons.push("hard deadline");
    if (placement.deadline)
      reasons.push(`due ${when(placement.deadline, tz, "EEE d MMM")}`);
    if (task.priority !== "URGENT")
      reasons.push(`${PRIORITY_LABEL[task.priority]} priority`);
    facts.push({
      kind: "order",
      label: "In line",
      text:
        placement.rank === 1
          ? `First of ${placement.queueSize} to be placed: ${reasons.join(", ")}.`
          : `${ordinal(placement.rank)} of ${placement.queueSize} to be placed: ${reasons.join(", ")}. Prerequisites go first, then ASAP, hard deadlines, nearer due dates and priority.`,
    });

    if (placement.earliestReason === "dependency") {
      const names = placement.waitedOn
        .map((id) => titleById.get(id))
        .filter((name): name is string => Boolean(name));
      facts.push({
        kind: "earliest",
        label: "Waits for",
        text: `${names.length ? names.map((n) => `“${n}”`).join(", ") : "Another task"} — it can start only after that ends, ${when(placement.earliestStart, tz)}.`,
        decisive: true,
      });
    } else if (placement.earliestReason === "available-from") {
      facts.push({
        kind: "earliest",
        label: "Not before",
        text: `${when(placement.earliestStart, tz)}: its start date or snooze.`,
        decisive:
          !!first &&
          first.start.getTime() - placement.earliestStart.getTime() <
            24 * 3_600_000,
      });
    }

    if (placement.deadline) {
      if (placement.pass === "after-deadline") {
        facts.push({
          kind: "deadline",
          label: "Due",
          text: `${when(placement.deadline, tz)}. No free work time was left before it, so it took the earliest slot after — at risk.`,
          decisive: true,
        });
      } else if (first) {
        const last = blocks[blocks.length - 1];
        const slackHours = Math.round(
          (placement.deadline.getTime() - last.end.getTime()) / 3_600_000
        );
        facts.push({
          kind: "deadline",
          label: task.hardDeadline ? "Hard deadline" : "Due",
          text: `${when(placement.deadline, tz)} — finishes ${slackHours >= 48 ? `${Math.round(slackHours / 24)} days` : `${Math.max(0, slackHours)}h`} before it.`,
        });
      }
    } else {
      facts.push({
        kind: "deadline",
        label: "Due",
        text: "No due date: tasks that have one go ahead of it.",
      });
    }
  }

  if (first && placement) {
    const window = getWorkWindows(
      first.start,
      input.prefs,
      task.scheduleId
    ).find((item) => first.start >= item.start && first.start < item.end);
    facts.push({
      kind: "hours",
      label: "Work hours",
      text: window
        ? `${when(first.start, tz, "EEEE")} ${hhmm(window.start, tz)}–${hhmm(window.end, tz)}${task.scheduleId ? " (its work schedule)" : ""}. Tasks are only placed inside them.`
        : "Inside your work hours.",
    });

    // What used the work time between the earliest start and this slot.
    const work = workWindowsBetween(
      input,
      task.scheduleId,
      placement.earliestStart,
      first.start
    );
    const workMinutes = work.reduce(
      (total, w) => total + (w.end.getTime() - w.start.getTime()) / 60_000,
      0
    );
    const meetings = input.busyBlocks.filter(
      (b) => b.source === "calendar" && !b.id.startsWith("personal:")
    );
    const personal = input.busyBlocks.filter((b) =>
      b.id.startsWith("personal:")
    );
    const fixed = [
      ...input.busyBlocks.filter((b) => b.source !== "calendar"),
      ...result.frozenBlocks,
    ];
    const aheadIds = new Set(placement.placedBefore);
    const ahead = result.blocks.filter((b) => aheadIds.has(b.taskId));
    const aheadInWindow = [
      ...new Set(
        ahead
          .filter((b) => work.some((w) => b.start < w.end && b.end > w.start))
          .map((b) => b.taskId)
      ),
    ];
    const layers = [meetings, personal, fixed, ahead];
    const layered = layers.map(
      (_, i) =>
        sum(work, layers.slice(0, i + 1).flat()) -
        (i ? sum(work, layers.slice(0, i).flat()) : 0)
    );
    const before = {
      workMinutes: Math.round(workMinutes),
      // Each kind counts only time the kinds before it did not already
      // cover, so the parts never add up to more than the work time.
      meetingMinutes: layered[0],
      personalMinutes: layered[1],
      fixedTaskMinutes: layered[2],
      tasksAheadMinutes: layered[3],
      tasksAhead: aheadInWindow.slice(0, 3).map((id) => ({
        id,
        title: titleById.get(id) ?? "Task",
      })),
    };
    base.before = before;

    if (before.workMinutes < placement.chunkMinutes[0]) {
      facts.push({
        kind: "before",
        label: "Earlier",
        text: `This is the first free work time from ${when(placement.earliestStart, tz)}.`,
        decisive: placement.earliestReason === "now",
      });
    } else {
      const parts: string[] = [];
      if (before.meetingMinutes)
        parts.push(
          `${formatMinutes(before.meetingMinutes)} of calendar events`
        );
      if (before.personalMinutes)
        parts.push(`${formatMinutes(before.personalMinutes)} of personal time`);
      if (before.fixedTaskMinutes)
        parts.push(`${formatMinutes(before.fixedTaskMinutes)} of fixed tasks`);
      if (before.tasksAheadMinutes) {
        const names = before.tasksAhead.map((t) => `“${t.title}”`).join(", ");
        const more = aheadInWindow.length - before.tasksAhead.length;
        parts.push(
          `${formatMinutes(before.tasksAheadMinutes)} of tasks ahead in line (${names}${more > 0 ? ` +${more}` : ""})`
        );
      }
      const used =
        before.meetingMinutes +
        before.personalMinutes +
        before.fixedTaskMinutes +
        before.tasksAheadMinutes;
      const gaps = Math.max(0, before.workMinutes - used);
      const tail =
        gaps > 0
          ? ` The other ${formatMinutes(gaps)} were gaps too short for a ${formatMinutes(placement.chunkMinutes[0])} block${placement.spacingMinutes ? ` with ${placement.spacingMinutes} min between things` : ""}${task.energyRequired === "HIGH" ? " or past the deep-work limit" : ""}.`
          : "";
      facts.push({
        kind: "before",
        label: "Earlier",
        text: `${formatMinutes(before.workMinutes)} of work time came first${parts.length ? `: ${parts.join(", ")}` : ""}.${tail}`,
        decisive: placement.earliestReason === "now",
      });
    }

    if (task.energyRequired === "HIGH") {
      facts.push({
        kind: "deep-work",
        label: "Deep work",
        text:
          placement.pass === "relaxed-limits"
            ? `Heavy task. The ${formatMinutes(input.prefs.maxDeepWorkPerDay)} daily deep-work limit was set aside to finish it before the deadline.`
            : `Heavy task: counts toward your ${formatMinutes(input.prefs.maxDeepWorkPerDay)} daily deep-work limit.`,
        decisive: placement.pass === "relaxed-limits",
      });
    }

    const total = placement.chunkMinutes.reduce((a, b) => a + b, 0);
    const estimate = base.inputs.estimateMinutes;
    const pieces =
      placement.chunkMinutes.length > 1
        ? ` in ${placement.chunkMinutes.length} blocks (${placement.chunkMinutes.map((m) => formatMinutes(m)).join(" + ")})`
        : "";
    const adjusted =
      estimate != null && estimate !== total
        ? ` — your ${formatMinutes(estimate)} estimate, adjusted by how long tasks like this take you`
        : estimate == null
          ? " (no estimate, so the default)"
          : " — your estimate";
    const recovery = placement.bufferAfterMinutes
      ? `, with ${formatMinutes(placement.bufferAfterMinutes)} kept free after`
      : "";
    facts.push({
      kind: "length",
      label: "Length",
      text: `${formatMinutes(total)}${pieces}${adjusted}${recovery}.`,
    });
  }

  if (!unplaced && first && current.start && !upToDate) {
    facts.unshift({
      kind: "stale",
      label: "Changed",
      text: `Something changed since this was planned (a task, an event or a setting). With your plan as it is now, it would go to ${when(first.start, tz)} — the reasons below are for that time.`,
      decisive: true,
    });
  }

  return {
    ...base,
    status: unplaced ? "unplaced" : "placed",
    facts,
  };
}

/**
 * Loads the person's scheduling inputs and explains one task. Read-only: the
 * pass runs in memory and nothing is written.
 */
export async function explainTaskSchedule(
  userId: string,
  workspace: WorkspaceAccess,
  taskId: string
): Promise<ScheduleExplanation | null> {
  const task = await prisma.task.findFirst({
    where: { id: taskId, ...workspaceDataScopeWhere(workspace, userId) },
    select: {
      id: true,
      isAutoScheduled: true,
      autoScheduled: true,
      scheduledStart: true,
      scheduledEnd: true,
      lastScheduled: true,
    },
  });
  if (!task) return null;
  const current = { start: task.scheduledStart, end: task.scheduledEnd };
  if (!task.isAutoScheduled && !task.autoScheduled) {
    return {
      taskId,
      status: "not-auto",
      current: {
        start: current.start?.toISOString() ?? null,
        end: current.end?.toISOString() ?? null,
      },
      planned: null,
      upToDate: true,
      atRisk: false,
      facts: [
        {
          kind: "pinned",
          label: "Fixed",
          text: "This task has a fixed time; the planner does not place it.",
          decisive: true,
        },
      ],
      inputs: {
        priority: null,
        deadline: null,
        hardDeadline: false,
        energyRequired: null,
        estimateMinutes: null,
        blockMinutes: [],
        dependencyIds: [],
        earliestStart: null,
        rank: null,
        queueSize: null,
      },
      before: null,
      timeZone: null,
    };
  }
  // Replay the run that placed the task, from the instant it ran: a pass
  // from "now" would see blocks that have started since as free time and
  // move everything after them, which is not why the task is where it is.
  const { input } = await loadScheduleInput(userId, {
    now: task.lastScheduled ?? newDate(),
    workspaceId:
      workspace.dataScope.mode === "workspace"
        ? workspace.workspaceId
        : undefined,
  });
  const trace = new Map<string, PlacementTrace>();
  const result = scheduleTasks({ ...input, trace });
  return explainPlacement({ input, result, trace, taskId, current });
}
