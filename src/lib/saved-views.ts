import {
  SavedViewResource,
  SavedViewVisibility,
  WorkspaceRole,
} from "@prisma/client";
import { z } from "zod";

import { partialWithoutDefaults } from "@/lib/zod-patch";

export const savedViewInputSchema = z.object({
  name: z.string().trim().min(1).max(80),
  visibility: z.nativeEnum(SavedViewVisibility),
  resource: z.nativeEnum(SavedViewResource),
  queryVersion: z.literal(1).default(1),
  type: z.enum(["table", "board", "list", "timeline", "calendar", "gallery"]),
  boardId: z.string().min(1).nullable().optional(),
  groupBy: z
    // "date" is the Tasks screen's own day sections (prefs.taskView.group)
    .enum(["status", "priority", "project", "assignee", "stage", "date"])
    .nullable()
    .optional(),
  filters: z
    .array(
      z.object({
        field: z.enum([
          "status",
          "priority",
          "projectId",
          "assigneeId",
          "tagId",
          "due",
          "archived",
          // Tasks screen: which list (inbox | today | upcoming | all)
          "list",
          // Tasks screen: completed tasks (hide | today | always)
          "completed",
        ]),
        operator: z.enum([
          "eq",
          "neq",
          "in",
          "not_in",
          "before",
          "after",
          "is",
        ]),
        value: z.union([
          z.string().max(200),
          z.array(z.string().max(200)).max(50),
          z.boolean(),
          z.null(),
        ]),
      })
    )
    .max(20)
    .default([]),
  sort: z
    .array(
      z.object({
        field: z.enum([
          "createdAt",
          "updatedAt",
          "dueDate",
          "deadline",
          "priority",
          "position",
          "name",
          "title",
          "scheduledStart",
          // "overdue" desc = overdue tasks first, in a list of their own
          "overdue",
        ]),
        direction: z.enum(["asc", "desc"]),
      })
    )
    .max(3)
    .default([]),
  position: z.number().finite().default(0),
});

export const savedViewPatchSchema = partialWithoutDefaults(
  savedViewInputSchema
).extend({
  queryVersion: z.literal(1).optional(),
});

export function canManageWorkspaceView(role: WorkspaceRole) {
  return role === WorkspaceRole.OWNER || role === WorkspaceRole.EDITOR;
}
