import { signOut } from "next-auth/react";

import { prepareNeedtSignOut } from "@/lib/pwa/offline-client";

/**
 * Every sign-out control goes through here, so none of them can leave the
 * account's data behind in the browser: offline changes get a short chance to
 * sync, then user-scoped storage and the offline cache are cleared, and only
 * then is the session ended.
 */
export async function signOutOfNeedt(callbackUrl = "/auth/signin") {
  await prepareNeedtSignOut();
  await signOut({ callbackUrl });
}
