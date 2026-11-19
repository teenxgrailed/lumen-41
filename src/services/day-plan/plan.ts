import { parseTasksForUser } from "@/services/ai/parse-tasks";
import type { ParsedTask } from "@/services/ai/types";
import { z } from "zod";

import { recordActivation } from "@/lib/activation-events";
import { ensurePersonalWorkspaceRow } from "@/lib/auth/personal-workspace";
import { newDate } from "@/lib/date-utils";
import { prisma } from "@/lib/prisma";

import { appendEveningNote } from "./note";
import {
  type Candidate,
  DAY_PLAN_LIMITS,
  DayPlanError,
  type EffectiveSettings,
  type Resolution,
  addDaysToKey,
  checkResolutions,
  cutDraft,
  dateKeyOf,
  dateKeySchema,
  estimateOf,
  keyFromDate,
  normalizeTitle,
  rankCandidates,
  requireDateKey,
  resolutionSchema,
} from "./rules";
import { getPlanSettings, suggestLimit, userTimeZone } from "./settings";

export const TASK_SELECT = {
  id: true,
  title: true,
  status: true,
  estimatedMinutes: true,
  duration: true,
  dueDate: true,
  deadline: true,
  scheduledStart: true,
  priorityLevel: true,
  createdAt: true,
  isArchived: true,
  trashedAt: true,
  somedayAt: true,
} as const;

interface TaskRow {
  id: string;
  title: string;
  status: string;
  estimatedMinutes: number | null;
  duration: number | null;
  dueDate: Date | null;
  deadline: Date | null;
  scheduledStart: Date | null;
  priorityLevel: string | null;
  createdAt: Date;
  isArchived: boolean;
  trashedAt: Date | null;
  somedayAt: Date | null;
}

interface ItemRow {
  id?: string;
  planId?: string;
  taskId: string;
  position: number;
  isMain: boolean;
  addedBy: string;
  resolution: string | null;
  task: TaskRow;
}

interface PlanRow {
  id: string;
  userId: string;
  date: Date;
  status: string;
  source: string;
  builtAt: Date;
  closedAt: Date | null;
  editedByUserAt: Date | null;
  items: ItemRow[];
}

export interface PlanItemView {
  taskId: string;
  title: string;
  status: string;
  isMain: boolean;
  position: number;
  addedBy: string;
  resolution: string | null;
  estimatedMinutes: number;
  dueDate: string | null;
}

export interface PlanView {
  date: string;
  status: string;
  source: string;
  builtAt: string;
  closedAt: string | null;
  edited: boolean;
  limit: number;
  mainLimit: number;
  focusBudgetMinutes: number;
  focusMinutes: number;
  taskCount: number;
  mainCount: number;
  items: PlanItemView[];
}

export interface TaskLite {
  id: string;
  title: string;
  estimatedMinutes: number;
  dueDate: string | null;
}

const isOpen = (task: TaskRow) =>
  task.status !== "completed" &&
  !task.isArchived &&
  !task.trashedAt &&
  !task.somedayAt;

const lite = (task: TaskRow): TaskLite => ({
  id: task.id,
  title: task.title,
  estimatedMinutes: estimateOf(task),
  dueDate: task.dueDate ? task.dueDate.toISOString().slice(0, 10) : null,
});

const itemInclude = {
  items: {
    orderBy: { position: "asc" as const },
    include: { task: { select: TASK_SELECT } },
  },
};

async function loadPlan(userId: string, date: Date): Promise<PlanRow | null> {
  return (await prisma.dayPlan.findUnique({
    where: { userId_date: { userId, date } },
    include: itemInclude,
  })) as PlanRow | null;
}

