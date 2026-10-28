import { addMinutes, hhmm, hourOf } from "@/lib/needt3/derive";
import type { V3Task, V3TaskPatch } from "@/lib/needt3/map";

/**
 * Pinned = `scheduleLocked` with a time: the scheduler will not move the task.
 * The app writes it through `PUT /api/tasks/[id]` (see
 * `services/tasks/task-placement`, which holds the server half); this is the
 * screen half, pure, shared by the desktop task menu and the phone sheet.
 */
type PinTask = Pick<
  V3Task,
  | "done"
  | "isFixed"
  | "scheduledStart"
  | "scheduledEnd"
  | "estimatedMinutes"
  | "trashedAt"
>;

export const isPinned = (t: PinTask) =>
  !t.done && t.isFixed && !!t.scheduledStart;

/** It has a time and is not pinned yet: "Pin here" is on offer. */
export const canPinHere = (t: PinTask) =>
  !t.done && !t.trashedAt && !t.isFixed && !!t.scheduledStart;

/** It is pinned: "Let Needt schedule it" is on offer. */
export const canUnpin = (t: PinTask) => isPinned(t) && !t.trashedAt;

/** "14:00", the time the task is held at. */
export const pinTime = (t: Pick<V3Task, "scheduledStart">) =>
  hhmm(hourOf(t.scheduledStart));

export const pinTitle = (t: Pick<V3Task, "scheduledStart">) =>
  `Pinned at ${pinTime(t)} — the scheduler won't move it`;

/**
 * Hold the task where it already is. The server freezes a block only when it
 * gets the start and the end together with `scheduleLocked`, so both go along.
 */
export function pinPatch(
  t: Pick<V3Task, "scheduledStart" | "scheduledEnd" | "estimatedMinutes">
): V3TaskPatch {
  const end =
    t.scheduledEnd ?? addMinutes(t.scheduledStart, t.estimatedMinutes || 30);
  return {
    isFixed: true,
    auto: false,
    ...(t.scheduledStart ? { scheduledStart: t.scheduledStart } : {}),
    ...(end ? { scheduledEnd: end } : {}),
  };
}

/** Hand it back to the scheduler, which may move it. */
export const unpinPatch = (): V3TaskPatch => ({ isFixed: false, auto: true });
