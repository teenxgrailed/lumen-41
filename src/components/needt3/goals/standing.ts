/**
 * A goal's standing on its card, pure: at risk (a deadline within 30 days and
 * progress behind the time gone, or already past) or on track. The lag rule is
 * `goalRisk`'s ("behind"), reused, so the card and the hint agree.
 */
import type { GoalView } from "@/lib/goals";
import { addDays, daysBetween } from "@/lib/needt3/derive";
import { type DayFields, taskDay } from "@/lib/needt3/task-day";

import { goalRisk } from "../habits/cards/model";

/** A deadline further out than this is never "at risk" yet. */
export const AT_RISK_WITHIN_DAYS = 30;

type StandingGoal = Pick<
  GoalView,
  "status" | "deadline" | "createdAt" | "progress"
>;

export interface GoalStanding {
  atRisk: boolean;
  /** Days to the deadline (negative = past), null without one. */
  daysLeft: number | null;
  /**
   * "At risk · 12d left" / "At risk · overdue" / "On track"; null when there is
   * nothing to say (no deadline, or no progress to compare with the time).
   */
  label: string | null;
  /** The longer reason (`goalRisk`'s words), for a tooltip. */
  hint: string | null;
}

export function goalStanding(goal: StandingGoal, today: string): GoalStanding {
  const daysLeft = goal.deadline
    ? daysBetween(today, goal.deadline.slice(0, 10))
    : null;
  const risk = goalRisk(goal, today);
  const lagging = risk?.level === "late" || risk?.level === "behind";
  const atRisk =
    lagging && daysLeft !== null && daysLeft <= AT_RISK_WITHIN_DAYS;
  return {
    atRisk,
    daysLeft,
    label: atRisk
      ? daysLeft !== null && daysLeft < 0
        ? "At risk · overdue"
        : `At risk · ${daysLeft}d left`
      : daysLeft !== null && goal.progress.percent !== null
        ? "On track"
        : null,
    hint: risk?.text ?? null,
  };
}

/**
 * At-risk goals first, the soonest deadline leading; everything else keeps its
 * order (a stable sort on the standing alone).
 */
export function sortByRisk<T extends StandingGoal>(
  goals: readonly T[],
  today: string
): T[] {
  const rank = (g: T) => {
    const s = goalStanding(g, today);
    return s.atRisk ? (s.daysLeft ?? 0) : Number.POSITIVE_INFINITY;
  };
  return goals
    .map((g, i) => ({ g, i, r: rank(g) }))
    .sort((a, b) => {
      if (a.r === b.r) return a.i - b.i;
      return a.r < b.r ? -1 : 1;
    })
    .map((x) => x.g);
}

/** Whether a day ("YYYY-MM-DD") falls in the 7 days that start today. */
export function inNextWeek(day: string | null | undefined, today: string) {
  return !!day && day >= today && day <= addDays(today, 6);
}

/**
 * A goal's plan from its linked tasks: the day the next step sits on (due or
 * scheduled, the day the rest of the app draws it on) and whether any open
 * task is on a day in the next 7. `byId` is the person's task list.
 */
export function goalPlan(
  linked: readonly { id: string; status: string }[],
  step: { id: string } | null,
  byId: ReadonlyMap<
    string,
    Pick<DayFields, "dueDate" | "scheduledStart" | "repeat">
  >,
  today: string
): { stepDay: string | null; planned: boolean } {
  const dayOf = (id: string) => {
    const t = byId.get(id);
    return t ? taskDay(t, today) : null;
  };
  return {
    stepDay: step ? dayOf(step.id) : null,
    planned: linked.some(
      (t) => t.status !== "completed" && inNextWeek(dayOf(t.id), today)
    ),
  };
}
