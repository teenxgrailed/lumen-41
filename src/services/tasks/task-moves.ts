/**
 * Plan 11 T-2: does an update move a task to a later day? Counted on
 * `Task.moveCount`; two or more moves ask for a two-minute way in.
 *
 * Only the person's own moves reach this (the task routes and the ops the
 * connector and Ask use); the scheduler writes placements through its own
 * service and never counts. Completing a task — which advances a repeating
 * one to its next date — is not a move. Days are the person's calendar days,
 * so a time change within one day is not a move and 23:00 → 09:00 tomorrow is.
 */
import { formatInTimeZone, newDate } from "@/lib/date-utils";

type When = Date | string | null | undefined;

function dayKey(v: When, timeZone: string): string | null {
  if (v == null) return null;
  const d = newDate(v);
  if (Number.isNaN(d.getTime())) return null;
  try {
    return formatInTimeZone(d, timeZone, "yyyy-MM-dd");
  } catch {
    return formatInTimeZone(d, "UTC", "yyyy-MM-dd");
  }
}

/** `next` falls on a later day than `prev`; a first value is not a move. */
function laterDay(prev: When, next: When, timeZone: string) {
  const a = dayKey(prev, timeZone);
  const b = dayKey(next, timeZone);
  return a != null && b != null && b > a;
}

export interface MoveFields {
  dueDate?: When;
  scheduledStart?: When;
  postponedUntil?: When;
  status?: string | null;
}

export function isMoveLater(
  before: MoveFields,
  updates: MoveFields,
  timeZone = "UTC"
): boolean {
  if (updates.status === "completed" || before.status === "completed")
    return false;
  if (
    "dueDate" in updates &&
    laterDay(before.dueDate, updates.dueDate, timeZone)
  )
    return true;
  if (
    "scheduledStart" in updates &&
    laterDay(before.scheduledStart, updates.scheduledStart, timeZone)
  )
    return true;
  if ("postponedUntil" in updates && updates.postponedUntil != null) {
    const from = before.postponedUntil ?? newDate();
    return laterDay(from, updates.postponedUntil, timeZone);
  }
  return false;
}
