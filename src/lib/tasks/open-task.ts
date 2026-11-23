import type { Prisma } from "@prisma/client";

/**
 * Idea cards (openspec idea-cards): a `Task` row is either work the person owes
 * (`TASK`) or an optional idea offered now and then (`IDEA`). An idea is never
 * overdue, never scheduled, never reminded about and never counted as work.
 *
 * Every query that means "the person's tasks" (the scheduler, the day plan,
 * Always easy start, reminders, nudges, digests, overdue reads, plan limits)
 * spreads this into its `where`. It is the one place that decides what an idea
 * is to those readers, so a rule change is made once.
 *
 *   prisma.task.findMany({ where: { userId, ...openTaskWhere() } })
 *
 * A reader that really wants ideas (the idea ops, the card read, the idea
 * sweep) names `kind` itself instead; `__tests__/call-sites.test.ts` fails when
 * a scheduler or notification read does neither.
 */
export function openTaskWhere(): Pick<Prisma.TaskWhereInput, "kind"> {
  return { kind: "TASK" };
}

/** The reverse: only ideas. */
export function ideaWhere(): Pick<Prisma.TaskWhereInput, "kind"> {
  return { kind: "IDEA" };
}
