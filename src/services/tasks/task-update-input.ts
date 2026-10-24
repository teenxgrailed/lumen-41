import { entrySchema } from "@/services/tasks/subtasks";
import { placementFields } from "@/services/tasks/task-placement";
import type { TaskFieldPatch } from "@/services/tasks/task-update";
import { z } from "zod";

import { newDate } from "@/lib/date-utils";

import { TaskStatus } from "@/types/task";

/**
 * The body of a connector task update, shared by the MCP tool
 * `needt_update_task` and `PATCH /api/connect/tasks/:id`, so both accept the
 * same fields and hand the same patch to `updateTaskFields`.
 */

export const priorityOrNone = z.enum([
  "NONE",
  "LOW",
  "MEDIUM",
  "HIGH",
  "URGENT",
]);
export const energy = z.enum(["LOW", "MEDIUM", "HIGH"]);
export const repeatRule = z
  .string()
  .min(1)
  .max(500)
  .describe(
    "RRULE text, e.g. FREQ=DAILY, FREQ=WEEKLY;BYDAY=MO,WE or FREQ=MONTHLY."
  );
export const labelIds = z
  .array(z.string().min(1))
  .max(50)
  .describe("Label ids (your own tags); the task ends up with exactly these.");

const taskStatus = z.enum([
  TaskStatus.TODO,
  TaskStatus.IN_PROGRESS,
  TaskStatus.COMPLETED,
]);
const isoDate = z.string().min(1);

export const taskUpdateFields = {
  title: z.string().min(1).max(500).optional(),
  description: z.string().max(20_000).nullable().optional(),
  dueDate: isoDate
    .nullable()
    .optional()
    .describe(
      "ISO 8601; null clears it. Moves the deadline too when the two were equal."
    ),
  deadline: isoDate
    .nullable()
    .optional()
    .describe(
      "ISO 8601 hard deadline the scheduler must beat; null clears it. Set it only to make it differ from dueDate."
    ),
  estimatedMinutes: z
    .number()
    .int()
    .min(1)
    .max(24 * 60)
    .nullable()
    .optional(),
  priority: priorityOrNone.optional(),
  recurrenceRule: repeatRule.nullable().optional(),
  labelIds: labelIds.optional(),
  scheduleId: z
    .string()
    .min(1)
    .nullable()
    .optional()
    .describe("Hours: one of your work schedule ids; null = the default."),
  energy: energy.optional(),
  status: taskStatus.optional(),
  projectId: z
    .string()
    .min(1)
    .nullable()
    .optional()
    .describe("Project in the same workspace; null removes it."),
  entry: entrySchema
    .nullable()
    .optional()
    .describe("The very first small step; null clears it."),
  fullTime: z
    .boolean()
    .nullable()
    .optional()
    .describe(
      "Do for the full time: true keeps a focus session running its whole length when the task is ticked, false ends it at once; null = auto (on for habit and repeating tasks)."
    ),
  dependsOnId: z
    .string()
    .min(1)
    .nullable()
    .optional()
    .describe(
      "Id of an open task this one waits on; null clears it. Loops are refused."
    ),
  originPageId: z
    .string()
    .min(1)
    .nullable()
    .optional()
    .describe("The page the task came from; null detaches it."),
  ...placementFields,
};

export const taskUpdateBody = z.object(taskUpdateFields).strict();
export type TaskUpdateBody = z.infer<typeof taskUpdateBody>;

/** The connector body as a service patch, or the date it could not read. */
export function taskFieldPatchFrom(
  args: TaskUpdateBody
): { ok: true; patch: TaskFieldPatch } | { ok: false; error: string } {
  const dueDate = args.dueDate == null ? args.dueDate : newDate(args.dueDate);
  if (dueDate && Number.isNaN(dueDate.getTime())) {
    return { ok: false, error: "dueDate must be ISO 8601" };
  }
  const deadline =
    args.deadline == null ? args.deadline : newDate(args.deadline);
  if (deadline && Number.isNaN(deadline.getTime())) {
    return { ok: false, error: "deadline must be ISO 8601" };
  }
  return {
    ok: true,
    patch: {
      title: args.title,
      description: args.description,
      dueDate,
      deadline,
      estimatedMinutes: args.estimatedMinutes,
      ...(args.priority === "NONE"
        ? { noPriority: true }
        : { priorityLevel: args.priority }),
      recurrenceRule: args.recurrenceRule,
      tagIds: args.labelIds,
      scheduleId: args.scheduleId,
      energyRequired: args.energy,
      status: args.status,
      projectId: args.projectId,
      entry: args.entry,
      fullTime: args.fullTime,
      dependsOnId: args.dependsOnId,
      originPageId: args.originPageId,
      start: args.start,
      pinned: args.pinned,
      autoSchedule: args.autoSchedule,
    },
  };
}
