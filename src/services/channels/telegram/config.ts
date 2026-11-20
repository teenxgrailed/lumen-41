import type { ChannelAdapter } from "../types";
import { createTelegramAdapter } from "./adapter";
import { createTelegramClient } from "./client";

/**
 * Telegram is on only when both secrets are set. Without them the webhook
 * answers 404, nothing is sent, and the link API says "not configured": the
 * channel is inert and makes no outgoing call.
 *
 *   TELEGRAM_BOT_TOKEN       the bot token from BotFather
 *   TELEGRAM_WEBHOOK_SECRET  sent back by Telegram in X-Telegram-Bot-Api-Secret-Token
 *                            (1-256 characters from A-Z a-z 0-9 _ -)
 *   TELEGRAM_BOT_USERNAME    optional, without the @: builds the t.me deep link
 */
export interface TelegramConfig {
  token: string;
  secret: string;
  username: string | null;
}

export function telegramConfig(
  env: NodeJS.ProcessEnv = process.env
): TelegramConfig | null {
  const token = env.TELEGRAM_BOT_TOKEN?.trim();
  const secret = env.TELEGRAM_WEBHOOK_SECRET?.trim();
  if (!token || !secret) return null;
  const username = env.TELEGRAM_BOT_USERNAME?.trim().replace(/^@/, "") || null;
  return { token, secret, username };
}

export function telegramConfigured(env: NodeJS.ProcessEnv = process.env) {
  return telegramConfig(env) !== null;
}

export function getTelegramAdapter(
  env: NodeJS.ProcessEnv = process.env
): ChannelAdapter | null {
  const config = telegramConfig(env);
  if (!config) return null;
  return createTelegramAdapter({
    client: createTelegramClient(config.token),
    secret: config.secret,
  });
}

/** The t.me link that opens the bot with the code as the start parameter. */
export function telegramDeepLink(
  code: string,
  env: NodeJS.ProcessEnv = process.env
): string | null {
  const username = telegramConfig(env)?.username;
  return username ? `https://t.me/${username}?start=${code}` : null;
}
