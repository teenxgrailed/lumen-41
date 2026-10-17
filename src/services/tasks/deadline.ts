/**
 * `deadline` and `dueDate` are separate columns, but a task made with one date
 * (a connector `deadline`, the composer) stores it in both. Moving only the
 * due date must then move the deadline too, or the scheduler keeps placing the
 * task by the stale one.
 */
export interface TaskDates {
  dueDate: Date | null;
  deadline: Date | null;
}

function sameInstant(a: Date | null, b: Date | null): boolean {
  if (a === null || b === null) return a === b;
  return a.getTime() === b.getTime();
}

/**
 * The deadline to write for a patch, or `undefined` to leave it alone.
 * An explicit `deadline` always wins; a changed `dueDate` drags the deadline
 * along only when the two were equal before.
 */
export function deadlineForPatch(
  current: TaskDates,
  patch: { dueDate?: Date | null; deadline?: Date | null }
): Date | null | undefined {
  if (patch.deadline !== undefined) return patch.deadline;
  if (patch.dueDate === undefined) return undefined;
  return sameInstant(current.deadline ?? null, current.dueDate ?? null)
    ? patch.dueDate
    : undefined;
}
