import { logger } from "@/lib/logger";

import { type CoreDeps, handleIncoming } from "./core";
import { claimUpdate } from "./links";
import type { ChannelAdapter } from "./types";

const LOG_SOURCE = "channels-webhook";

export interface WebhookOutcome {
  status: number;
  body: { ok: boolean; error?: string; duplicate?: boolean; ignored?: boolean };
}

/**
 * The same pipeline for every channel: authenticate with the channel's own
 * secret, read the update, drop a repeat delivery, let the core decide, send
 * the answer. A failure after authentication still answers 200, so the
 * messenger does not redeliver the same update in a loop. Message text is never
 * logged.
 */
export async function processWebhook(
  adapter: ChannelAdapter,
  request: Request,
  deps: CoreDeps = {}
): Promise<WebhookOutcome> {
  if (!adapter.verify(request)) {
    return { status: 401, body: { ok: false, error: "unauthorized" } };
  }

  let update;
  try {
    update = await adapter.parseUpdate(request);
  } catch {
    update = null;
  }
  if (!update) return { status: 200, body: { ok: true, ignored: true } };

  try {
    if (!(await claimUpdate(adapter.channel, update.externalUpdateId))) {
      return { status: 200, body: { ok: true, duplicate: true } };
    }
    const message = await handleIncoming(
      {
        channel: adapter.channel,
        externalChatId: update.externalChatId,
        event: update.event,
      },
      {
        loadVoice: (ref) => adapter.loadVoice?.(ref) ?? Promise.resolve(null),
        ...deps,
      }
    );
    if (message) {
      await adapter.send(
        { channel: adapter.channel, externalChatId: update.externalChatId },
        message,
        update.ref
      );
    }
  } catch (error) {
    logger.error(
      "Channel update failed",
      {
        channel: adapter.channel,
        kind: update.event.kind,
        error: error instanceof Error ? error.message : String(error),
      },
      LOG_SOURCE
    );
  }
  return { status: 200, body: { ok: true } };
}
