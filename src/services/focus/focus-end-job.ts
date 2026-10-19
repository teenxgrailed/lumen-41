import type { FocusSession } from "@prisma/client";
import { FocusSessionPhase } from "@prisma/client";

import { newDate } from "@/lib/date-utils";
import { projectedEndsAt } from "@/lib/focus-timer";
import { logger } from "@/lib/logger";
import { cancelFocusEnd, scheduleFocusEnd } from "@/lib/queue/enqueue";

const LOG_SOURCE = "focusEndJob";

export type FocusTimed = Pick<
  FocusSession,
  | "id"
  | "endedAt"
  | "pausedAt"
  | "plannedMinutes"
  | "phase"
  | "startedAt"
  | "pausedTotalSeconds"
>;

/**
 * When a session will end, or null if it has no end to announce: it is over,
 * paused (a pause has no end yet), open-ended, or a break.
 */
export function focusEndsAt(session: FocusTimed, now = newDate()): Date | null {
  if (session.endedAt || session.pausedAt) return null;
  if (session.plannedMinutes == null) return null;
  if (session.phase !== FocusSessionPhase.FOCUS) return null;
  return projectedEndsAt(session, now);
}

/**
 * Keep the "Focus ended" job in step with the session row: schedule (or move)
 * it while the session runs toward an end, remove it otherwise. Call after
 * every lifecycle write. Never throws: a queue outage must not fail the
 * person's Start or Pause.
 */
export async function syncFocusEndJob(
  session: FocusTimed | null
): Promise<void> {
  if (!session) return;
  try {
    const endsAt = focusEndsAt(session);
    if (endsAt) await scheduleFocusEnd(session.id, endsAt);
    else await cancelFocusEnd(session.id);
  } catch (error) {
    await logger.warn(
      "Could not sync the Focus ended job",
      {
        sessionId: session.id,
        error: error instanceof Error ? error.message : String(error),
      },
      LOG_SOURCE
    );
  }
}
