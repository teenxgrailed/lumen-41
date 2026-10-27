"use client";

/* MAC NOTIFICATIONS — the Swift app has no Web Push, so its page asks the
 * server every minute what may interrupt (`/api/notifications/alerts`,
 * which applies Settings → Notifications: type, the Mac channel, quiet
 * hours, the digest) and hands each row to UNUserNotificationCenter through
 * the shell's notification bridge. Clicking one opens its link in the app.
 * The first poll only sets the baseline, so nothing old is replayed.
 */
import { useEffect } from "react";

import { isMacApp, sendDesktopNotification } from "@/lib/desktop";
import { logger } from "@/lib/logger";
import { fetchJson } from "@/lib/needt3/hooks/core";

const LOG_SOURCE = "mac-alerts";
const POLL_MS = 60_000;
const SINCE_KEY = "needt.macAlertsSince";

interface AlertsPage {
  items: { key: string; title: string; body: string | null; link: string }[];
  now: string;
}

function readSince(): string | null {
  try {
    return window.localStorage.getItem(SINCE_KEY);
  } catch {
    return null;
  }
}

function writeSince(value: string) {
  try {
    window.localStorage.setItem(SINCE_KEY, value);
  } catch {
    /* a private window: the next poll starts a new baseline */
  }
}

/** One poll: fetch what is new since the last one and show it. */
export async function pollMacAlerts(): Promise<number> {
  const since = readSince();
  const page = await fetchJson<AlertsPage>(
    `/api/notifications/alerts?channel=mac${since ? `&since=${encodeURIComponent(since)}` : ""}`,
    { cache: "no-store" }
  );
  writeSince(page.now);
  let shown = 0;
  for (const item of page.items) {
    if (await sendDesktopNotification(item.title, item.body ?? "", item.link)) {
      shown += 1;
    }
  }
  return shown;
}

export function useMacAlerts() {
  useEffect(() => {
    if (!isMacApp()) return;
    let stopped = false;
    const tick = () => {
      if (stopped) return;
      void pollMacAlerts().catch((error) =>
        logger.warn(
          "Could not read Mac alerts",
          { error: error instanceof Error ? error.message : String(error) },
          LOG_SOURCE
        )
      );
    };
    tick();
    const timer = window.setInterval(tick, POLL_MS);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, []);
}
