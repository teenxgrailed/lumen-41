import { getTelegramAdapter, telegramConfigured } from "./telegram/config";
import type { ChannelAdapter } from "./types";

/** The channels a person can link. Add a messenger here. */
export const CHANNELS = ["telegram"] as const;
export type ChannelName = (typeof CHANNELS)[number];

export function isChannelName(value: string): value is ChannelName {
  return (CHANNELS as readonly string[]).includes(value);
}

/** True when the server has what the channel needs (secrets set). */
export function channelConfigured(channel: ChannelName): boolean {
  return channel === "telegram" ? telegramConfigured() : false;
}

/** Adapters that are ready to use: a channel without its secrets is absent. */
export function configuredAdapters(): ChannelAdapter[] {
  const telegram = getTelegramAdapter();
  return telegram ? [telegram] : [];
}
