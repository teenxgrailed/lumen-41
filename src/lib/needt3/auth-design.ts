import { cache } from "react";

import { DESIGN_V3 } from "@/lib/feature-flags-keys";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

import { isDesignV3 } from "./design-flag";

const LOG_SOURCE = "needt3-auth-design";

/**
 * Whether sign-in and setup wear the v3 design.
 *
 * `design_v3` is decided per person, and a signed-out visitor is nobody, so
 * `isDesignV3()` is always false for them: the old sign-in stays until the
 * flag is switched on for everyone. That is the rule here:
 *   - signed in: the person's own `design_v3` (override or rollout bucket);
 *   - signed out: v3 only once the flag is enabled at a 100 % rollout, i.e.
 *     when the redesign has shipped to all. A partial rollout or an override
 *     never changes the screen a stranger sees.
 *
 * Fails closed: any error means the old design.
 */
export function everyoneSeesV3(
  flag: { enabled: boolean; rolloutPercentage: number } | null
): boolean {
  return !!flag && flag.enabled && flag.rolloutPercentage >= 100;
}

export const isAuthDesignV3 = cache(
  async (signedIn: boolean): Promise<boolean> => {
    if (signedIn) return isDesignV3();
    try {
      const flag = await prisma.featureFlag.findUnique({
        where: { key: DESIGN_V3 },
        select: { enabled: true, rolloutPercentage: true },
      });
      return everyoneSeesV3(flag);
    } catch (error) {
      logger.error(
        "Could not read the design_v3 flag for sign-in; using the old design",
        { error: error instanceof Error ? error.message : String(error) },
        LOG_SOURCE
      );
      return false;
    }
  }
);