export function toPlanView(
  plan: PlanRow,
  settings: EffectiveSettings
): PlanView {
  const items = [...plan.items]
    .sort((a, b) => a.position - b.position)
    .map((item) => ({
      taskId: item.taskId,
      title: item.task.title,
      status: item.task.status,
      isMain: item.isMain,
      position: item.position,
      addedBy: item.addedBy,
      resolution: item.resolution,
      estimatedMinutes: estimateOf(item.task),
      dueDate: item.task.dueDate
        ? item.task.dueDate.toISOString().slice(0, 10)
        : null,
    }));
  return {
    date: keyFromDate(plan.date),
    status: plan.status,
    source: plan.source,
    builtAt: plan.builtAt.toISOString(),
    closedAt: plan.closedAt ? plan.closedAt.toISOString() : null,
    edited: plan.editedByUserAt !== null,
    limit: settings.taskLimit,
    mainLimit: settings.mainLimit,
    focusBudgetMinutes: settings.focusMinutes,
    focusMinutes: items.reduce((sum, item) => sum + item.estimatedMinutes, 0),
    taskCount: items.length,
    mainCount: items.filter((item) => item.isMain).length,
    items,
  };
}

/**
 * Unfinished tasks of earlier plans that were never closed. They are shown as
 * "needs a decision", outside today's limit, and are not part of any later
 * plan until the person resolves them (D4). Nothing moves them silently.
 */
export async function getNeedsDecision(
  userId: string,
  beforeKey: string
): Promise<TaskLite[]> {
  const before = requireDateKey(beforeKey);
  const plans = (await prisma.dayPlan.findMany({
    where: { userId, status: { not: "closed" }, date: { lt: before } },
    orderBy: { date: "asc" },
    include: itemInclude,
  })) as PlanRow[];
  const seen = new Set<string>();
  const out: TaskLite[] = [];
  for (const plan of plans) {
    for (const item of plan.items) {
      if (item.resolution !== null) continue;
      if (!isOpen(item.task) || seen.has(item.taskId)) continue;
      seen.add(item.taskId);
      out.push(lite(item.task));
    }
  }
  return out;
}

export interface DayPlanSnapshot {
  date: string;
  plan: PlanView | null;
  settings: EffectiveSettings;
  needsDecision: TaskLite[];
  limitSuggestion: number | null;
}

/** The plan of a date with what the home screen needs around it. */
export async function getDayPlan(
  userId: string,
  dateKey: string,
  now: Date = newDate()
): Promise<DayPlanSnapshot> {
  const date = requireDateKey(dateKey);
  const [plan, settings, needsDecision, limitSuggestion] = await Promise.all([
    loadPlan(userId, date),
    getPlanSettings(userId),
    getNeedsDecision(userId, dateKey),
    suggestLimit(userId, now),
  ]);
  return {
    date: dateKey,
    plan: plan ? toPlanView(plan, settings) : null,
    settings,
    needsDecision,
    limitSuggestion,
  };
}

/* ---------- building tomorrow's draft ---------- */

export interface BuildDraftResult {
  plan: PlanView;
  /** Candidates that did not go in (or arrived after the person edited). */
  suggested: TaskLite[];
  built: boolean;
  skipped: "closed" | "edited" | null;
}

type ParsedItem = ParsedTask;

function candidateOf(
  task: TaskRow,
  timeZone: string,
  over: Partial<Candidate> = {}
): Candidate {
  return {
    id: task.id,
    title: task.title,
    deadlineKey: task.deadline ? dateKeyOf(task.deadline, timeZone) : null,
    isMain: false,
    priorityLevel: task.priorityLevel,
    createdAt: task.createdAt,
    minutes: estimateOf(task),
    pinned: null,
    addedBy: "draft",
    ...over,
  };
}

async function openPool(userId: string): Promise<TaskRow[]> {
  return (await prisma.task.findMany({
    where: {
      userId,
      status: { not: "completed" },
      isArchived: false,
      trashedAt: null,
      somedayAt: null,
      isSample: false,
    },
    select: TASK_SELECT,
    take: 2_000,
  })) as TaskRow[];
}

/**
 * Tasks the draft may draw on without a note: dated for the day (due, or
 * scheduled on it) or with a deadline in the next 3 days. Open and not in
 * Someday; recurring masters and habit rows are not plan material.
 */
