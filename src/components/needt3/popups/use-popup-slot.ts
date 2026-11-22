"use client";

import { useMemo } from "react";

import { logger } from "@/lib/logger";
import { momentId } from "@/lib/popups/types";

import { canShowPopup, markPopupShown } from "./gate";

const LOG_SOURCE = "usePopupSlot";

export interface PopupSlot {
  /** The browser's half of the rules: not in onboarding or focus, no other dialog, none yet this session. */
  canShow: () => boolean;
  /**
   * Call when the popup is drawn. Marks the session and writes the show to
   * the shared history, so it counts against the same 3-day cap as
   * announcements and plan moments.
   */
  claim: (key: string) => Promise<void>;
}

/**
 * The hook another popup (the feedback prompt) plugs into, so every popup
 * shares one coordinator. The server half is `popupSlotOpen` in
 * `@/services/popups/popups`: ask it in the eligibility check, then ask
 * `canShow()` here before drawing, and `claim(key)` once drawn.
 */
export function usePopupSlot(source: "feedback" = "feedback"): PopupSlot {
  return useMemo(
    () => ({
      canShow: canShowPopup,
      claim: async (key: string) => {
        markPopupShown();
        try {
          await fetch(
            `/api/popups/${encodeURIComponent(momentId(source, key))}/event`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ event: "shown" }),
              keepalive: true,
            }
          );
        } catch (error) {
          logger.warn(
            "Could not record a popup show",
            { error: error instanceof Error ? error.message : "Unknown error" },
            LOG_SOURCE
          );
        }
      },
    }),
    [source]
  );
}
