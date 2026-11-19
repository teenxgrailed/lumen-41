import { getDayPlan } from "@/services/day-plan";
import type { PlanItemView, PlanView } from "@/services/day-plan/plan";
import { userTimeZone } from "@/services/day-plan/settings";

import { newDate } from "@/lib/date-utils";
import { habitDayKey } from "@/lib/habit-completion-date";

import type { OutgoingMessage, PlanAction } from "./types";

/* Plan rendering for messengers. Kept free of the task-update and rate-limit
 * imports of core.ts so the worker bundle (touch sweep) stays small and never
 * pulls in the HTML sanitizer. */

const isDone = (item: PlanItemView) =>
  item.status === "completed" || item.resolution === "done";

/** The plan as text, with a done/later action on every task still open. */
export function renderPlan(
  header: string,
  plan: PlanView | null,
  footer?: string
): { text: string; actions: PlanAction[] } {
  const items = (plan?.items ?? []).filter(
    (item) => item.resolution === null || item.resolution === "done"
  );
  const lines: string[] = [header];
  const actions: PlanAction[] = [];
  if (items.length === 0) {
    lines.push("", "Nothing is planned.");
  } else {
    lines.push("");
    for (const item of items) {
      if (isDone(item)) {
        lines.push(`✓ ${item.title}`);
      } else {
        lines.push(`- ${item.title}${item.isMain ? " (main)" : ""}`);
        actions.push({
          taskId: item.taskId,
          action: "done",
          title: item.title,
          dateKey: plan?.date,
        });
        actions.push({
          taskId: item.taskId,
          action: "later",
          title: item.title,
          dateKey: plan?.date,
        });
      }
    }
    const done = items.filter(isDone).length;
    lines.push("", `${done} of ${items.length} done.`);
  }
  if (footer) lines.push("", footer);
  return { text: lines.join("\n"), actions };
}

/**
 * The morning plan or the evening review of a person, as an outgoing message.
 * The caller decides whether to send it (the touch sweep owns the schedule).
 */
export async function buildTouchMessage(
  userId: string,
  kind: "morning" | "evening",
  now: Date = newDate()
): Promise<OutgoingMessage> {
  const today = habitDayKey(now, await userTimeZone(userId));
  const { plan } = await getDayPlan(userId, today, now);
  const rendered =
    kind === "morning"
      ? renderPlan("Plan for today", plan)
      : renderPlan(
          "Evening review",
          plan,
          "What is on for tomorrow? Reply with text or a voice note."
        );
  return { kind, ...rendered };
}
