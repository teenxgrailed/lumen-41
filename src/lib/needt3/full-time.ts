/* "DO FOR THE FULL TIME". A task like "German, 30 min" is not finished when it
   is ticked: the session runs its whole length. Everything else ends its
   focus the moment it is ticked, and the minutes saved go back to the day.
   One rule here, read by the server (completion ends focus) and the screens
   (the toggle, the "N min left" ask). */

export interface FullTimeInput {
  /** The person's own choice; null/undefined = auto. */
  fullTime?: boolean | null;
  habitId?: string | null;
  isRecurring?: boolean | null;
  recurrenceMasterId?: string | null;
}

/**
 * Whether a task is done for the full time. An explicit true or false wins;
 * otherwise a habit's task or a repeating one is, and a one-off is not.
 */
export function effectiveFullTime(task: FullTimeInput): boolean {
  if (task.fullTime === true) return true;
  if (task.fullTime === false) return false;
  return !!task.habitId || !!task.isRecurring || !!task.recurrenceMasterId;
}

/** Whole minutes a session was ended ahead of its planned length; 0 if none. */
export function earlyMinutes(
  plannedMinutes: number | null | undefined,
  focusedMinutes: number
): number {
  if (plannedMinutes == null) return 0;
  return Math.max(0, Math.round(plannedMinutes - focusedMinutes));
}

/** The calm one-line notice after a task is finished inside its focus. */
export function earlyLine(minutes: number): string {
  return `Done ${minutes} min early`;
}

/** The ask when a full-time task is ticked with focus time left. */
export function fullTimeAskLine(minutesLeft: number): string {
  return `${minutesLeft} min left`;
}

/** The task dialog's and the phone sheet's wording for the toggle. */
export const FULL_TIME_LABEL = "Do for the full time";
/** The row's short label (the 116px label column does not fit the toggle). */
export const FULL_TIME_ROW = "Focus";

/** Pressing the toggle sets the opposite of what it comes to now. */
export function fullTimePatch(task: { fullTimeOn?: boolean }): {
  fullTime: boolean;
} {
  return { fullTime: !task.fullTimeOn };
}

/** The line beside the toggle: what it does, and where "on" came from. */
export function fullTimeHint(task: {
  fullTime?: boolean | null;
  fullTimeOn?: boolean;
}): string {
  if (task.fullTime == null)
    return task.fullTimeOn
      ? "On for habits and repeating tasks"
      : "Ticking it ends the focus";
  return task.fullTime
    ? "Focus runs its whole length"
    : "Ticking it ends the focus";
}

/** The phone sheet's two choices. */
export const FULL_TIME_OFF = "Ends when ticked";
export const FULL_TIME_VALUE_ON = "Full time";
export const FULL_TIME_HINT_OFF = "Ticking the task ends its focus session";
export const FULL_TIME_HINT_ON = "The session runs its whole length";
