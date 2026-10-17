"use client";

import { useQueryClient } from "@tanstack/react-query";

import {
  type V3Settings,
  useSetPref,
  useSettings,
} from "@/lib/needt3/hooks/settings";
import { qk } from "@/lib/needt3/query-keys";

import { type SidebarPrefs, prefsFromSettings } from "./places";

/**
 * The sidebar layout from `UserSettings.prefs.sidebar`. Writes are
 * optimistic (the settings cache changes first) and each one starts from the
 * cache, so several quick writes (a drag reorder) never undo each other.
 */
export function useSidebarPrefs(): [
  SidebarPrefs,
  (
    next: (prefs: SidebarPrefs) => SidebarPrefs,
    opts?: { rethrow?: boolean }
  ) => Promise<unknown>,
] {
  const qc = useQueryClient();
  const settings = useSettings();
  const setPref = useSetPref();
  const prefs = prefsFromSettings(settings.data?.prefs);
  const update = (
    next: (p: SidebarPrefs) => SidebarPrefs,
    opts?: { rethrow?: boolean }
  ) => {
    const cur = qc.getQueryData<V3Settings>(qk.settings());
    // prefs is written whole: never write before the stored map is known.
    if (!cur) return Promise.resolve(undefined);
    const saved = setPref("sidebar", next(prefsFromSettings(cur.prefs)));
    // A drag reorder wants to hear a rejection (it puts the old order back).
    return opts?.rethrow ? saved : saved.catch(() => undefined);
  };
  return [prefs, update];
}
