import {
  addCalendarDays,
  formatInTimeZone,
  fromZonedTime,
  startOfDayInTimeZone,
} from "@/lib/date-utils";
import { logger } from "@/lib/logger";
import type { UnscheduledReason } from "@/lib/scheduling-reasons";

const LOG_SOURCE = "SchedulingEngine";

export type SchedulingEnergyLevel = "LOW" | "MEDIUM" | "HIGH";
export type SchedulingTaskPriority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";

export interface SchedulableTask {
  id: string;
  title: string;
  assigneeId: string | null;
  status?: string;
  createdAt?: Date;
  estimatedMinutes?: number | null;
  durationMinutes?: number | null;
  minChunkMinutes?: number | null;
  maxChunkMinutes?: number | null;
  deadline?: Date | null;
  /** Earliest instant this task may be placed. */
  availableFrom?: Date | null;
  /** May use free time outside Work Schedule, but never end after deadline. */
  hardDeadline?: boolean;
  priority: SchedulingTaskPriority;
  energyRequired: SchedulingEnergyLevel;
  contextTag?: string | null;
  isFrozen?: boolean;
  dependsOnId?: string | null;
  dependencyIds?: string[];
  completedDependencyIds?: string[];
  autoScheduled?: boolean;
  scheduledStart?: Date | null;
  scheduledEnd?: Date | null;
  scheduleId?: string | null;
  isRecurring?: boolean;
  recurrenceRule?: string | null;
}

export interface CalendarBusyBlock {
  id: string;
  title: string;
  start: Date;
  end: Date;
  source: "calendar" | "task" | "frozen";
}

export interface EnergyProfileWindow {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  energyLevel: SchedulingEnergyLevel;
}

export interface EnergyProfile {
  windows: EnergyProfileWindow[];
}

export interface WorkHoursWindow {
  start: string;
  end: string;
}

export interface FlexibleHoursOverride {
  date: string;
  kind: "START_LATER" | "STOP_EARLY" | "BLOCK_HOURS" | "BLOCK_WHOLE_DAY";
  startTime?: string | null;
  endTime?: string | null;
}

export type WorkHoursMap = Record<string, WorkHoursWindow | WorkHoursWindow[]>;

export interface SchedulingPreferences {
  workHours: WorkHoursMap;
  defaultScheduleId?: string | null;
  workHoursBySchedule?: Record<string, WorkHoursMap>;
  flexibleHoursOverrides?: FlexibleHoursOverride[];
  bufferMinutes: number;
  maxDeepWorkPerDay: number;
  minBreakMinutes: number;
  autoRescheduleOnMiss: boolean;
  enableBodyDoubling: boolean;
  enableTaskBatching: boolean;
  hardStopTime: string;
  bufferMultiplier: number;
  /**
   * IANA zone of the person (UserSettings.timeZone). Work hours, days, energy
   * windows and overrides are wall-clock in this zone. The process clock is
   * UTC in production, so without it hours would be read as UTC. Left out, the
   * engine falls back to the process's local zone.
   */
  timeZone?: string;
  calibrationFactors?: Record<string, number>;
  /**
   * Real time over estimate, learned from the person's finished tasks (only
   * with "Let Needt learn about me" on). Scales a task's length unless its
   * context already has a calibration factor, so the two never stack.
   */
  learnedDurationRatio?: number;
}

export interface ScheduledBlock {
  taskId: string;
  title: string;
  start: Date;
  end: Date;
  chunkIndex: number;
  chunkCount: number;
  energyRequired: SchedulingEnergyLevel;
  contextTag?: string | null;
  isFrozen: boolean;
}

export interface UnscheduledTask {
  taskId: string;
  title: string;
  reason: UnscheduledReason;
}

export interface ScheduleResult {
  blocks: ScheduledBlock[];
  unscheduled: UnscheduledTask[];
  frozenBlocks: ScheduledBlock[];
}

interface OccupiedBlock {
  id: string;
  title: string;
  start: Date;
  end: Date;
}

