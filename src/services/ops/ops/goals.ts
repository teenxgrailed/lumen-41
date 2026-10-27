import {
  type GoalRow,
  checkInView,
  loadGoalViews,
} from "@/services/goals/progress";
import type { Prisma } from "@prisma/client";
import { z } from "zod";

import { newDate } from "@/lib/date-utils";
import { canUseGoals } from "@/lib/entitlements";
import {
  GOAL_AREA_MAX,
  GOAL_NOTE_MAX,
  GOAL_PROJECTS_MAX,
  GOAL_TITLE_MAX,
  GOAL_UNIT_MAX,
  type GoalView,
  stripGoalPrefix,
} from "@/lib/goals";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { sanitizeTaskDescriptionForStorage } from "@/lib/task-description-format";

import { OpError } from "../errors";
import {
  assertProjectActive,
  dateInputSchema,
  dateOrNull,
  findScopedTask,
  isoOrNull,
  publishTasksUpdated,
  taskInclude,
  taskView,
  touched,
} from "../helpers";
import { defineOp } from "../types";
import type { OpContext, TouchedRow } from "../types";
import { taskArchive, taskRestore } from "./tasks";

const LOG_SOURCE = "goal-ops";

const goalId = z.string().min(1);
const title = z.string().trim().min(1).max(GOAL_TITLE_MAX);
const description = z.string().max(20000);
const area = z.string().trim().min(1).max(GOAL_AREA_MAX);
const status = z.enum(["active", "achieved", "dropped"]);
const projectIds = z.array(z.string().min(1)).max(GOAL_PROJECTS_MAX);
const value = z.number().finite().min(-1e12).max(1e12);
const percent = z.number().int().min(0).max(100);
const unit = z.string().trim().min(1).max(GOAL_UNIT_MAX);
const checkIn = z
  .object({
    enabled: z.boolean().optional(),
    weekday: z.number().int().min(0).max(6).optional(),
    hour: z.number().int().min(0).max(23).optional(),
  })
  .strict();

/** Every goal column an inverse may write back; dates as ISO strings. */
const restorableFields = z
  .object({
    title: z.string(),
    description: z.string().nullable(),
    deadline: isoOrNull,
    area: z.string().nullable(),
    status: z.string(),
    achievedAt: isoOrNull,
    parentId: z.string().nullable(),
    position: z.number(),
    targetValue: z.number().nullable(),
    currentValue: z.number().nullable(),
    unit: z.string().nullable(),
    manualPercent: z.number().int().nullable(),
    checkInEnabled: z.boolean(),
    checkInWeekday: z.number().int(),
    checkInHour: z.number().int(),
    lastCheckInAt: isoOrNull,
    archivedAt: isoOrNull,
  })
  .partial()
  .strict();
type RestorableFields = z.infer<typeof restorableFields>;
const DATE_FIELDS = new Set([
  "deadline",
  "achievedAt",
  "lastCheckInAt",
  "archivedAt",
]);

function pickRestorable(
  goal: Record<string, unknown>,
  keys: (keyof RestorableFields)[]
): RestorableFields {
  const out: Record<string, unknown> = {};
  for (const key of [...new Set(keys)]) {
    const current = goal[key];
    out[key] =
      current instanceof Date ? current.toISOString() : (current ?? null);
  }
  return out as RestorableFields;
}

function restorableToData(fields: RestorableFields) {
  const data: Record<string, unknown> = {};
  for (const [key, current] of Object.entries(fields)) {
    data[key] = DATE_FIELDS.has(key)
      ? dateOrNull(current as string | null)
      : current;
  }
  return data as Prisma.GoalUncheckedUpdateInput;
}

async function assertGoalsAllowed(ctx: OpContext) {
  const entitlement = await canUseGoals(ctx.userId);
  if (!entitlement.allowed) {
    throw new OpError("UPGRADE_REQUIRED", "Goals are part of Pro", {
      plan: entitlement.plan,
    });
  }
}