async function datedCandidates(
  userId: string,
  dateKey: string,
  timeZone: string,
  excluded: Set<string>
): Promise<TaskRow[]> {
  const start = requireDateKey(addDaysToKey(dateKey, -1));
  const end = requireDateKey(
    addDaysToKey(dateKey, DAY_PLAN_LIMITS.draftDeadlineDays + 2)
  );
  const rows = (await prisma.task.findMany({
    where: {
      userId,
      status: { not: "completed" },
      isArchived: false,
      trashedAt: null,
      somedayAt: null,
      isSample: false,
      isRecurring: false,
      habitId: null,
      OR: [
        { dueDate: { gte: start, lt: end } },
        { deadline: { gte: start, lt: end } },
        { scheduledStart: { gte: start, lt: end } },
      ],
    },
    select: TASK_SELECT,
    take: 500,
  })) as TaskRow[];
  const horizon = addDaysToKey(dateKey, DAY_PLAN_LIMITS.draftDeadlineDays);
  return rows.filter((task) => {
    if (excluded.has(task.id) || !isOpen(task)) return false;
    const due = task.dueDate ? dateKeyOf(task.dueDate, timeZone) : null;
    const scheduled = task.scheduledStart
      ? dateKeyOf(task.scheduledStart, timeZone)
      : null;
    const deadline = task.deadline ? dateKeyOf(task.deadline, timeZone) : null;
    return (
      due === dateKey ||
      scheduled === dateKey ||
      (deadline !== null && deadline >= dateKey && deadline <= horizon)
    );
  });
}

/**
 * Turns what the note names into tasks: an open task with the same normalised
 * title is reused, anything else becomes a new task through the same fields
 * quick add fills. Order follows the note.
 */
async function resolveNoteTasks(
  userId: string,
  parsed: ParsedItem[],
  pool: TaskRow[],
  excluded: Set<string>,
  timeZone: string,
  now: Date
): Promise<{ candidate: Candidate; reused: boolean }[]> {
  const byTitle = new Map<string, TaskRow>();
  for (const task of pool) {
    if (excluded.has(task.id)) continue;
    const key = normalizeTitle(task.title);
    if (key && !byTitle.has(key)) byTitle.set(key, task);
  }
  const out: { candidate: Candidate; reused: boolean }[] = [];
  const seen = new Set<string>();
  let workspaceId: string | null | undefined;
  for (const item of parsed) {
    const title = item.title?.trim();
    const key = title ? normalizeTitle(title) : "";
    if (!title || !key || seen.has(key)) continue;
    seen.add(key);

    const existing = byTitle.get(key);
    if (existing) {
      out.push({
        candidate: candidateOf(existing, timeZone, {
          pinned: 1_000 + out.length,
        }),
        reused: true,
      });
      continue;
    }
    if (workspaceId === undefined) {
      workspaceId = (await ensurePersonalWorkspaceRow(userId)).id;
    }
    const created = (await prisma.task.create({
      data: {
        title: title.slice(0, 500),
        description: item.description ?? null,
        status: "todo",
        userId,
        assigneeId: userId,
        workspaceId,
        estimatedMinutes: item.estimatedMinutes ?? null,
        duration: item.estimatedMinutes ?? null,
        priorityLevel: item.priority ?? "MEDIUM",
        energyRequired: item.energyRequired ?? "MEDIUM",
        contextTag: item.contextTag ?? null,
        entry: item.entry ?? null,
        lastTouchedAt: now,
        ...(workspaceId
          ? {
              activities: {
                create: { workspaceId, actorId: userId, action: "CREATED" },
              },
            }
          : {}),
      },
      select: TASK_SELECT,
    })) as TaskRow;
    out.push({
      candidate: candidateOf(created, timeZone, { pinned: 1_000 + out.length }),
      reused: false,
    });
  }
  return out;
}

/**
 * Builds the draft of a day: from the evening note (when there is one) plus the
 * person's open tasks, cut at their limit and focus budget. It never
 * overwrites a plan the person edited (new candidates come back as
 * `suggested`), never touches a closed plan, and falls back to the
 * deterministic parser when AI is off or fails, without losing the note.
 */
