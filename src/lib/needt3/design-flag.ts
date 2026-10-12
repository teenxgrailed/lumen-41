import { cache } from "react";

import { getServerSession } from "next-auth";

import { getAuthOptions } from "@/lib/auth/auth-options";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { DESIGN_V3 } from "@/lib/feature-flags-keys";
import { logger } from "@/lib/logger";

const LOG_SOURCE = "needt3-design-flag";

/**
 * Whether the signed-in person sees the v3 design. Read once per request on
 * the server (React `cache`), handed to the client through `<V3Root>`; the
 * client never fetches flags.
 *
 * Fails closed: no session, or any error reading the flag, means the old
 * design. A broken flag lookup must never ship v3 to everyone.
 */
export const isDesignV3 = cache(async (): Promise<boolean> => {
  try {
    const session = await getServerSession(await getAuthOptions());
    const userId = session?.user?.id;
    if (!userId) return false;
    return await isFeatureEnabled(DESIGN_V3, userId);
  } catch (error) {
    logger.error(
      "Could not read the design_v3 flag; falling back to the old design",
      { error: error instanceof Error ? error.message : String(error) },
      LOG_SOURCE
    );
    return false;
  }
});
