import { formatDateOnlyWithWeekday } from "@/lib/date-utils";
import { notify } from "@/lib/notifications";

/**
 * The server leaves a recurring task alone when it is ticked a second time on
 * the day it was completed (the next occurrence is ahead), and says so with
 * this field on the task it returns.
 */
export interface RecurringAlreadyDoneBody {
  recurringAlreadyDone?: { nextDueDate: string | null } | null;
}

/** The line shown when a repeat tick did nothing. */
export function recurringAlreadyDoneMessage(
  nextDueDate: string | null | undefined
): string {
  return nextDueDate
    ? `Already done today. Next time: ${formatDateOnlyWithWeekday(nextDueDate)}`
    : "Already done today.";
}

/**
 * Tells the person a tick on a repeating task was not counted again. Returns
 * true when the answer carried the flag, so the caller can stop treating the
 * write as a completion.
 */
export function noticeRecurringAlreadyDone(
  body: RecurringAlreadyDoneBody | null | undefined
): boolean {
  const flag = body?.recurringAlreadyDone;
  if (!flag) return false;
  notify.info(recurringAlreadyDoneMessage(flag.nextDueDate), {
    dedupeKey: "recurring-already-done",
  });
  return true;
}