export async function buildDraft(
  userId: string,
  dateKey: string,
  options: { note?: string; now?: Date } = {}
): Promise<BuildDraftResult> {
  const date = requireDateKey(dateKey);
  const now = options.now ?? newDate();
  const [timeZone, settings, existing] = await Promise.all([
    userTimeZone(userId),
    getPlanSettings(userId),
    loadPlan(userId, date),
  ]);

  if (existing?.status === "closed") {
    return {
      plan: toPlanView(existing, settings),
      suggested: [],
      built: false,
      skipped: "closed",
    };
  }

  const note = options.note?.trim() ?? "";
  const excluded = new Set(
    (await getNeedsDecision(userId, dateKey)).map((task) => task.id)
  );
  let source: "note" | "no_note" | "fallback" =
    (existing?.source as "note" | "no_note" | "fallback" | undefined) ??
    "no_note";
  let fromNote: { candidate: Candidate; reused: boolean }[] = [];
  if (note) {
    // The note is kept first: a parser failure must not lose what was written.
    await appendEveningNote(userId, addDaysToKey(dateKey, -1), note);
    const parsed = await parseTasksForUser(userId, note);
    source = parsed.fallback ? "fallback" : "note";
    fromNote = await resolveNoteTasks(
      userId,
      parsed.tasks,
      await openPool(userId),
      excluded,
      timeZone,
      now
    );
  }

  const carried: Candidate[] = (existing?.items ?? []).map((item) =>
    candidateOf(item.task, timeZone, {
      pinned: item.position,
      isMain: item.isMain,
      addedBy: item.addedBy === "review" ? "review" : "draft",
    })
  );
  const taken = new Set([
    ...carried.map((c) => c.id),
    ...fromNote.map((entry) => entry.candidate.id),
  ]);
  const dated = (
    await datedCandidates(userId, dateKey, timeZone, excluded)
  ).filter((task) => !taken.has(task.id));

  const ranked = rankCandidates([
    ...carried,
    ...fromNote
      .map((entry) => entry.candidate)
      .filter((candidate) => !carried.some((c) => c.id === candidate.id)),
    ...dated.map((task) => candidateOf(task, timeZone)),
  ]);
  const cut = cutDraft(ranked, settings);

  if (existing?.editedByUserAt) {
    // The person's edits win. New material is offered, never forced in.
    const inPlan = new Set(existing.items.map((item) => item.taskId));
    const suggested = ranked
      .filter((candidate) => !inPlan.has(candidate.id))
      .slice(0, DAY_PLAN_LIMITS.taskMax)
      .map(
        (candidate): TaskLite => ({
          id: candidate.id,
          title: candidate.title,
          estimatedMinutes: candidate.minutes,
          dueDate: null,
        })
      );
    return {
      plan: toPlanView(existing, settings),
      suggested,
      built: false,
      skipped: "edited",
    };
  }

  const reusedByNote = fromNote
    .filter((entry) => entry.reused)
    .map((entry) => entry.candidate.id);

  await prisma.$transaction(async (tx) => {
    const plan = existing
      ? await tx.dayPlan.update({
          where: { id: existing.id },
          data: { source, builtAt: now },
        })
      : await tx.dayPlan.create({
          data: { userId, date, status: "draft", source, builtAt: now },
        });
    await tx.dayPlanItem.deleteMany({
      where: {
        planId: plan.id,
        taskId: { notIn: cut.chosen.map((c) => c.id) },
      },
    });
    for (const [position, candidate] of cut.chosen.entries()) {
      const isMain = cut.mainIds.has(candidate.id);
      await tx.dayPlanItem.upsert({
        where: { planId_taskId: { planId: plan.id, taskId: candidate.id } },
        create: {
          planId: plan.id,
          taskId: candidate.id,
          position,
          isMain,
          addedBy: candidate.addedBy,
        },
        update: { position, isMain },
      });
    }
  });
  if (reusedByNote.length > 0) {
    await prisma.task.updateMany({
      where: { id: { in: reusedByNote }, userId },
      data: { lastTouchedAt: now },
    });
  }

  if (!existing) {
    // Once per date: a rebuild of an existing draft is not a second event.
    recordActivation("plan_built", userId, {
      date: dateKey,
      taskCount: cut.chosen.length,
      mainCount: cut.mainIds.size,
      limit: settings.taskLimit,
      focusMinutes: cut.focusMinutes,
      source,
    });
  }

  const built = await loadPlan(userId, date);
  return {
    plan: toPlanView(built as PlanRow, settings),
    suggested: cut.overflow
      .slice(0, DAY_PLAN_LIMITS.taskMax)
      .map((candidate) => ({
        id: candidate.id,
        title: candidate.title,
        estimatedMinutes: candidate.minutes,
        dueDate: null,
      })),
    built: true,
    skipped: null,
  };
}