interface TaskChunk {
  task: SchedulableTask;
  minutes: number;
  bufferAfterMinutes: number;
  chunkIndex: number;
  chunkCount: number;
}

const DEFAULT_ESTIMATE_MINUTES = 30;
const DEFAULT_MIN_CHUNK_MINUTES = 25;
const DEFAULT_SEARCH_DAYS = 21;
const SLOT_STEP_MINUTES = 15;
/**
 * Hard stop for every loop that walks day by day. The planning horizon is 21
 * days, so this is never reached on purpose; it exists so a stepping bug can
 * cost one logged line instead of hanging the scheduler and the worker.
 */
const MAX_DAY_STEPS = 400;

const PRIORITY_WEIGHT: Record<SchedulingTaskPriority, number> = {
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
  URGENT: 4,
};

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}

function startOfDay(date: Date, timeZone?: string): Date {
  if (timeZone) return startOfDayInTimeZone(date, timeZone);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/**
 * Midnight of the next calendar day. Adding 24 hours is wrong on a 23- or
 * 25-hour clock-change day: from 00:00 on a 25-hour day it lands on 23:00 the
 * same day, so the day never advances.
 */
function nextDayStart(date: Date, timeZone?: string): Date {
  return startOfDay(
    addCalendarDays(startOfDay(date, timeZone), 1, timeZone),
    timeZone
  );
}

/** `date`'s calendar day at wall-clock `time` ("HH:mm") in the zone. */
function setTime(date: Date, time: string, timeZone?: string): Date {
  const [hours, minutes] = time.split(":").map(Number);
  if (timeZone) {
    const day = formatInTimeZone(date, timeZone, "yyyy-MM-dd");
    return fromZonedTime(
      `${day}T${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:00`,
      timeZone
    );
  }
  const next = new Date(date);
  next.setHours(hours, minutes, 0, 0);
  return next;
}

function minutesBetween(start: Date, end: Date): number {
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / 60_000));
}

function roundUpToStep(date: Date, stepMinutes = SLOT_STEP_MINUTES): Date {
  const stepMs = stepMinutes * 60_000;
  return new Date(Math.ceil(date.getTime() / stepMs) * stepMs);
}

function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart < bEnd && aEnd > bStart;
}

function isDone(task: SchedulableTask): boolean {
  return task.status === "completed";
}

/** Weekday 0 (Sunday) to 6 in the zone. */
function dayKey(date: Date, timeZone?: string): string {
  if (timeZone) {
    return String(Number(formatInTimeZone(date, timeZone, "i")) % 7);
  }
  return String(date.getDay());
}

