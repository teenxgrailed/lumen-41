import { OpError } from "../errors";
import { findScopedProject } from "../helpers";
import type { OpContext } from "../types";

export async function assertTagsOwned(ctx: OpContext, tagIds: string[]) {
  if (!tagIds.length) return;
  const owned = await ctx.tx.tag.count({
    where: { id: { in: tagIds }, userId: ctx.userId },
  });
  if (owned !== new Set(tagIds).size) {
    throw new OpError("INVALID_INPUT", "Unknown tag id");
  }
}

/** A live goal in this workspace; linking a task needs no plan. */
export async function assertGoalUsable(ctx: OpContext, goalId: string) {
  const goal = await ctx.tx.goal.findFirst({
    where: { id: goalId, ...ctx.scope, archivedAt: null },
    select: { id: true },
  });
  if (!goal) throw new OpError("INVALID_INPUT", "Unknown goal id");
}

export async function assertProjectUsable(ctx: OpContext, projectId: string) {
  const project = await findScopedProject(ctx, projectId);
  if (project.status === "archived") {
    throw new OpError("CONFLICT", "That project is archived");
  }
}
