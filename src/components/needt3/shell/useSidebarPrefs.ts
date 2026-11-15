"use client";

import { useQueryClient } from "@tanstack/react-query";

import { useNavPins, useRankedPlaces } from "@/lib/needt3/hooks/nav-rank";
import { usePlan } from "@/lib/needt3/hooks/plan";
import {
  type V3Settings,
  useSetPref,
  useSettings,
} from "@/lib/needt3/hooks/settings";
import type { NavId } from "@/lib/needt3/nav-rank";
import { qk } from "@/lib/needt3/query-keys";

import {
  type SidebarPrefs,
  defaultPrefs,
  prefsFromRanked,
  prefsFromSettings,
} from "./places";

/** The pins (the sidebar arranges itself by use), and how to change them. */
export interface SidebarAuto {
  pinned: readonly NavId[];
  togglePin: (id: NavId) => Promise<unknown>;
}

/**
 * The sidebar layout from `UserSettings.prefs.sidebar`. Writes are
 * optimistic (the settings cache changes first) and each one starts from the
 * cache, so several quick writes (a drag reorder) never undo each other.
 * The third value is the default layout for the person's plan (Free keeps
 * Mailbox under More); while the plan is loading it is the paid default.
 *
 * The places come from the ranked list (`useRankedPlaces`, arranged by use);
 * a write keeps the saved places as they were and changes only sections and
 * folds. The fourth value is the pins.
 */
export function useSidebarPrefs(): [
  SidebarPrefs,
  (
    next: (prefs: SidebarPrefs) => SidebarPrefs,
    opts?: { rethrow?: boolean }
  ) => Promise<unknown>,
  SidebarPrefs,
  SidebarAuto,
] {
  const qc = useQueryClient();
  const settings = useSettings();
  const setPref = useSetPref();
  const free = usePlan().data?.kind === "free";
  const ranked = useRankedPlaces();
  const pins = useNavPins();
  const own = prefsFromSettings(settings.data?.prefs, free);
  const prefs = prefsFromRanked(ranked, own);
  const update = (
    next: (p: SidebarPrefs) => SidebarPrefs,
    opts?: { rethrow?: boolean }
  ) => {
    const cur = qc.getQueryData<V3Settings>(qk.settings());
    // prefs is written whole: never write before the stored map is known.
    if (!cur) return Promise.resolve(undefined);
    const stored = prefsFromSettings(cur.prefs, free);
    const value = {
      ...next(prefsFromRanked(ranked, stored)),
      places: stored.places,
    };
    // Nothing changed (a fold toggled twice, a re-sent layout): no write.
    if (JSON.stringify(value) === JSON.stringify(stored))
      return Promise.resolve(undefined);
    const saved = setPref("sidebar", value);
    // A drag reorder wants to hear a rejection (it puts the old order back).
    return opts?.rethrow ? saved : saved.catch(() => undefined);
  };
  return [
    prefs,
    update,
    defaultPrefs(free),
    { pinned: pins.pinned, togglePin: pins.toggle },
  ];
}