/* ---------- editing a plan ---------- */

export const dayPlanUpdateSchema = z
  .object({
    date: dateKeySchema,
    /** The whole plan, in order. Tasks not listed leave the plan. */
    items: z
      .array(
        z.object({
          taskId: z.string().min(1),
          isMain: z.boolean().optional(),
        })
      )
      .max(50),
    /** Allow the plan to grow past the person's limit. */
    confirmOverLimit: z.boolean().optional(),
    /** Start the day: draft to active. */
    status: z.enum(["active"]).optional(),
  })
  .strict();

export type DayPlanUpdate = z.infer<typeof dayPlanUpdateSchema>;

/**
 * Replaces the items of a plan as the person arranged them. The plan never
 * grows past the limit without `confirmOverLimit`; main tasks stay within the
 * main limit; a closed plan is read-only. Marks the plan as edited, so a later
 * automatic rebuild never undoes it.
 */
export async function updateDayPlan(
  userId: string,
  input: DayPlanUpdate,
  now: Date = newDate()
): Promise<PlanView> {
  const date = requireDateKey(input.date);
  const [settings, existing] = await Promise.all([
    getPlanSettings(userId),
    loadPlan(userId, date),
  ]);
  if (existing?.status === "closed") {
    throw new DayPlanError("day_closed", 409, "This day is closed");
  }

  const ids = input.items.map((item) => item.taskId);
  if (new Set(ids).size !== ids.length) {
    throw new DayPlanError("invalid_input", 400, "A task is listed twice");
  }
  const tasks = (await prisma.task.findMany({
    where: { id: { in: ids }, userId },
    select: TASK_SELECT,
  })) as TaskRow[];
  const byId = new Map(tasks.map((task) => [task.id, task]));
  if (ids.some((id) => !byId.has(id))) {
    // Another person's task is answered exactly like a missing one.
    throw new DayPlanError("not_found", 404, "Task not found");
  }

  const current = new Map(
    (existing?.items ?? []).map((item) => [item.taskId, item])
  );
  const added = ids.filter((id) => !current.has(id));
  for (const id of added) {
    if (!isOpen(byId.get(id) as TaskRow)) {
      throw new DayPlanError("invalid_input", 422, "A task is not open", {
        taskId: id,
      });
    }
  }
  if (ids.length > settings.taskLimit && added.length > 0) {
    if (!input.confirmOverLimit) {
      throw new DayPlanError(
        "over_limit",
        409,
        `The plan is full (limit ${settings.taskLimit}). Confirm going over it or swap a task.`,
        { limit: settings.taskLimit }
      );
    }
  }
  const flags = input.items.map((item) =>
    item.isMain !== undefined
      ? item.isMain
      : (current.get(item.taskId)?.isMain ?? false)
  );
  if (flags.filter(Boolean).length > settings.mainLimit) {
    throw new DayPlanError(
      "invalid_main",
      422,
      `At most ${settings.mainLimit} main tasks`,
      { mainLimit: settings.mainLimit }
    );
  }

  await prisma.$transaction(async (tx) => {
    const plan = existing
      ? existing
      : await tx.dayPlan.create({
          data: {
            userId,
            date,
            status: "draft",
            source: "no_note",
            builtAt: now,
          },
        });
    await tx.dayPlanItem.deleteMany({
      where: { planId: plan.id, taskId: { notIn: ids } },
    });
    for (const [position, item] of input.items.entries()) {
      await tx.dayPlanItem.upsert({
        where: { planId_taskId: { planId: plan.id, taskId: item.taskId } },
        create: {
          planId: plan.id,
          taskId: item.taskId,
          position,
          isMain: flags[position],
          addedBy: "user",
        },
        update: { position, isMain: flags[position] },
      });
    }
    await tx.dayPlan.update({
      where: { id: plan.id },
      data: {
        editedByUserAt: now,
        ...(input.status === "active" && plan.status === "draft"
          ? { status: "active" }
          : {}),
      },
    });
  });
  if (added.length > 0) {
    await prisma.task.updateMany({
      where: { id: { in: added }, userId },
      data: { lastTouchedAt: now },
    });
  }
  return toPlanView((await loadPlan(userId, date)) as PlanRow, settings);
}

