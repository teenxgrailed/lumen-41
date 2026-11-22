import type { PopupLimit } from "./types";

/** The window event the popup host listens for. */
export const LIMIT_HIT_EVENT = "needt:popup-limit-hit";

export interface LimitHitDetail {
  limit: PopupLimit;
}

/**
 * Call this where a plan limit has just blocked an action ("Free keeps 3
 * habits"). The popup host asks the server whether a "Need more?" popup is
 * due: the server owns the rules (Free only, once per limit per 7 days, the
 * global cap), so calling this on every refusal is safe. A no-op on the
 * server and in a test without a window.
 */
export function reportLimitHit(limit: PopupLimit): void {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(
      new CustomEvent<LimitHitDetail>(LIMIT_HIT_EVENT, { detail: { limit } })
    );
  } catch {
    /* A popup is never worth breaking the screen that asked. */
  }
}
