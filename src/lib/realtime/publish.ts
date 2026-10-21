import { newDate } from "@/lib/date-utils";
import { logger } from "@/lib/logger";
import { getRedisConnection } from "@/lib/queue/connection";
import {
  RealtimeEvent,
  RealtimeEventType,
  getUserRealtimeChannel,
} from "@/lib/realtime/channels";

const LOG_SOURCE = "RealtimePublish";

export async function publishRealtimeEvent(
  userId: string,
  type: RealtimeEventType,
  details?: Pick<
    RealtimeEvent,
    | "feedId"
    | "runId"
    | "status"
    | "sessionId"
    | "message"
    | "minutes"
    | "taskId"
    | "taskTitle"
  >
): Promise<void> {
  if (!process.env.REDIS_URL?.trim()) {
    await logger.debug(
      "Realtime publish skipped because Redis is not configured",
      { userId, type },
      LOG_SOURCE
    );
    return;
  }
  const event: RealtimeEvent = {
    type,
    occurredAt: newDate().toISOString(),
    ...details,
  };
  await getRedisConnection().publish(
    getUserRealtimeChannel(userId),
    JSON.stringify(event)
  );
}

/**
 * Publish for a write that already succeeded: a Redis hiccup must never turn
 * a saved change into an error for the caller (the open app just refreshes
 * on its next poll or focus).
 */
export async function publishRealtimeEventSafe(
  userId: string,
  type: RealtimeEventType
): Promise<void> {
  try {
    await publishRealtimeEvent(userId, type);
  } catch (error) {
    await logger.warn(
      "Could not publish realtime event",
      {
        userId,
        type,
        error: error instanceof Error ? error.message : String(error),
      },
      LOG_SOURCE
    );
  }
}