export async function findScopedGoal(
  ctx: OpContext,
  id: string,
  options: { includeArchived?: boolean } = {}
) {
  const goal = await ctx.tx.goal.findFirst({
    where: {
      id,
      ...ctx.scope,
      ...(options.includeArchived ? {} : { archivedAt: null }),
    },
  });
  if (!goal) throw new OpError("NOT_FOUND", "Goal not found");
  return goal as GoalRow & {
    userId: string;
    workspaceId: string;
  };
}

/** One level of subgoals: the parent must be a top-level goal. */
async function assertParentUsable(
  ctx: OpContext,
  parentId: string,
  childId?: string
) {
  if (parentId === childId) {
    throw new OpError("INVALID_INPUT", "A goal cannot be its own parent");
  }
  const parent = await findScopedGoal(ctx, parentId).catch(() => {
    throw new OpError("INVALID_INPUT", "Unknown parent goal");
  });
  if (parent.parentId) {
    throw new OpError(
      "INVALID_INPUT",
      "Subgoals go one level deep: that goal is already a subgoal"
    );
  }
  if (childId) {
    const children = await ctx.tx.goal.count({
      where: { parentId: childId, archivedAt: null },
    });
    if (children > 0) {
      throw new OpError(
        "INVALID_INPUT",
        "A goal with subgoals cannot become a subgoal"
      );
    }
  }
}

async function assertProjectsUsable(ctx: OpContext, ids: string[]) {
  const unique = [...new Set(ids)];
  if (!unique.length) return unique;
  const found = await ctx.tx.project.count({
    where: { id: { in: unique }, ...ctx.scope },
  });
  if (found !== unique.length) {
    throw new OpError("INVALID_INPUT", "Unknown project id");
  }
  return unique;
}

async function linkedProjectIds(ctx: OpContext, id: string) {
  const links = await ctx.tx.goalProject.findMany({
    where: { goalId: id },
    select: { projectId: true },
  });
  return links.map((link) => link.projectId).sort();
}

async function setLinkedProjects(ctx: OpContext, id: string, ids: string[]) {
  await ctx.tx.goalProject.deleteMany({ where: { goalId: id } });
  if (ids.length) {
    await ctx.tx.goalProject.createMany({
      data: ids.map((projectId) => ({ goalId: id, projectId })),
      skipDuplicates: true,
    });
  }
}

async function view(ctx: OpContext, goal: GoalRow): Promise<GoalView> {
  const [result] = await loadGoalViews(ctx.tx, ctx.scope, [goal]);
  return result;
}

async function nextPosition(ctx: OpContext, parentId: string | null) {
  const last = await ctx.tx.goal.findFirst({
    where: { ...ctx.scope, parentId, archivedAt: null },
    orderBy: { position: "desc" },
    select: { position: true },
  });
  return (last?.position ?? 0) + 1;
}

/** Manual progress fields from an op input, as Goal columns. */
function manualData(input: {
  targetValue?: number | null;
  currentValue?: number | null;
  unit?: string | null;
  percent?: number | null;
}) {
  const data: Prisma.GoalUncheckedUpdateInput = {};
  const keys: (keyof RestorableFields)[] = [];
  if (input.targetValue !== undefined) {
    data.targetValue = input.targetValue;
    keys.push("targetValue");
  }
  if (input.currentValue !== undefined) {
    data.currentValue = input.currentValue;
    keys.push("currentValue");
  }
  if (input.unit !== undefined) {
    data.unit = input.unit;
    keys.push("unit");
  }
  if (input.percent !== undefined) {
    data.manualPercent = input.percent;
    keys.push("manualPercent");
  }
  return { data, keys };
}

function checkInData(input: z.infer<typeof checkIn> | undefined) {
  const data: Prisma.GoalUncheckedUpdateInput = {};
  const keys: (keyof RestorableFields)[] = [];
  if (input?.enabled !== undefined) {
    data.checkInEnabled = input.enabled;
    keys.push("checkInEnabled");
  }
  if (input?.weekday !== undefined) {
    data.checkInWeekday = input.weekday;
    keys.push("checkInWeekday");
  }
  if (input?.hour !== undefined) {
    data.checkInHour = input.hour;
    keys.push("checkInHour");
  }
  return { data, keys };
}

