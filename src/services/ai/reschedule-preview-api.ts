import { z } from "zod";

import type { WorkspaceAccess } from "@/lib/auth/workspace-auth";

import {
  applyReschedulePreview,
  createReschedulePreview,
  undoReschedulePreview,
} from "./reschedule-preview";

/* Who asked: the chat preview card or the Home "missed tasks" card (a preview
   is shown, Keep is pressed; Home adds `source: home_missed` to the same
   events) or "Fill it" (placed in one click, nothing shown, never a Keep). */
const via = z.enum(["chat", "fill", "home_missed"]).default("chat");

/**
 * The one request shape of the reschedule preview, shared by the app route
 * (`/api/tasks/reschedule-preview`) and the bearer-token route
 * (`/api/connect/reschedule-preview`) so the two cannot drift.
 *
 * `taskIds` on `preview` re-plans only those tasks (at most 100). Ids that are
 * unknown, belong to someone else's workspace, are completed, pinned or not
 * missed are not an error: they come back in `skipped` and stay where they
 * are. `apply` and `undo` need no ids; the token already holds the set.
 */
export const reschedulePreviewRequestSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("preview"),
    via,
    taskIds: z.array(z.string().min(1).max(200)).min(1).max(100).optional(),
  }),
  z.object({ action: z.literal("apply"), token: z.string().min(1), via }),
  z.object({ action: z.literal("undo"), token: z.string().min(1), via }),
]);

export async function runReschedulePreviewAction(
  userId: string,
  workspace: WorkspaceAccess,
  body: unknown
) {
  const input = reschedulePreviewRequestSchema.parse(body);
  if (input.action === "preview") {
    return createReschedulePreview(userId, workspace, {
      via: input.via,
      ...(input.taskIds ? { taskIds: input.taskIds } : {}),
    });
  }
  if (input.action === "apply") {
    return applyReschedulePreview(userId, workspace, input.token, {
      via: input.via,
    });
  }
  return undoReschedulePreview(userId, workspace, input.token, {
    via: input.via,
  });
}