function localDateKey(date: Date, timeZone?: string): string {
  if (timeZone) return formatInTimeZone(date, timeZone, "yyyy-MM-dd");
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function normalizeWindows(
  value: WorkHoursWindow | WorkHoursWindow[] | undefined
): WorkHoursWindow[] {
  if (!value) return [];
  return (Array.isArray(value) ? value : [value])
    .filter((window) => window.start < window.end)
    .sort((a, b) => a.start.localeCompare(b.start));
}

export function applyFlexibleHoursOverrides(
  windows: WorkHoursWindow[],
  overrides: FlexibleHoursOverride[]
): WorkHoursWindow[] {
  let result = [...windows];

  for (const override of overrides) {
    if (override.kind === "BLOCK_WHOLE_DAY") return [];

    if (override.kind === "START_LATER" && override.startTime) {
      const startTime = override.startTime;
      result = result
        .map((window) => ({
          ...window,
          start: window.start > startTime ? window.start : startTime,
        }))
        .filter((window) => window.start < window.end);
      continue;
    }

    if (override.kind === "STOP_EARLY" && override.endTime) {
      const endTime = override.endTime;
      result = result
        .map((window) => ({
          ...window,
          end: window.end < endTime ? window.end : endTime,
        }))
        .filter((window) => window.start < window.end);
      continue;
    }

    if (
      override.kind === "BLOCK_HOURS" &&
      override.startTime &&
      override.endTime
    ) {
      result = result.flatMap((window) => {
        if (
          override.endTime! <= window.start ||
          override.startTime! >= window.end
        ) {
          return [window];
        }

        const pieces: WorkHoursWindow[] = [];
        if (window.start < override.startTime!) {
          pieces.push({ start: window.start, end: override.startTime! });
        }
        if (window.end > override.endTime!) {
          pieces.push({ start: override.endTime!, end: window.end });
        }
        return pieces;
      });
    }
  }

  return result;
}

function getWorkWindows(
  date: Date,
  prefs: SchedulingPreferences,
  scheduleId?: string | null
): Array<{ start: Date; end: Date }> {
  const resolvedScheduleId = scheduleId ?? prefs.defaultScheduleId ?? null;
  const scheduleHours =
    (resolvedScheduleId
      ? prefs.workHoursBySchedule?.[resolvedScheduleId]
      : undefined) ?? prefs.workHours;
  const overrides = (prefs.flexibleHoursOverrides ?? []).filter(
    (override) => override.date === localDateKey(date, prefs.timeZone)
  );
  const windows = applyFlexibleHoursOverrides(
    normalizeWindows(scheduleHours[dayKey(date, prefs.timeZone)]),
    overrides
  );
  const hardStop = setTime(date, prefs.hardStopTime, prefs.timeZone);

  return windows
    .map((window) => {
      const start = setTime(date, window.start, prefs.timeZone);
      const windowEnd = setTime(date, window.end, prefs.timeZone);
      return { start, end: windowEnd < hardStop ? windowEnd : hardStop };
    })
    .filter((window) => window.start < window.end);
}

function getEnergyWindowsForDay(
  date: Date,
  profile: EnergyProfile,
  timeZone?: string
): Array<{ start: Date; end: Date; energyLevel: SchedulingEnergyLevel }> {
  return profile.windows
    .filter((window) => String(window.dayOfWeek) === dayKey(date, timeZone))
    .map((window) => ({
      start: setTime(date, window.startTime, timeZone),
      end: setTime(date, window.endTime, timeZone),
      energyLevel: window.energyLevel,
    }))
    .sort((a, b) => a.start.getTime() - b.start.getTime());
}

function energyMatches(
  required: SchedulingEnergyLevel,
  candidate: SchedulingEnergyLevel,
  strict: boolean
): boolean {
  if (!strict) {
    return true;
  }

  if (required === "HIGH") {
    return candidate === "HIGH";
  }

  if (required === "MEDIUM") {
    return candidate === "MEDIUM" || candidate === "HIGH";
  }

  return true;
}

function hasEnergyMatch(
  start: Date,
  end: Date,
  task: SchedulableTask,
  profile: EnergyProfile,
  strict: boolean,
  timeZone?: string
): boolean {
  if (!strict) {
    return true;
  }

  const windows = getEnergyWindowsForDay(start, profile, timeZone);
  if (windows.length === 0) {
    return task.energyRequired !== "HIGH";
  }

  return windows.some(
    (window) =>
      start >= window.start &&
      end <= window.end &&
      energyMatches(task.energyRequired, window.energyLevel, strict)
  );
}

function hasConflict(
  start: Date,
  end: Date,
  occupied: OccupiedBlock[],
  spacingMinutes: number
): boolean {
  const spacedStart = addMinutes(start, -spacingMinutes);
  const spacedEnd = addMinutes(end, spacingMinutes);
  return occupied.some((block) =>
    overlaps(spacedStart, spacedEnd, block.start, block.end)
  );
}

function sortTasks(tasks: SchedulableTask[], now: Date): SchedulableTask[] {
  const sortedByPriority = [...tasks].sort((a, b) => {
    const asapDelta =
      Number(b.priority === "URGENT") - Number(a.priority === "URGENT");
    if (asapDelta !== 0) return asapDelta;

    const hardDeadlineDelta =
      Number(Boolean(b.hardDeadline && b.deadline)) -
      Number(Boolean(a.hardDeadline && a.deadline));
    if (hardDeadlineDelta !== 0) return hardDeadlineDelta;

    const deadlinePresenceDelta =
      Number(Boolean(b.deadline)) - Number(Boolean(a.deadline));
    if (deadlinePresenceDelta !== 0) return deadlinePresenceDelta;

    if (a.deadline && b.deadline) {
      const deadlineDelta = a.deadline.getTime() - b.deadline.getTime();
      if (deadlineDelta !== 0) return deadlineDelta;
    }

    const priorityDelta =
      PRIORITY_WEIGHT[b.priority] - PRIORITY_WEIGHT[a.priority];
    if (priorityDelta !== 0) return priorityDelta;

    const durationDelta =
      (a.estimatedMinutes ?? a.durationMinutes ?? DEFAULT_ESTIMATE_MINUTES) -
      (b.estimatedMinutes ?? b.durationMinutes ?? DEFAULT_ESTIMATE_MINUTES);
    if (durationDelta !== 0) return durationDelta;

    const availableFromDelta =
      (a.availableFrom?.getTime() ?? now.getTime()) -
      (b.availableFrom?.getTime() ?? now.getTime());
    if (availableFromDelta !== 0) return availableFromDelta;

    const recurrenceDelta =
      Number(Boolean(b.isRecurring)) - Number(Boolean(a.isRecurring));
    if (recurrenceDelta !== 0) return recurrenceDelta;

    const createdAtDelta =
      (a.createdAt?.getTime() ?? now.getTime()) -
      (b.createdAt?.getTime() ?? now.getTime());
    if (createdAtDelta !== 0) return createdAtDelta;

    const contextDelta = (a.contextTag ?? "").localeCompare(b.contextTag ?? "");
    if (contextDelta !== 0) return contextDelta;

    const titleDelta = a.title.localeCompare(b.title);
    if (titleDelta !== 0) return titleDelta;

    return a.id.localeCompare(b.id);
  });
  const taskById = new Map(sortedByPriority.map((task) => [task.id, task]));
  const visited = new Set<string>();
  const visiting = new Set<string>();
  const result: SchedulableTask[] = [];

  const visit = (task: SchedulableTask) => {
    if (visited.has(task.id)) return;
    // Cycles are rejected when dependencies are written. This guard keeps the
    // pure engine deterministic if corrupt legacy data is encountered.
    if (visiting.has(task.id)) return;
    visiting.add(task.id);
    const dependencyIds = [
      ...(task.dependsOnId ? [task.dependsOnId] : []),
      ...(task.dependencyIds ?? []),
    ];
    for (const dependencyId of new Set(dependencyIds)) {
      const dependency = taskById.get(dependencyId);
      if (dependency) visit(dependency);
    }
    visiting.delete(task.id);
    visited.add(task.id);
    result.push(task);
  };

  for (const task of sortedByPriority) visit(task);
  return result;
}

function splitTaskIntoChunks(
  task: SchedulableTask,
  prefs: SchedulingPreferences
): TaskChunk[] {
  const contextFactor = task.contextTag
    ? prefs.calibrationFactors?.[task.contextTag.toLowerCase()]
    : undefined;
  const baseEstimate =
    task.estimatedMinutes ?? task.durationMinutes ?? DEFAULT_ESTIMATE_MINUTES;
  const rawEstimate =
    prefs.learnedDurationRatio && contextFactor === undefined
      ? Math.max(5, Math.round((baseEstimate * prefs.learnedDurationRatio) / 5) * 5)
      : baseEstimate;
  const estimateFactor = Math.max(1, contextFactor ?? prefs.bufferMultiplier);
  const minChunk = Math.max(
    1,
    task.minChunkMinutes ?? DEFAULT_MIN_CHUNK_MINUTES
  );
  const maxChunk = Math.max(minChunk, task.maxChunkMinutes ?? rawEstimate);
  const chunks: number[] = [];
  let remaining = Math.max(1, rawEstimate);

  while (remaining > 0) {
    let chunk = Math.min(maxChunk, remaining);
    const leftover = remaining - chunk;

    if (leftover > 0 && leftover < minChunk) {
      chunk = Math.max(minChunk, remaining - minChunk);
    }

    chunks.push(chunk);
    remaining -= chunk;
  }

  return chunks.map((minutes, index) => ({
    task,
    minutes,
    bufferAfterMinutes: Math.max(0, Math.ceil(minutes * (estimateFactor - 1))),
    chunkIndex: index,
    chunkCount: chunks.length,
  }));
}

function findDependencyReadyAt(
  task: SchedulableTask,
  placedTaskEnds: Map<string, Date>,
  unscheduledTaskIds: Set<string>,
  now: Date
): Date | null {
  const dependencies = new Set([
    ...(task.dependsOnId ? [task.dependsOnId] : []),
    ...(task.dependencyIds ?? []),
  ]);
  if (dependencies.size === 0) {
    return now;
  }

  const completed = new Set(task.completedDependencyIds ?? []);
  let readyAt = now;
  for (const dependencyId of dependencies) {
    if (completed.has(dependencyId)) continue;
    if (unscheduledTaskIds.has(dependencyId)) return null;
    const end = placedTaskEnds.get(dependencyId);
    if (!end) return null;
    if (end > readyAt) readyAt = end;
  }

  return readyAt;
}

function findSlot(
  chunk: TaskChunk,
  occupied: OccupiedBlock[],
  profile: EnergyProfile,
  prefs: SchedulingPreferences,
  earliestStart: Date,
  planningHorizonEnd: Date,
  deepWorkByDay: Map<string, number>,
  strictEnergy: boolean,
  ignoreEnergyLimits = false
): { start: Date; end: Date } | null {
  const spacingMinutes = Math.max(prefs.bufferMinutes, prefs.minBreakMinutes);
  const searchEnd =
    chunk.task.hardDeadline && chunk.task.deadline
      ? chunk.task.deadline < planningHorizonEnd
        ? chunk.task.deadline
        : planningHorizonEnd
      : planningHorizonEnd;
  let day = startOfDay(earliestStart, prefs.timeZone);

  for (let steps = 0; day <= searchEnd; steps += 1) {
    if (steps >= MAX_DAY_STEPS) {
      logger.error(
        "Slot search hit the day cap and stopped",
        { taskId: chunk.task.id, day: day.toISOString(), cap: MAX_DAY_STEPS },
        LOG_SOURCE
      );
      return null;
    }
    const workWindows = getWorkWindows(day, prefs, chunk.task.scheduleId);
    for (const work of workWindows) {
      let cursor = roundUpToStep(
        earliestStart > work.start ? earliestStart : work.start
      );

      while (cursor < work.end) {
        const end = addMinutes(cursor, chunk.minutes);

        if (end <= work.end && end <= searchEnd) {
          const deepWorkKey = localDateKey(cursor, prefs.timeZone);
          const currentDeepWork = deepWorkByDay.get(deepWorkKey) ?? 0;
          const fitsDeepWork =
            ignoreEnergyLimits ||
            chunk.task.energyRequired !== "HIGH" ||
            currentDeepWork + chunk.minutes <= prefs.maxDeepWorkPerDay;

          if (
            fitsDeepWork &&
            !hasConflict(cursor, end, occupied, spacingMinutes) &&
            (ignoreEnergyLimits ||
              hasEnergyMatch(
                cursor,
                end,
                chunk.task,
                profile,
                strictEnergy,
                prefs.timeZone
              ))
          ) {
            return { start: cursor, end };
          }
        }

        cursor = addMinutes(cursor, SLOT_STEP_MINUTES);
      }
    }

    const following = nextDayStart(day, prefs.timeZone);
    if (following <= day) {
      logger.error(
        "Slot search could not advance to the next day",
        { taskId: chunk.task.id, day: day.toISOString() },
        LOG_SOURCE
      );
      return null;
    }
    day = following;
  }

  return null;
}

/**
 * Earliest hour overflow may reach into. A hard deadline outranks the work
 * schedule — that is deliberate, and covered by tests — but it does not outrank
 * sleep. Without this the search walked the clock minute by minute and would
 * happily return 03:00, which no one acts on and which reads as a bug rather
 * than as urgency.
 */
const OVERFLOW_EARLIEST_HOUR = 7;

function findHardDeadlineOverflowSlot(
  chunk: TaskChunk,
  occupied: OccupiedBlock[],
  prefs: SchedulingPreferences,
  earliestStart: Date,
  planningHorizonEnd: Date
): { start: Date; end: Date } | null {
  if (!chunk.task.hardDeadline || !chunk.task.deadline) return null;

  const searchEnd =
    chunk.task.deadline < planningHorizonEnd
      ? chunk.task.deadline
      : planningHorizonEnd;
  const spacingMinutes = Math.max(prefs.bufferMinutes, prefs.minBreakMinutes);
  let cursor = roundUpToStep(earliestStart);
  let dayJumps = 0;

  while (cursor < searchEnd) {
    const end = addMinutes(cursor, chunk.minutes);
    const dayStart = setTime(
      cursor,
      `0${OVERFLOW_EARLIEST_HOUR}:00`,
      prefs.timeZone
    );
    const dayEnd = setTime(cursor, prefs.hardStopTime, prefs.timeZone);

    if (cursor < dayStart) {
      // Too early in the day: jump to the first acceptable minute rather than
      // stepping through the small hours one slot at a time.
      cursor = dayStart;
      continue;
    }
    if (end > dayEnd) {
      // Past the hard stop: move to the next morning instead of running into
      // the night.
      dayJumps += 1;
      const following = setTime(
        nextDayStart(cursor, prefs.timeZone),
        `0${OVERFLOW_EARLIEST_HOUR}:00`,
        prefs.timeZone
      );
      if (dayJumps > MAX_DAY_STEPS || following <= cursor) {
        logger.error(
          "Overflow slot search hit the day cap and stopped",
          {
            taskId: chunk.task.id,
            cursor: cursor.toISOString(),
            cap: MAX_DAY_STEPS,
          },
          LOG_SOURCE
        );
        return null;
      }
      cursor = following;
      continue;
    }

    if (
      end <= searchEnd &&
      !hasConflict(cursor, end, occupied, spacingMinutes)
    ) {
      return { start: cursor, end };
    }
    cursor = addMinutes(cursor, SLOT_STEP_MINUTES);
  }

  return null;
}

function toFrozenBlock(task: SchedulableTask): ScheduledBlock | null {
  if (!task.scheduledStart || !task.scheduledEnd) {
    return null;
  }

  return {
    taskId: task.id,
    title: task.title,
    start: task.scheduledStart,
    end: task.scheduledEnd,
    chunkIndex: 0,
    chunkCount: 1,
    energyRequired: task.energyRequired,
    contextTag: task.contextTag,
    isFrozen: true,
  };
}

export function scheduleTasks(input: {
  tasks: SchedulableTask[];
  busyBlocks: CalendarBusyBlock[];
  energyProfile: EnergyProfile;
  prefs: SchedulingPreferences;
  now: Date;
}): ScheduleResult {
  // Deterministic scheduling pass:
  // 1. Keep frozen task blocks as immutable busy time.
  // 2. Sort remaining tasks by dependency, priority, deadline pressure, age,
  //    and context tag for stable batching.
  // 3. Keep each visible task block at the user's estimate, split it into
  //    bounded chunks, and reserve the ADHD multiplier as invisible recovery
  //    space after the block. A 30-minute task therefore remains 30 minutes on
  //    the calendar instead of silently becoming 39 minutes.
  // 4. Walk work hours from `now`, skipping calendar/frozen/placed blocks,
  //    buffers, breaks, hard-stop time, and daily deep-work limits.
  // 5. Try energy-matched slots first, then gracefully fall back to any valid
  //    work slot so the planner reports capacity instead of silently failing.
  const assignedTasks = input.tasks.filter((task) => Boolean(task.assigneeId));
  const frozenBlocks = assignedTasks
    .filter((task) => task.isFrozen)
    .map(toFrozenBlock)
    .filter((block): block is ScheduledBlock => block !== null);

  const occupied: OccupiedBlock[] = [
    ...input.busyBlocks.map((block) => ({
      id: block.id,
      title: block.title,
      start: block.start,
      end: block.end,
    })),
    ...frozenBlocks.map((block) => ({
      id: block.taskId,
      title: block.title,
      start: block.start,
      end: block.end,
    })),
  ];

  const unscheduled: UnscheduledTask[] = input.tasks
    .filter((task) => !isDone(task) && !task.assigneeId)
    .map((task) => ({
      taskId: task.id,
      title: task.title,
      reason: "NO_ASSIGNEE",
    }));
  const unscheduledTaskIds = new Set<string>();
  for (const task of unscheduled) {
    unscheduledTaskIds.add(task.taskId);
  }
  const placedTaskEnds = new Map<string, Date>();
  const deepWorkByDay = new Map<string, number>();
  const blocks: ScheduledBlock[] = [];

  for (const block of frozenBlocks) {
    placedTaskEnds.set(block.taskId, block.end);
  }

  const candidateTasks = sortTasks(
    assignedTasks.filter((task) => !isDone(task) && !task.isFrozen),
    input.now
  );
  const planningHorizonEnd = addCalendarDays(input.now, DEFAULT_SEARCH_DAYS);

  for (const task of candidateTasks) {
    const availableFrom =
      task.availableFrom && task.availableFrom > input.now
        ? task.availableFrom
        : input.now;
    if (availableFrom > planningHorizonEnd) {
      unscheduled.push({
        taskId: task.id,
        title: task.title,
        reason: "BEFORE_EARLIEST_START",
      });
      unscheduledTaskIds.add(task.id);
      continue;
    }
    if (task.hardDeadline && task.deadline && availableFrom >= task.deadline) {
      unscheduled.push({
        taskId: task.id,
        title: task.title,
        reason: "DEADLINE_IMPOSSIBLE",
      });
      unscheduledTaskIds.add(task.id);
      continue;
    }
    const dependencyReadyAt = findDependencyReadyAt(
      task,
      placedTaskEnds,
      unscheduledTaskIds,
      availableFrom
    );

    if (!dependencyReadyAt) {
      unscheduled.push({
        taskId: task.id,
        title: task.title,
        reason: "DEPENDENCY_BLOCKED",
      });
      unscheduledTaskIds.add(task.id);
      continue;
    }

    const explicitDuration = task.estimatedMinutes ?? task.durationMinutes;
    if (explicitDuration != null && explicitDuration <= 0) {
      unscheduled.push({
        taskId: task.id,
        title: task.title,
        reason: "NO_DURATION",
      });
      unscheduledTaskIds.add(task.id);
      continue;
    }
    const duration = explicitDuration ?? DEFAULT_ESTIMATE_MINUTES;
    if (
      task.hardDeadline &&
      task.deadline &&
      addMinutes(dependencyReadyAt, duration) > task.deadline
    ) {
      unscheduled.push({
        taskId: task.id,
        title: task.title,
        reason: "DEADLINE_IMPOSSIBLE",
      });
      unscheduledTaskIds.add(task.id);
      continue;
    }

    const chunks = splitTaskIntoChunks(task, input.prefs);
    const taskBlocks: ScheduledBlock[] = [];
    const occupiedLengthBeforeTask = occupied.length;
    const deepWorkBeforeTask = new Map(deepWorkByDay);
    let cursor = dependencyReadyAt;
    let failedReason: UnscheduledTask["reason"] | null = null;

    for (const chunk of chunks) {
      const strictSlot = findSlot(
        chunk,
        occupied,
        input.energyProfile,
        input.prefs,
        cursor,
        planningHorizonEnd,
        deepWorkByDay,
        true
      );
      const workScheduleSlot =
        strictSlot ??
        findSlot(
          chunk,
          occupied,
          input.energyProfile,
          input.prefs,
          cursor,
          planningHorizonEnd,
          deepWorkByDay,
          false
        );
      const slot =
        workScheduleSlot ??
        findHardDeadlineOverflowSlot(
          chunk,
          occupied,
          input.prefs,
          cursor,
          planningHorizonEnd
        );

      if (!slot) {
        if (task.hardDeadline && task.deadline) {
          failedReason = "HARD_DEADLINE_MISSED";
        } else {
          const slotWithoutEnergyLimits = findSlot(
            chunk,
            occupied,
            input.energyProfile,
            input.prefs,
            cursor,
            planningHorizonEnd,
            deepWorkByDay,
            false,
            true
          );
          failedReason = slotWithoutEnergyLimits
            ? "ENERGY_WINDOW_UNAVAILABLE"
            : "NO_WORKING_TIME";
        }
        break;
      }

      const block: ScheduledBlock = {
        taskId: task.id,
        title: task.title,
        start: slot.start,
        end: slot.end,
        chunkIndex: chunk.chunkIndex,
        chunkCount: chunk.chunkCount,
        energyRequired: task.energyRequired,
        contextTag: task.contextTag,
        isFrozen: false,
      };

      taskBlocks.push(block);
      occupied.push({
        id: `${task.id}:${chunk.chunkIndex}`,
        title: task.title,
        start: slot.start,
        end: addMinutes(slot.end, chunk.bufferAfterMinutes),
      });

      if (task.energyRequired === "HIGH") {
        const key = localDateKey(slot.start, input.prefs.timeZone);
        deepWorkByDay.set(
          key,
          (deepWorkByDay.get(key) ?? 0) + minutesBetween(slot.start, slot.end)
        );
      }

      cursor = addMinutes(
        slot.end,
        chunk.bufferAfterMinutes +
          (input.prefs.enableTaskBatching ? input.prefs.bufferMinutes : 0)
      );
    }

    if (failedReason) {
      occupied.length = occupiedLengthBeforeTask;
      deepWorkByDay.clear();
      for (const [key, value] of deepWorkBeforeTask) {
        deepWorkByDay.set(key, value);
      }
      unscheduled.push({
        taskId: task.id,
        title: task.title,
        reason: failedReason,
      });
      unscheduledTaskIds.add(task.id);
      continue;
    }

    blocks.push(...taskBlocks);
    const latestEnd = taskBlocks.reduce(
      (latest, block) => (block.end > latest ? block.end : latest),
      taskBlocks[0]?.end ?? dependencyReadyAt
    );
    placedTaskEnds.set(task.id, latestEnd);
  }

  return { blocks, unscheduled, frozenBlocks };
}

export function rescheduleFromNow(input: {
  tasks: SchedulableTask[];
  busyBlocks: CalendarBusyBlock[];
  energyProfile: EnergyProfile;
  prefs: SchedulingPreferences;
  now: Date;
}): ScheduleResult {
  const pastBlocks: CalendarBusyBlock[] = input.tasks
    .filter(
      (task) =>
        task.scheduledStart &&
        task.scheduledEnd &&
        (task.isFrozen || task.scheduledEnd <= input.now)
    )
    .map((task) => ({
      id: task.id,
      title: task.title,
      start: task.scheduledStart!,
      end: task.scheduledEnd!,
      source: task.isFrozen ? "frozen" : "task",
    }));

  return scheduleTasks({
    ...input,
    busyBlocks: [...input.busyBlocks, ...pastBlocks],
    tasks: input.tasks.filter(
      (task) =>
        !task.scheduledEnd || task.scheduledEnd > input.now || task.isFrozen
    ),
  });
}
