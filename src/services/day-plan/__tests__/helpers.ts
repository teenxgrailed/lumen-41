import type { DayPlanDb } from "./fake-db";

/** Thursday 19 Nov 2026, 21:00 in Zurich (CET): the evening touch. */
export const NOW = new Date("2026-11-19T20:00:00Z");
export const TODAY = "2026-11-19";
export const TOMORROW = "2026-11-20";
export const USER = "user-1";
export const OTHER = "user-2";

export const daysAgo = (days: number, from: Date = NOW) =>
  new Date(from.getTime() - days * 24 * 60 * 60 * 1000);

export const dayDate = (key: string) => new Date(`${key}T00:00:00.000Z`);

let counter = 0;

/** An open task of USER, created 20 days ago unless said otherwise. */
export function seedTask(
  db: DayPlanDb,
  over: Record<string, unknown> = {}
): Record<string, unknown> & { id: string } {
  counter += 1;
  return db.insert("task", {
    title: `Task ${counter}`,
    status: "todo",
    userId: USER,
    createdAt: new Date(NOW.getTime() - 20 * 86_400_000 + counter * 1000),
    ...over,
  }) as Record<string, unknown> & { id: string };
}

export function seedPlan(
  db: DayPlanDb,
  dateKey: string,
  taskIds: string[],
  over: Record<string, unknown> = {},
  userId = USER
) {
  const plan = db.insert("dayPlan", {
    userId,
    date: dayDate(dateKey),
    ...over,
  });
  taskIds.forEach((taskId, position) =>
    db.insert("dayPlanItem", {
      planId: plan.id,
      taskId,
      position,
      isMain: position < 3,
    })
  );
  return plan;
}

/** Writes the two flag rows the sweep pre-check reads. */
export function seedFlags(
  db: DayPlanDb,
  flags: { day_plan: boolean; someday_sweep?: boolean }
) {
  db.tables.featureFlag.length = 0;
  for (const [key, enabled] of Object.entries(flags)) {
    db.insert("featureFlag", {
      key,
      enabled,
      rolloutPercentage: 100,
      overrides: [],
    });
  }
}
