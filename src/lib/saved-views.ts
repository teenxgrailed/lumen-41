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
    .enum(["status", "priority", "project", "assignee", "stage"])
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
