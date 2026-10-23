/**
 * Umami custom events from the browser. A no-op when the tracker did not load
 * (no website id, Do Not Track, an ad blocker, tests).
 */
type UmamiWindow = {
  umami?: { track?: (name: string, data?: Record<string, unknown>) => void };
};

export function trackEvent(name: string, data?: Record<string, unknown>) {
  try {
    if (typeof window === "undefined") return;
    (window as unknown as UmamiWindow).umami?.track?.(name, data);
  } catch {
    /* analytics must never break the screen */
  }
}
