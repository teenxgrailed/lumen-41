import { createHash, timingSafeEqual } from "crypto";
import { z } from "zod";

import type {
  AudioPayload,
  ChannelAdapter,
  ChannelTarget,
  InboundUpdate,
  IncomingEvent,
  OutgoingMessage,
} from "../types";
import type { InlineButton, TelegramClient } from "./client";

export const TELEGRAM_CHANNEL = "telegram";
export const SECRET_HEADER = "x-telegram-bot-api-secret-token";

/** Voice notes larger than this are not fetched. */
const VOICE_MAX_BYTES = 10 * 1024 * 1024;
const BODY_MAX_CHARS = 64 * 1024;
const BUTTON_TITLE_MAX = 18;

const chatSchema = z.object({
  id: z.union([z.number(), z.string()]),
  type: z.string(),
});

const updateSchema = z.object({
  update_id: z.union([z.number(), z.string()]),
  message: z
    .object({
      message_id: z.number(),
      chat: chatSchema,
      text: z.string().optional(),
      voice: z.object({ file_id: z.string() }).optional(),
    })
    .optional(),
  callback_query: z
    .object({
      id: z.string(),
      data: z.string().optional(),
      message: z
        .object({ message_id: z.number(), chat: chatSchema })
        .optional(),
    })
    .optional(),
});

const sha = (value: string) => createHash("sha256").update(value).digest();

/** Constant-time comparison of the header against the configured secret. */
export function secretMatches(
  presented: string | null,
  secret: string
): boolean {
  if (!presented) return false;
  return timingSafeEqual(sha(presented), sha(secret));
}

const START = /^\/start(?:@\w+)?(?:\s+([A-Za-z0-9_-]{8,64}))?\s*$/;
const STOP = /^\/stop(?:@\w+)?\s*$/;
const CALLBACK = /^([dl]):([A-Za-z0-9_-]{1,64})$/;

function eventOfText(text: string): IncomingEvent {
  const trimmed = text.trim();
  const start = START.exec(trimmed);
  if (start) {
    return start[1] ? { kind: "link", code: start[1] } : { kind: "help" };
  }
  if (STOP.test(trimmed)) return { kind: "unlink" };
  if (trimmed.startsWith("/")) return { kind: "help" };
  return { kind: "text", text };
}

/** The reference kept between the incoming update and the answer. */
interface Ref {
  /** The message a button sits on, to edit it. */
  m?: number;
  /** The button press to acknowledge. */
  c?: string;
}

const truncate = (value: string, max: number) =>
  value.length <= max ? value : `${value.slice(0, max - 1).trimEnd()}…`;

function keyboardOf(message: OutgoingMessage): InlineButton[][] {
  const rows: InlineButton[][] = [];
  const byTask = new Map<string, InlineButton[]>();
  for (const action of message.actions) {
    const row = byTask.get(action.taskId) ?? [];
    if (!byTask.has(action.taskId)) {
      byTask.set(action.taskId, row);
      rows.push(row);
    }
    row.push({
      text:
        action.action === "done"
          ? `Done: ${truncate(action.title, BUTTON_TITLE_MAX)}`
          : "Later",
      callback_data: `${action.action === "done" ? "d" : "l"}:${action.taskId}`,
    });
  }
  return rows;
}

export function createTelegramAdapter(options: {
  client: TelegramClient;
  secret: string;
}): ChannelAdapter {
  const { client, secret } = options;

  return {
    channel: TELEGRAM_CHANNEL,

    verify(request) {
      return secretMatches(request.headers.get(SECRET_HEADER), secret);
    },

    async parseUpdate(request): Promise<InboundUpdate | null> {
      const raw = await request.text();
      if (raw.length > BODY_MAX_CHARS) return null;
      let json: unknown;
      try {
        json = JSON.parse(raw);
      } catch {
        return null;
      }
      const parsed = updateSchema.safeParse(json);
      if (!parsed.success) return null;
      const update = parsed.data;
      const externalUpdateId = String(update.update_id);

      const callback = update.callback_query;
      if (callback) {
        const match = callback.data ? CALLBACK.exec(callback.data) : null;
        const chat = callback.message?.chat;
        if (!match || !chat || chat.type !== "private") return null;
        const ref: Ref = { m: callback.message?.message_id, c: callback.id };
        return {
          externalUpdateId,
          externalChatId: String(chat.id),
          event: {
            kind: "action",
            action: match[1] === "d" ? "done" : "later",
            taskId: match[2],
          },
          ref: JSON.stringify(ref),
        };
      }

      const message = update.message;
      if (!message || message.chat.type !== "private") return null;
      const base = {
        externalUpdateId,
        externalChatId: String(message.chat.id),
      };
      if (message.voice) {
        return {
          ...base,
          event: { kind: "voice", voiceFileRef: message.voice.file_id },
        };
      }
      if (typeof message.text === "string" && message.text.trim()) {
        return { ...base, event: eventOfText(message.text) };
      }
      return null;
    },

    async send(
      target: ChannelTarget,
      message: OutgoingMessage,
      refText?: string
    ) {
      let ref: Ref = {};
      try {
        ref = refText ? (JSON.parse(refText) as Ref) : {};
      } catch {
        ref = {};
      }
      const keyboard = keyboardOf(message);
      // Stop the button's spinner whatever happens next.
      if (ref.c) await client.answerCallbackQuery(ref.c).catch(() => undefined);
      if (message.kind === "update" && ref.m !== undefined) {
        await client.editMessageText(
          target.externalChatId,
          ref.m,
          message.text,
          keyboard
        );
        return;
      }
      await client.sendMessage(target.externalChatId, message.text, keyboard);
    },

    async loadVoice(voiceFileRef): Promise<AudioPayload | null> {
      const file = await client.downloadFile(voiceFileRef, VOICE_MAX_BYTES);
      return file ? { bytes: file.bytes, mimeType: "audio/ogg" } : null;
    },
  };
}
