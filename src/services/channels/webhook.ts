import { logger } from "@/lib/logger";

import { type CoreDeps, handleIncoming } from "./core";
import { claimUpdate, findActiveLink } from "./links";
import type { ChannelAdapter } from "./types";

const LOG_SOURCE = "channels-webhook";

/** A webhook body larger than this is refused before it is read. */
export const WEBHOOK_MAX_BYTES = 64 * 1024;

export interface WebhookOutcome {
  status: number;
  body: { ok: boolean; error?: string; duplicate?: boolean; ignored?: boolean };
}

/**
 * Reads the body up to the cap and hands back a request the adapter can read
 * as usual, or "too_large" as soon as the cap is passed.
 */
async function readBounded(request: Request): Promise<Request | "too_large"> {
  if (!request.body) return request;
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > WEBHOOK_MAX_BYTES) {
      await reader.cancel().catch(() => undefined);
      return "too_large";
    }
    chunks.push(value);
  }
  const buffer = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    buffer.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new Request(request.url, {
    method: request.method,
    headers: request.headers,
    body: buffer,
  });
}

/**
 * The same pipeline for every channel: authenticate with the channel's own
 * secret, refuse an oversized body, read the update, let the core decide, send
 * the answer. A repeat delivery is dropped, but only for linked chats: a chat
 * that is not linked writes no rows at all. A failure after authentication
 * still answers 200, so the messenger does not redeliver the same update in a
 * loop. Message text is never logged, nor is an error's message.
 */
export async function processWebhook(
  adapter: ChannelAdapter,
  request: Request,
  deps: CoreDeps = {}
): Promise<WebhookOutcome> {
  if (!adapter.verify(request)) {
    return { status: 401, body: { ok: false, error: "unauthorized" } };
  }
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(declared) && declared > WEBHOOK_MAX_BYTES) {
    return { status: 413, body: { ok: false, error: "too_large" } };
  }
  // The header is only a hint (it can be missing, wrong or not a number), so
  // the bytes themselves are counted while they are read.
  const bounded = await readBounded(request);
  if (bounded === "too_large") {
    return { status: 413, body: { ok: false, error: "too_large" } };
  }

  let update;
  try {
    update = await adapter.parseUpdate(bounded);
  } catch {
    update = null;
  }
  if (!update) return { status: 200, body: { ok: true, ignored: true } };

  let answered = false;
  try {
    // Only a linked chat is deduped; a stranger's message writes nothing.
    const link = await findActiveLink(adapter.channel, update.externalChatId);
    if (
      link &&
      !(await claimUpdate(adapter.channel, update.externalUpdateId))
    ) {
      if (update.ref) await adapter.ack?.(update.ref).catch(() => undefined);
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
      answered = true;
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
        errorName: error instanceof Error ? error.name : "unknown",
        code: String((error as { code?: unknown } | null)?.code ?? ""),
      },
      LOG_SOURCE
    );
  }
  // A pressed control is always answered, so its spinner never hangs.
  if (!answered && update.ref) {
    await adapter.ack?.(update.ref).catch(() => undefined);
  }
  return { status: 200, body: { ok: true } };
}