/** Marks the pending "How's <goal>?" nudges read once the person answered. */
function settleCheckInNudges(userId: string, id: string) {
  return async () => {
    try {
      await prisma.proactiveNudge.updateMany({
        where: {
          userId,
          type: "GOAL_CHECKIN",
          readAt: null,
          dedupeKey: { startsWith: `goal:${id}:` },
        },
        data: { readAt: newDate() },
      });
    } catch (error) {
      logger.warn(
        "Could not settle goal check-in nudges",
        { error: error instanceof Error ? error.message : String(error) },
        LOG_SOURCE
      );
    }
  };
}

// ---------------------------------------------------------------- reads

export const goalList = defineOp({
  name: "goal.list",
  description:
    "List goals with their progress. Filters: status (active, achieved, dropped, all), parentId (its subgoals), projectId (goals linked to that project).",
  risk: "read",
  input: z
    .object({
      status: z.enum(["active", "achieved", "dropped", "all"]).default("all"),
      parentId: z.string().min(1).optional(),
      projectId: z.string().min(1).optional(),
      includeArchived: z.boolean().default(false),
      limit: z.number().int().min(1).max(200).default(100),
    })
    .strict(),
  async run(ctx, input) {
    const linked = input.projectId
      ? (
          await ctx.tx.goalProject.findMany({
            where: { projectId: input.projectId },
            select: { goalId: true },
          })
        ).map((link) => link.goalId)
      : null;
    const goals = (await ctx.tx.goal.findMany({
      where: {
        ...ctx.scope,
        ...(input.includeArchived ? {} : { archivedAt: null }),
        ...(input.status === "all" ? {} : { status: input.status }),
        ...(input.parentId ? { parentId: input.parentId } : {}),
        ...(linked ? { id: { in: linked } } : {}),
      },
      orderBy: [{ position: "asc" }, { createdAt: "asc" }],
      take: input.limit,
    })) as GoalRow[];
    return { result: { goals: await loadGoalViews(ctx.tx, ctx.scope, goals) } };
  },
});

