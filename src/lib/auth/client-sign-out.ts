import { signOut } from "next-auth/react";

import { releaseNativePushToken } from "@/lib/needt3/hooks/push";
import { prepareNeedtSignOut } from "@/lib/pwa/offline-client";

/**
 * Every sign-out control goes through here, so none of them can leave the
 * account's data behind in the browser: the iOS app's push token is released,
 * offline changes get a short chance to sync, then user-scoped storage and the
 * offline cache are cleared, and only then is the session ended.
 */
export async function signOutOfNeedt(callbackUrl = "/auth/signin") {
  await releaseNativePushToken();
  await prepareNeedtSignOut();
  await signOut({ callbackUrl });
}

/**
 * The same sign-out, without NextAuth's redirect: the caller goes on by
 * itself, so it can follow an address NextAuth would refuse as foreign (the
 * post-logout address of a first-party app). Rejects when signing out fails.
 */
export async function endNeedtSession() {
  await releaseNativePushToken();
  await prepareNeedtSignOut();
  await signOut({ redirect: false });
}