/** The morning: a draft becomes the active plan of the day. */
export async function activateDayPlan(
  userId: string,
  dateKey: string
): Promise<boolean> {
  const date = requireDateKey(dateKey);
  const { count } = await prisma.dayPlan.updateMany({
    where: { userId, date, status: "draft" },
    data: { status: "active" },
  });
  return count > 0;
}

/* ---------- closing the day ---------- */

export const closeDaySchema = z
  .object({
    date: dateKeySchema,
    resolutions: z.array(resolutionSchema).max(200).default([]),
    /** Put leftovers into tomorrow even when it goes past the limit. */
    confirmOverflow: z.boolean().optional(),
  })
  .strict();

export type CloseDayInput = z.infer<typeof closeDaySchema>;
export type CloseChannel = "app" | "telegram" | "api";

export interface CloseDayResult {
  date: string;
  status: "closed";
  planned: number;
  done: number;
  toTomorrow: number;
  toSomeday: number;
  deleted: number;
  alreadyClosed: boolean;
}

function countsOf(items: { resolution: string | null }[]) {
  const count = (kind: string) =>
    items.filter((item) => item.resolution === kind).length;
  return {
    planned: items.length,
    done: count("done"),
    toTomorrow: count("tomorrow"),
    toSomeday: count("someday"),
    deleted: count("deleted"),
  };
}

/**
 * Closes a day. Every unfinished planned task needs exactly one of tomorrow,
 * later (Someday) or delete; with any missing the day stays open and nothing
 * changes (D4). Tomorrow only adds the task to the next day's draft, it does
 * not move the task's own dates. Delete moves the task to Trash, which the
 * person can restore. All of it is one transaction.
 */
