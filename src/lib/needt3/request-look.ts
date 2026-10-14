import { cookies } from "next/headers";

import { logger } from "@/lib/logger";
import {
  LOOK_COOKIE,
  type Look,
  mergeLook,
  parseLook,
} from "@/lib/needt3/look-boot";
import { normalizeAccent, normalizeTheme } from "@/lib/needt3/theme";
import { prisma } from "@/lib/prisma";

const LOG_SOURCE = "request-look";

/** The `needt-look` cookie alone: all `generateViewport` can afford. */
export async function requestLookCookie(): Promise<Look | null> {
  return parseLook((await cookies()).get(LOOK_COOKIE)?.value);
}

/**
 * The look for the first render of a signed-in page: the saved theme and
 * accent (`UserSettings`, the truth, so a new device or a changed mind is
 * right on the first byte) plus what the cookie remembers about how it
 * resolved. A failed read falls back to the cookie, then to the defaults.
 */
export async function requestLook(userId: string): Promise<Look> {
  const cookie = await requestLookCookie();
  try {
    const row = await prisma.userSettings.findUnique({
      where: { userId },
      select: { theme: true, prefs: true },
    });
    if (!row) return mergeLook(null, cookie);
    const prefs = row.prefs as Record<string, unknown> | null;
    return mergeLook(
      {
        choice: normalizeTheme(row.theme),
        accent: normalizeAccent(prefs?.accent),
      },
      cookie
    );
  } catch (error) {
    logger.warn(
      "Could not read the saved look",
      { error: error instanceof Error ? error.message : String(error) },
      LOG_SOURCE
    );
    return mergeLook(null, cookie);
  }
}
