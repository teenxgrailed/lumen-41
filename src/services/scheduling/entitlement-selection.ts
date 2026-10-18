import type { LimitStatus } from "@/lib/entitlements";

export function selectTasksWithinAutoScheduleLimit<T>(
  tasks: T[],
  entitlement: Pick<LimitStatus, "limit" | "remaining">,
  isAlreadyScheduled: (task: T) => boolean
): T[] {
  if (entitlement.limit === null) return tasks;

  const alreadyScheduled = tasks
    .filter(isAlreadyScheduled)
    .slice(0, entitlement.limit);
  const newCandidates = tasks.filter((task) => !isAlreadyScheduled(task));
  const newSlots = Math.min(
    entitlement.remaining ?? 0,
    Math.max(0, entitlement.limit - alreadyScheduled.length)
  );
  return [
    ...alreadyScheduled,
    ...newCandidates.slice(0, newSlots),
  ];
}
