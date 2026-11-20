/**
 * A small Telegram Bot API client. It takes the token and a `fetch` so tests
 * run without the network. Nothing here is created or called unless the bot
 * token is configured. Message text is never logged: errors carry the method
 * name and Telegram's numeric code only.
 */
export type FetchLike = (
  input: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  }
) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
  arrayBuffer(): Promise<ArrayBuffer>;
}>;

export interface InlineButton {
  text: string;
  callback_data: string;
}

export interface TelegramClient {
  sendMessage(
    chatId: string,
    text: string,
    keyboard?: InlineButton[][]
  ): Promise<void>;
  editMessageText(
    chatId: string,
    messageId: number,
    text: string,
    keyboard?: InlineButton[][]
  ): Promise<void>;
  sendSticker(chatId: string, fileId: string): Promise<void>;
  answerCallbackQuery(callbackQueryId: string): Promise<void>;
  /** Downloads a file by id, refusing anything over `maxBytes`. */
  downloadFile(
    fileId: string,
    maxBytes: number
  ): Promise<{ bytes: Uint8Array; filePath: string } | null>;
}

const API = "https://api.telegram.org";

export class TelegramApiError extends Error {
  constructor(
    readonly method: string,
    readonly code: number
  ) {
    super(`Telegram ${method} failed (${code})`);
  }
}

export function createTelegramClient(
  token: string,
  fetchImpl: FetchLike = fetch as unknown as FetchLike
): TelegramClient {
  async function call<T = unknown>(
    method: string,
    payload: Record<string, unknown>
  ): Promise<T> {
    const res = await fetchImpl(`${API}/bot${token}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = (await res.json().catch(() => null)) as {
      ok?: boolean;
      result?: T;
      error_code?: number;
    } | null;
    if (!res.ok || !body?.ok) {
      throw new TelegramApiError(method, body?.error_code ?? res.status);
    }
    return body.result as T;
  }

  const markup = (keyboard?: InlineButton[][]) => ({
    reply_markup: { inline_keyboard: keyboard ?? [] },
  });

  return {
    async sendMessage(chatId, text, keyboard) {
      await call("sendMessage", {
        chat_id: chatId,
        text,
        ...(keyboard && keyboard.length > 0 ? markup(keyboard) : {}),
      });
    },
    async sendSticker(chatId, fileId) {
      await call("sendSticker", { chat_id: chatId, sticker: fileId });
    },
    async editMessageText(chatId, messageId, text, keyboard) {
      await call("editMessageText", {
        chat_id: chatId,
        message_id: messageId,
        text,
        ...markup(keyboard),
      });
    },
    async answerCallbackQuery(callbackQueryId) {
      await call("answerCallbackQuery", { callback_query_id: callbackQueryId });
    },
    async downloadFile(fileId, maxBytes) {
      const file = await call<{ file_path?: string; file_size?: number }>(
        "getFile",
        { file_id: fileId }
      );
      if (!file.file_path) return null;
      if (file.file_size !== undefined && file.file_size > maxBytes) {
        return null;
      }
      const res = await fetchImpl(`${API}/file/bot${token}/${file.file_path}`);
      if (!res.ok) return null;
      const buffer = await res.arrayBuffer();
      if (buffer.byteLength > maxBytes) return null;
      return { bytes: new Uint8Array(buffer), filePath: file.file_path };
    },
  };
}