export const goalGet = defineOp({
  name: "goal.get",
  description:
    "Read one goal: progress, subgoals, linked projects, the tasks that count towards it and its recent check-ins.",
  risk: "read",
  input: z.object({ goalId }).strict(),
  async run(ctx, input) {
    const goal = await findScopedGoal(ctx, input.goalId, {
      includeArchived: true,
    });
    const [current] = await loadGoalViews(ctx.tx, ctx.scope, [goal]);
    const children = (await ctx.tx.goal.findMany({
      where: { ...ctx.scope, parentId: goal.id, archivedAt: null },
      orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    })) as GoalRow[];
    const tasks = await ctx.tx.task.findMany({
      where: {
        ...ctx.scope,
        isArchived: false,
        trashedAt: null,
        recurrenceMasterId: null,
        OR: [
          { goalId: goal.id },
          ...(current.projectIds.length
            ? [{ projectId: { in: current.projectIds } }]
            : []),
        ],
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: 200,
      include: taskInclude,
    });
    const checkIns = await ctx.tx.goalCheckIn.findMany({
      where: { goalId: goal.id },
      orderBy: { createdAt: "desc" },
      take: 20,
    });
    return {
      result: {
        goal: current,
        subgoals: await loadGoalViews(ctx.tx, ctx.scope, children),
        tasks: tasks.map(taskView),
        checkIns: checkIns.map(checkInView),
      },
    };
  },
});

// ---------------------------------------------------------------- writes

const manualInput = {
  targetValue: value.nullable().optional(),
  currentValue: value.nullable().optional(),
  unit: unit.nullable().optional(),
  percent: percent.nullable().optional(),
};

export const goalCreate = defineOp({
  name: "goal.create",
  description:
    "Create a goal (Pro): title, description (the why), deadline, area (work, money, health, learning, home, relationships, personal, or a custom label), parentId (one level of subgoals), projectIds, manual progress (targetValue, currentValue, unit, or percent 0-100) and the weekly check-in (enabled, weekday 0 = Sunday, hour). A goal is never scheduled. Undo archives it.",
  risk: "reversible",
  input: z
    .object({
      title,
      description: description.optional(),
      deadline: dateInputSchema.optional(),
      area: area.optional(),
      parentId: z.string().min(1).optional(),
      projectIds: projectIds.optional(),
      ...manualInput,
      checkIn: checkIn.optional(),
    })
    .strict(),
  async run(ctx, input) {
    await assertGoalsAllowed(ctx);
    if (input.parentId) await assertParentUsable(ctx, input.parentId);
    const projects = await assertProjectsUsable(ctx, input.projectIds ?? []);
    const goal = (await ctx.tx.goal.create({
      data: {
        userId: ctx.userId,
        workspaceId: ctx.workspaceId,
        title: input.title,
        description: sanitizeTaskDescriptionForStorage(input.description),
        deadline: input.deadline ? newDate(input.deadline) : null,
        area: input.area ?? null,
        parentId: input.parentId ?? null,
        position: await nextPosition(ctx, input.parentId ?? null),
        targetValue: input.targetValue ?? null,
        currentValue: input.currentValue ?? null,
        unit: input.unit ?? null,
        manualPercent: input.percent ?? null,
        ...(input.checkIn?.enabled !== undefined
          ? { checkInEnabled: input.checkIn.enabled }
          : {}),
        ...(input.checkIn?.weekday !== undefined
          ? { checkInWeekday: input.checkIn.weekday }
          : {}),
        ...(input.checkIn?.hour !== undefined
          ? { checkInHour: input.checkIn.hour }
          : {}),
      },
    })) as GoalRow;
    await setLinkedProjects(ctx, goal.id, projects);
    return {
      result: { goal: await view(ctx, goal) },
      before: null,
      inverse: { op: "goal.archive", input: { goalId: goal.id } },
      touched: [touched("goal", goal, null)],
      afterCommit: [publishTasksUpdated(ctx.userId)],
    };
  },
});

export const goalUpdate = defineOp({
  name: "goal.update",
  description:
    "Change a goal: title, description, deadline, area, status (active, achieved, dropped), parentId, projectIds (the full set), position, manual progress (targetValue, currentValue, unit, percent; null clears) or checkIn. Undo writes the previous values back.",
  risk: "reversible",
  input: z
    .object({
      goalId,
      title: title.optional(),
      description: description.nullable().optional(),
      deadline: dateInputSchema.nullable().optional(),
      area: area.nullable().optional(),
      status: status.optional(),
      parentId: z.string().min(1).nullable().optional(),
      projectIds: projectIds.optional(),
      position: z.number().finite().optional(),
      ...manualInput,
      checkIn: checkIn.optional(),
    })
    .strict()
    .refine((input) => Object.keys(input).length > 1, {
      message: "Nothing to update",
    }),
  async run(ctx, input) {
    const goal = await findScopedGoal(ctx, input.goalId);
    const data: Prisma.GoalUncheckedUpdateInput = {};
    const keys: (keyof RestorableFields)[] = [];
    if (input.title !== undefined) {
      data.title = input.title;
      keys.push("title");
    }
    if (input.description !== undefined) {
      data.description =
        input.description === null
          ? null
          : (sanitizeTaskDescriptionForStorage(input.description) ?? null);
      keys.push("description");
    }
    if (input.deadline !== undefined) {
      data.deadline = input.deadline ? newDate(input.deadline) : null;
      keys.push("deadline");
    }
    if (input.area !== undefined) {
      data.area = input.area;
      keys.push("area");
    }
    if (input.status !== undefined && input.status !== goal.status) {
      data.status = input.status;
      data.achievedAt = input.status === "achieved" ? newDate() : null;
      keys.push("status", "achievedAt");
    }
    if (input.parentId !== undefined && input.parentId !== goal.parentId) {
      if (input.parentId)
        await assertParentUsable(ctx, input.parentId, goal.id);
      data.parentId = input.parentId;
      data.position = await nextPosition(ctx, input.parentId);
      keys.push("parentId", "position");
    }
    if (input.position !== undefined) {
      data.position = input.position;
      keys.push("position");
    }
    const manual = manualData(input);
    Object.assign(data, manual.data);
    keys.push(...manual.keys);
    const schedule = checkInData(input.checkIn);
    Object.assign(data, schedule.data);
    keys.push(...schedule.keys);

    const previousProjects = input.projectIds
      ? await linkedProjectIds(ctx, goal.id)
      : undefined;
    const nextProjects = input.projectIds
      ? await assertProjectsUsable(ctx, input.projectIds)
      : undefined;

    const fields = pickRestorable(
      goal as unknown as Record<string, unknown>,
      keys
    );
    // Always bump the row so undo can tell a later edit from this one, also
    // when only the linked projects changed.
    const updated = (await ctx.tx.goal.update({
      where: { id: goal.id },
      data: { ...data, updatedAt: newDate() },
    })) as GoalRow;
    if (nextProjects) await setLinkedProjects(ctx, goal.id, nextProjects);
    return {
      result: { goal: await view(ctx, updated) },
      before: {
        fields,
        ...(previousProjects ? { projectIds: previousProjects } : {}),
      },
      inverse: {
        op: "goal.restore",
        input: {
          goalId: goal.id,
          fields,
          ...(previousProjects ? { projectIds: previousProjects } : {}),
        },
      },
      touched: [touched("goal", updated, goal)],
      afterCommit: [publishTasksUpdated(ctx.userId)],
    };
  },
});

export const goalArchive = defineOp({
  name: "goal.archive",
  description:
    "Archive (delete) a goal. Its tasks stay; they no longer count towards it. Undo brings it back.",
  risk: "reversible",
  input: z.object({ goalId }).strict(),
  async run(ctx, input) {
    const goal = await findScopedGoal(ctx, input.goalId, {
      includeArchived: true,
    });
    if (goal.archivedAt) {
      return { result: { goal: await view(ctx, goal), changed: false } };
    }
    const fields = pickRestorable(goal as unknown as Record<string, unknown>, [
      "archivedAt",
    ]);
    const updated = (await ctx.tx.goal.update({
      where: { id: goal.id },
      data: { archivedAt: newDate() },
    })) as GoalRow;
    return {
      result: { goal: await view(ctx, updated), changed: true },
      before: { fields },
      inverse: { op: "goal.restore", input: { goalId: goal.id, fields } },
      touched: [touched("goal", updated, goal)],
      afterCommit: [publishTasksUpdated(ctx.userId)],
    };
  },
});

/** Inverse-only: writes a goal snapshot (and its linked projects) back. */
export const goalRestore = defineOp({
  name: "goal.restore",
  description: "Write a stored goal snapshot back. Used only by undo.",
  risk: "reversible",
  internal: true,
  input: z
    .object({
      goalId,
      fields: restorableFields,
      projectIds: z.array(z.string()).optional(),
    })
    .strict(),
  async run(ctx, input) {
    const goal = await findScopedGoal(ctx, input.goalId, {
      includeArchived: true,
    });
    const current = pickRestorable(
      goal as unknown as Record<string, unknown>,
      Object.keys(input.fields) as (keyof RestorableFields)[]
    );
    const currentProjects = input.projectIds
      ? await linkedProjectIds(ctx, goal.id)
      : undefined;
    const updated = (await ctx.tx.goal.update({
      where: { id: goal.id },
      data: { ...restorableToData(input.fields), updatedAt: newDate() },
    })) as GoalRow;
    if (input.projectIds) {
      const existing = await ctx.tx.project.findMany({
        where: { id: { in: input.projectIds }, ...ctx.scope },
        select: { id: true },
      });
      await setLinkedProjects(
        ctx,
        goal.id,
        existing.map((project) => project.id)
      );
    }
    return {
      result: { goal: await view(ctx, updated) },
      before: { fields: current },
      inverse: {
        op: "goal.restore",
        input: {
          goalId: goal.id,
          fields: current,
          ...(currentProjects ? { projectIds: currentProjects } : {}),
        },
      },
      touched: [touched("goal", updated, goal)],
      afterCommit: [publishTasksUpdated(ctx.userId)],
    };
  },
});

export const goalCheckIn = defineOp({
  name: "goal.check_in",
  description:
    "Answer \"How's <goal>?\": record a dated check-in with the current value (towards targetValue), a percent (0-100) and/or a note. The value or percent becomes the goal's manual progress. Undo removes the check-in and puts the previous value back.",
  risk: "reversible",
  input: z
    .object({
      goalId,
      value: value.optional(),
      percent: percent.optional(),
      note: z.string().trim().min(1).max(GOAL_NOTE_MAX).optional(),
    })
    .strict()
    .refine(
      (input) =>
        input.value !== undefined ||
        input.percent !== undefined ||
        input.note !== undefined,
      { message: "Give a value, a percent or a note" }
    ),
  async run(ctx, input) {
    const goal = await findScopedGoal(ctx, input.goalId);
    const now = newDate();
    const keys: (keyof RestorableFields)[] = ["lastCheckInAt"];
    const data: Prisma.GoalUncheckedUpdateInput = { lastCheckInAt: now };
    if (input.value !== undefined) {
      data.currentValue = input.value;
      keys.push("currentValue");
    }
    if (input.percent !== undefined) {
      data.manualPercent = input.percent;
      keys.push("manualPercent");
    }
    const fields = pickRestorable(
      goal as unknown as Record<string, unknown>,
      keys
    );
    const entry = await ctx.tx.goalCheckIn.create({
      data: {
        goalId: goal.id,
        userId: ctx.userId,
        value: input.value ?? null,
        percent: input.percent ?? null,
        note: input.note ?? null,
      },
    });
    const updated = (await ctx.tx.goal.update({
      where: { id: goal.id },
      data,
    })) as GoalRow;
    return {
      result: { goal: await view(ctx, updated), checkIn: checkInView(entry) },
      before: { fields },
      inverse: {
        op: "goal.check_in_remove",
        input: { goalId: goal.id, checkInId: entry.id, fields },
      },
      touched: [touched("goal", updated, goal)],
      afterCommit: [
        settleCheckInNudges(ctx.userId, goal.id),
        publishTasksUpdated(ctx.userId),
      ],
    };
  },
});

/** Inverse-only: removes a check-in and writes the goal's values back. */
export const goalCheckInRemove = defineOp({
  name: "goal.check_in_remove",
  description: "Remove a check-in and restore the goal. Used only by undo.",
  risk: "reversible",
  internal: true,
  input: z
    .object({
      goalId,
      checkInId: z.string().min(1),
      fields: restorableFields,
    })
    .strict(),
  async run(ctx, input) {
    const goal = await findScopedGoal(ctx, input.goalId, {
      includeArchived: true,
    });
    await ctx.tx.goalCheckIn.deleteMany({
      where: { id: input.checkInId, goalId: goal.id },
    });
    const updated = (await ctx.tx.goal.update({
      where: { id: goal.id },
      data: restorableToData(input.fields),
    })) as GoalRow;
    return {
      result: { goal: await view(ctx, updated) },
      touched: [touched("goal", updated, goal)],
      afterCommit: [publishTasksUpdated(ctx.userId)],
    };
  },
});

export const goalConvertFromTask = defineOp({
  name: "goal.convert_from_task",
  description:
    "Turn a task into a goal (Pro): the goal takes the task's title (a leading \"GOAL:\" is dropped), description, due date as its deadline and its project as a linked project; each of the task's subtasks becomes a task linked to the goal, ticked ones stay done; the original task is archived. Undo puts the task back and archives the goal and the new tasks.",
  risk: "reversible",
  input: z
    .object({
      taskId: z.string().min(1),
      area: area.optional(),
      parentId: z.string().min(1).optional(),
    })
    .strict(),
  async run(ctx, input) {
    await assertGoalsAllowed(ctx);
    const task = await findScopedTask(ctx, input.taskId);
    assertProjectActive(task);
    if (input.parentId) await assertParentUsable(ctx, input.parentId);
    const parts = await ctx.tx.taskPart.findMany({
      where: { taskId: task.id },
      orderBy: { position: "asc" },
    });
    const workspaceId = task.workspaceId ?? ctx.workspaceId;
    const goal = (await ctx.tx.goal.create({
      data: {
        userId: ctx.userId,
        workspaceId,
        title: stripGoalPrefix(task.title).slice(0, GOAL_TITLE_MAX),
        description: task.description,
        deadline: task.dueDate ?? task.deadline ?? null,
        area: input.area ?? null,
        parentId: input.parentId ?? null,
        position: await nextPosition(ctx, input.parentId ?? null),
        sourceTaskId: task.id,
      },
    })) as GoalRow;
    if (task.projectId) await setLinkedProjects(ctx, goal.id, [task.projectId]);

    const created: Array<Awaited<ReturnType<typeof ctx.tx.task.create>>> = [];
    for (const part of parts) {
      created.push(
        await ctx.tx.task.create({
          data: {
            userId: task.userId ?? ctx.userId,
            workspaceId,
            assigneeId: task.assigneeId ?? ctx.userId,
            title: part.title,
            status: part.done ? "completed" : "todo",
            completedAt: part.done ? newDate() : null,
            priorityLevel: task.priorityLevel,
            projectId: task.projectId,
            goalId: goal.id,
            isAutoScheduled: !part.done,
            autoScheduled: false,
            activities: {
              create: { workspaceId, actorId: ctx.userId, action: "CREATED" },
            },
          },
          include: taskInclude,
        })
      );
    }

    // The original goes the way task.archive takes it, so undo can put it
    // back exactly with that op's own inverse.
    const archived = await taskArchive.run(ctx, { taskId: task.id });
    const restoreTask = archived.inverse?.input ?? null;

    return {
      result: {
        goal: await view(ctx, goal),
        tasks: created.map(taskView),
        archivedTaskId: task.id,
      },
      before: { task: { id: task.id } },
      inverse: {
        op: "goal.unconvert",
        input: {
          goalId: goal.id,
          taskIds: created.map((row) => row.id),
          ...(restoreTask ? { restoreTask } : {}),
        },
      },
      touched: [
        touched("goal", goal, null),
        ...created.map((row) => touched("task", row, null)),
        ...(archived.touched ?? []),
      ] as TouchedRow[],
      afterCommit: [
        ...(archived.afterCommit ?? []),
        publishTasksUpdated(ctx.userId),
      ],
    };
  },
});

/** Inverse-only: undoes a conversion. */
export const goalUnconvert = defineOp({
  name: "goal.unconvert",
  description: "Undo a task-to-goal conversion. Used only by undo.",
  risk: "reversible",
  internal: true,
  input: z
    .object({
      goalId,
      taskIds: z.array(z.string().min(1)).max(100),
      restoreTask: z.record(z.unknown()).optional(),
    })
    .strict(),
  async run(ctx, input) {
    const goal = await findScopedGoal(ctx, input.goalId, {
      includeArchived: true,
    });
    const now = newDate();
    const updated = (await ctx.tx.goal.update({
      where: { id: goal.id },
      data: { archivedAt: now },
    })) as GoalRow;
    const touchedRows: TouchedRow[] = [touched("goal", updated, goal)];
    for (const id of input.taskIds) {
      const row = await ctx.tx.task.findFirst({ where: { id, ...ctx.scope } });
      if (!row) continue;
      const archivedRow = await ctx.tx.task.update({
        where: { id },
        data: {
          isArchived: true,
          archivedAt: now,
          scheduledStart: null,
          scheduledEnd: null,
          scheduleLocked: false,
        },
      });
      await ctx.tx.scheduledBlock.deleteMany({ where: { taskId: id } });
      touchedRows.push(touched("task", archivedRow, row));
    }
    const afterCommit: Array<() => Promise<void> | void> = [
      publishTasksUpdated(ctx.userId),
    ];
    if (input.restoreTask) {
      const restored = await taskRestore.run(
        ctx,
        taskRestore.input.parse(input.restoreTask)
      );
      touchedRows.push(...(restored.touched ?? []));
      afterCommit.push(...(restored.afterCommit ?? []));
    }
    return { result: { goalId: goal.id }, touched: touchedRows, afterCommit };
  },
});

export const goalOps = [
  goalList,
  goalGet,
  goalCreate,
  goalUpdate,
  goalArchive,
  goalRestore,
  goalCheckIn,
  goalCheckInRemove,
  goalConvertFromTask,
  goalUnconvert,
];
