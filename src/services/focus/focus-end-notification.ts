import { deliverPush } from "@/services/reminders/reminder-delivery";

import { newDate } from "@/lib/date-utils";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { scheduleFocusEnd } from "@/lib/queue/enqueue";
import { publishRealtimeEvent } from "@/lib/realtime/publish";

import { focusEndsAt } from "./focus-end-job";

const LOG_SOURCE = "focusEndNotification";
/** A job that fires a little early waits for the real end. */
const EARLY_TOLERANCE_MS = 5_000;

export type FocusEndResult =
  | { sent: false; reason: "gone" | "over" | "paused" | "rescheduled" }
  | { sent: true; pushes: number; enabled: boolean };

/**
 * The delayed job's body. It re-reads the session instead of trusting the
 * job: a session that was stopped, paused or extended after the job was queued
 * must stay quiet (or move the job) even if its removal failed.
 */
export async function deliverFocusEnded(
  sessionId: string
): Promise<FocusEndResult> {
  const session = await prisma.focusSession.findUnique({
    where: { id: sessionId },
    include: {
      task: { select: { title: true } },
      user: {
        select: {
          pushSubscriptions: true,
          notificationSettings: { select: { focusEnded: true } },
        },
      },
    },
  });
  if (!session) return { sent: false, reason: "gone" };
  if (session.endedAt) return { sent: false, reason: "over" };
  if (session.pausedAt) return { sent: false, reason: "paused" };

  const endsAt = focusEndsAt(session);
  if (!endsAt) return { sent: false, reason: "over" };
  if (endsAt.getTime() - newDate().getTime() > EARLY_TOLERANCE_MS) {
    await scheduleFocusEnd(session.id, endsAt);
    return { sent: false, reason: "rescheduled" };
  }

  const enabled = session.user.notificationSettings?.focusEnded ?? true;
  const label = session.task?.title ?? session.intention?.trim() ?? "Focus";
  const message = `${label} · ${session.plannedMinutes} min`;

  let pushes = 0;
  if (enabled) {
    const payload = { title: "Focus done", body: message, url: "/today" };
    const results = await Promise.allSettled(
      session.user.pushSubscriptions.map((subscription) =>
        deliverPush(subscription, payload)
      )
    );
    pushes = results.filter(
      (result) => result.status === "fulfilled" && result.value
    ).length;
  }

  // Any open app refreshes its Focus UI; it shows the notice only when the
  // setting is on.
  try {
    await publishRealtimeEvent(session.userId, "focus-ended", {
      sessionId: session.id,
      status: enabled ? "notify" : "silent",
      message,
    });
  } catch (error) {
    await logger.warn(
      "Could not publish the Focus ended event",
      {
        sessionId,
        error: error instanceof Error ? error.message : String(error),
      },
      LOG_SOURCE
    );
  }
  return { sent: true, pushes, enabled };
}
