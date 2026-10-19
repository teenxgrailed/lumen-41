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
    "feedId" | "runId" | "status" | "sessionId" | "message"
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
