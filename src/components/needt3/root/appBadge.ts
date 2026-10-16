import type { V3Task } from "@/lib/needt3/map";

import { splitHome } from "../home/derive";

/**
 * The number on the app icon: today's open tasks plus the overdue ones - the
 * same two lists Home draws, so the badge never counts what Home does not show.
 */
export function badgeCount(tasks: readonly V3Task[], today: string): number {
  const { day, late } = splitHome(tasks, today);
  const open = new Set<string>();
  for (const t of [...day, ...late]) if (!t.done) open.add(t.id);
  return open.size;
}

export interface BadgeNavigator {
  setAppBadge?: (count?: number) => Promise<void>;
  clearAppBadge?: () => Promise<void>;
}

/**
 * Show `count` on the installed app's icon (Badging API), or clear it at zero.
 * Feature-detected and silent: where it is missing (desktop Safari, Firefox)
 * nothing happens, and it never asks for notification permission - on iOS
 * 16.4+ the badge simply shows when the person has already allowed
 * notifications for the installed app. Returns whether a call was made.
 */
export function setBadge(
  count: number,
  nav: BadgeNavigator | undefined = typeof navigator === "undefined"
    ? undefined
    : (navigator as unknown as BadgeNavigator)
): boolean {
  if (!nav) return false;
  try {
    if (count > 0 && typeof nav.setAppBadge === "function") {
      void nav.setAppBadge(count).catch(() => undefined);
      return true;
    }
    if (typeof nav.clearAppBadge === "function") {
      void nav.clearAppBadge().catch(() => undefined);
      return true;
    }
    if (count <= 0 && typeof nav.setAppBadge === "function") {
      void nav.setAppBadge(0).catch(() => undefined);
      return true;
    }
  } catch {
    /* a browser that throws has no badge */
  }
  return false;
}
