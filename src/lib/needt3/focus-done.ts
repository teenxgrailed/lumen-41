/* THE "DONE WITH <TASK>?" ASK. When a Focus session that was for a task ends,
   the person is asked once whether the task is done. This file is the rule
   (when to ask, what the ask offers) and the deep link a Focus-ended push
   opens, so the window, the controller and the push all agree. */

/** Query parameter a Focus-ended push opens the app with: `?focusDone=<taskId>`. */
export const FOCUS_DONE_PARAM = "focusDone";

/** The extra session the ask's "+15 min" starts on the same task. */
export const MORE_FOCUS_MINUTES = 15;

/** Where a Focus-ended push for a task sends the person. */
export function focusDoneUrl(taskId: string): string {
  return `/today?${FOCUS_DONE_PARAM}=${encodeURIComponent(taskId)}`;
}

/** The task id in a location's search string, or null. */
export function readFocusDoneParam(search: string): string | null {
  const id = new URLSearchParams(search).get(FOCUS_DONE_PARAM);
  return id && id.trim() ? id.trim() : null;
}

/** The search string without the parameter ("" when nothing else is left). */
export function withoutFocusDoneParam(search: string): string {
  const params = new URLSearchParams(search);
  params.delete(FOCUS_DONE_PARAM);
  const rest = params.toString();
  return rest ? `?${rest}` : "";
}

export interface DoneAskInput {
  /** The session's task, if it had one. */
  taskId: string | null;
  /** The task as the cache has it; undefined while unknown or gone. */
  task: { done: boolean; trashedAt?: string | null } | undefined;
  isBreak: boolean;
}

/** Ask only for a real, open task. No task, a break, a finished one: no ask. */
export function shouldAskDone({ taskId, task, isBreak }: DoneAskInput) {
  return !!taskId && !isBreak && !!task && !task.done && !task.trashedAt;
}

/** "+15 min" is offered when the clock ran out, not when the person stopped. */
export function canFocusMore(how: "complete" | "stopped") {
  return how === "complete";
}
