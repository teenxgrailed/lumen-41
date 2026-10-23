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

/** Why a task is full time without being asked: its habit, or its repeat. */
export type FullTimeAuto = "habit" | "repeat" | null;

/**
 * A habit's task and a repeating one are ALWAYS full time (the design's
 * "Auto"): the toggle shows an Auto tag, locked on, and no stored choice can
 * turn it off. A one-off has no such reason.
 */
export function fullTimeAuto(task: FullTimeInput): FullTimeAuto {
  if (task.habitId) return "habit";
  if (task.isRecurring || task.recurrenceMasterId) return "repeat";
  return null;
}

/**
 * Whether a task is done for the full time: forced on for habits and
 * repeating tasks (a stored `false` does not override that), otherwise the
 * person's own choice; a one-off defaults to off.
 */
export function effectiveFullTime(task: FullTimeInput): boolean {
  return fullTimeAuto(task) != null || task.fullTime === true;
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

/** The small tag beside a switch that is locked on by itself. */
export const FULL_TIME_AUTO_TAG = "Auto";

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

/** The line beside the toggle: what it does, and why it is locked on. */
export function fullTimeHint(task: {
  fullTimeOn?: boolean;
  fullTimeAuto?: FullTimeAuto;
}): string {
  if (task.fullTimeAuto === "habit") return "Habits always run the full time";
  if (task.fullTimeAuto === "repeat")
    return "Repeating tasks run the full time";
  return task.fullTimeOn
    ? "Done before the time is up asks first"
    : "Done ends the focus right away";
}

/** The phone sheet's two choices. */
export const FULL_TIME_OFF = "Ends when ticked";
export const FULL_TIME_VALUE_ON = "Full time";
export const FULL_TIME_HINT_OFF = "Ticking the task ends its focus session";
export const FULL_TIME_HINT_ON = "The session runs its whole length";
