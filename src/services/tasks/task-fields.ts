import { RRule } from "rrule";

import { prisma } from "@/lib/prisma";
import { normalizeRecurrenceRule } from "@/lib/utils/normalize-recurrence-rules";

import { hasForeignTagIds } from "./labels";

/**
 * The checks the connector writes (MCP tools, `/api/connect/tasks`) share for
 * a task's labels, repeat and hours, so they accept exactly what
 * `PUT /api/tasks/[id]` accepts.
 */

/** A valid RRULE normalised for storage, or null when it cannot be read. */
export function parseRepeatRule(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw.trim() || raw.length > 500) return null;
  const rule = normalizeRecurrenceRule(raw.trim());
  if (!rule) return null;
  try {
    RRule.fromString(rule);
  } catch {
    return null;
  }
  return rule;
}

export type FieldCheck = { ok: true } | { ok: false; error: string };

/** Labels must be the person's own; the work schedule must be the planner's own. */
export async function checkLabelsAndHours(input: {
  userId: string;
  /** Whose work schedules apply: the assignee, else the caller. */
  schedulingUserId: string;
  tagIds?: unknown;
  scheduleId?: string | null;
}): Promise<FieldCheck> {
  if (await hasForeignTagIds(input.userId, input.tagIds)) {
    return { ok: false, error: "Invalid label" };
  }
  if (input.scheduleId) {
    const schedule = await prisma.workSchedule.findFirst({
      where: { id: input.scheduleId, userId: input.schedulingUserId },
      select: { id: true },
    });
    if (!schedule) return { ok: false, error: "Invalid work schedule" };
  }
  return { ok: true };
}