export async function closeDay(
  userId: string,
  input: CloseDayInput,
  options: { now?: Date; channel?: CloseChannel } = {}
): Promise<CloseDayResult> {
  const now = options.now ?? newDate();
  const channel = options.channel ?? "app";
  const date = requireDateKey(input.date);
  const plan = await loadPlan(userId, date);
  if (!plan)
    throw new DayPlanError("no_plan", 404, "There is no plan for this day");

  if (plan.status === "closed") {
    return {
      date: input.date,
      status: "closed",
      ...countsOf(plan.items),
      alreadyClosed: true,
    };
  }

  const done = plan.items.filter(
    (item) => item.task.status === "completed" || item.task.trashedAt
  );
  const unfinished = plan.items.filter((item) => !done.includes(item));
  const unfinishedIds = unfinished.map((item) => item.taskId);
  const inPlan = new Set(plan.items.map((item) => item.taskId));

  if (input.resolutions.some((entry) => !inPlan.has(entry.taskId))) {
    throw new DayPlanError("not_found", 404, "Task not found in this plan");
  }
  const check = checkResolutions(unfinishedIds, input.resolutions);
  if (check.duplicate.length > 0 || check.unknown.length > 0) {
    throw new DayPlanError(
      "unknown_resolutions",
      422,
      "Each unfinished task takes exactly one resolution",
      { duplicate: check.duplicate, unknown: check.unknown }
    );
  }
  if (check.missing.length > 0) {
    throw new DayPlanError(
      "missing_resolutions",
      422,
      "Every unfinished task needs tomorrow, later or delete",
      { missing: check.missing }
    );
  }

  const choice = new Map(
    input.resolutions.map((entry: Resolution) => [
      entry.taskId,
      entry.resolution,
    ])
  );
  const toTomorrow = unfinished.filter(
    (i) => choice.get(i.taskId) === "tomorrow"
  );
  const toSomeday = unfinished.filter(
    (i) => choice.get(i.taskId) === "someday"
  );
  const toDelete = unfinished.filter((i) => choice.get(i.taskId) === "delete");

  const settings = await getPlanSettings(userId);
  const tomorrowKey = addDaysToKey(input.date, 1);
  const tomorrowDate = requireDateKey(tomorrowKey);
  const tomorrow =
    toTomorrow.length > 0 ? await loadPlan(userId, tomorrowDate) : null;
  const room = Math.max(0, settings.taskLimit - (tomorrow?.items.length ?? 0));
  const wouldNotFit = toTomorrow.slice(room).map((item) => item.taskId);
  if (wouldNotFit.length > 0 && !input.confirmOverflow) {
    throw new DayPlanError(
      "overflow",
      409,
      "Tomorrow would go past the limit. Confirm, or choose again.",
      { wouldNotFit, limit: settings.taskLimit }
    );
  }

  await prisma.$transaction(async (tx) => {
    for (const item of done) {
      await tx.dayPlanItem.updateMany({
        where: { planId: plan.id, taskId: item.taskId },
        data: { resolution: item.task.trashedAt ? "deleted" : "done" },
      });
    }
    if (toTomorrow.length > 0) {
      const target =
        tomorrow ??
        (await tx.dayPlan.create({
          data: {
            userId,
            date: tomorrowDate,
            status: "draft",
            source: "no_note",
            builtAt: now,
          },
        }));
      const existingIds = new Set(tomorrow?.items.map((item) => item.taskId));
      let position = tomorrow?.items.length ?? 0;
      let mains = tomorrow?.items.filter((item) => item.isMain).length ?? 0;
      for (const item of toTomorrow) {
        if (existingIds.has(item.taskId)) continue;
        const isMain = item.isMain && mains < settings.mainLimit;
        if (isMain) mains += 1;
        await tx.dayPlanItem.create({
          data: {
            planId: target.id,
            taskId: item.taskId,
            position,
            isMain,
            addedBy: "review",
          },
        });
        position += 1;
      }
    }
    for (const item of unfinished) {
      const kind = choice.get(item.taskId);
      await tx.dayPlanItem.updateMany({
        where: { planId: plan.id, taskId: item.taskId },
        data: { resolution: kind === "delete" ? "deleted" : kind },
      });
    }
    if (toSomeday.length > 0) {
      await tx.task.updateMany({
        where: { id: { in: toSomeday.map((i) => i.taskId) }, userId },
        data: { somedayAt: now, somedayReason: "review", lastTouchedAt: now },
      });
    }
    if (toDelete.length > 0) {
      await tx.task.updateMany({
        where: { id: { in: toDelete.map((i) => i.taskId) }, userId },
        data: { trashedAt: now, lastTouchedAt: now },
      });
    }
    if (toTomorrow.length > 0) {
      await tx.task.updateMany({
        where: { id: { in: toTomorrow.map((i) => i.taskId) }, userId },
        data: { lastTouchedAt: now },
      });
    }
    await tx.dayPlan.update({
      where: { id: plan.id },
      data: { status: "closed", closedAt: now },
    });
  });

  const result: CloseDayResult = {
    date: input.date,
    status: "closed",
    planned: plan.items.length,
    done: done.filter((item) => !item.task.trashedAt).length,
    toTomorrow: toTomorrow.length,
    toSomeday: toSomeday.length,
    deleted:
      toDelete.length + done.filter((item) => item.task.trashedAt).length,
    alreadyClosed: false,
  };

  recordActivation("day_closed", userId, {
    date: input.date,
    planned: result.planned,
    done: result.done,
    toTomorrow: result.toTomorrow,
    toSomeday: result.toSomeday,
    deleted: result.deleted,
    channel,
  });
  for (let index = 0; index < toSomeday.length; index += 1) {
    recordActivation("task_to_someday", userId, { reason: "review" });
  }

  // The adaptive limit reads the closed plans; refresh what it points to.
  const suggestion = await suggestLimit(userId, now);
  await prisma.planSettings.updateMany({
    where: { userId },
    data: { limitSuggestion: suggestion },
  });
  return result;
}
