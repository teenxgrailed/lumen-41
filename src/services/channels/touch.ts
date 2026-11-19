import { logger } from "@/lib/logger";

import { listActiveLinks } from "./links";
import { configuredAdapters } from "./registry";
import type { ChannelAdapter, OutgoingMessage } from "./types";

const LOG_SOURCE = "channels-touch";

/**
 * Sends one daily touch (morning plan or evening review) to every chat the
 * person has linked. The touch sweep calls this next to push and counts the
 * whole thing as one touch. It never throws: a channel that fails is logged and
 * skipped. With no channel configured it sends nothing and calls nothing.
 * Returns how many chats were sent to.
 */
export async function sendChannelTouch(
  userId: string,
  message: OutgoingMessage,
  adapters: ChannelAdapter[] = configuredAdapters()
): Promise<number> {
  if (adapters.length === 0) return 0;
  const byChannel = new Map(adapters.map((a) => [a.channel, a]));
  let sent = 0;
  for (const link of await listActiveLinks(userId)) {
    const adapter = byChannel.get(link.channel);
    if (!adapter) continue;
    try {
      await adapter.send(
        { channel: link.channel, externalChatId: link.externalChatId },
        message
      );
      sent += 1;
    } catch (error) {
      logger.warn(
        "Channel touch failed",
        {
          channel: link.channel,
          kind: message.kind,
          error: error instanceof Error ? error.message : String(error),
        },
        LOG_SOURCE
      );
    }
  }
  return sent;
}
