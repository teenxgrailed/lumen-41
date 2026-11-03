import { getApnsConfiguration } from "@/lib/apns-config";
import { prisma } from "@/lib/prisma";
import { getVapidConfiguration } from "@/lib/push-config";

import { NativePushTarget } from "./apns";

/** A browser's Web Push subscription. */
export type WebPushTarget = {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

/** Anywhere a push can go: a browser subscription or an iOS device token. */
export type PushTarget = WebPushTarget | NativePushTarget;

/** What the senders select, so a query brings both kinds of device. */
export const PUSH_TARGET_SELECT = {
  pushSubscriptions: {
    select: { id: true, endpoint: true, p256dh: true, auth: true },
  },
  nativePushTokens: {
    select: { id: true, token: true, bundleId: true, environment: true },
  },
} as const;

/** Every device of one person, browsers first. */
export function pushTargetsOf(user: {
  pushSubscriptions: WebPushTarget[];
  nativePushTokens: NativePushTarget[];
}): PushTarget[] {
  return [...user.pushSubscriptions, ...user.nativePushTokens];
}

export async function loadPushTargets(userId: string): Promise<PushTarget[]> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: PUSH_TARGET_SELECT,
  });
  return user ? pushTargetsOf(user) : [];
}

/** Web push or APNs: either key on this server is enough to send. */
export function pushConfigured() {
  return (
    getVapidConfiguration().configured || getApnsConfiguration().configured
  );
}
