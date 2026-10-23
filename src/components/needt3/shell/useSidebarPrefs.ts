"use client";

import { useQueryClient } from "@tanstack/react-query";

import { usePlan } from "@/lib/needt3/hooks/plan";
import {
  type V3Settings,
  useSetPref,
  useSettings,
} from "@/lib/needt3/hooks/settings";
import { qk } from "@/lib/needt3/query-keys";

import { type SidebarPrefs, defaultPrefs, prefsFromSettings } from "./places";

/**
 * The sidebar layout from `UserSettings.prefs.sidebar`. Writes are
 * optimistic (the settings cache changes first) and each one starts from the
 * cache, so several quick writes (a drag reorder) never undo each other.
 * The third value is the default layout for the person's plan (Free keeps
 * Mailbox under More); while the plan is loading it is the paid default.
 */
export function useSidebarPrefs(): [
  SidebarPrefs,
  (
    next: (prefs: SidebarPrefs) => SidebarPrefs,
    opts?: { rethrow?: boolean }
  ) => Promise<unknown>,
  SidebarPrefs,
] {
  const qc = useQueryClient();
  const settings = useSettings();
  const setPref = useSetPref();
  const free = usePlan().data?.kind === "free";
  const prefs = prefsFromSettings(settings.data?.prefs, free);
  const update = (
    next: (p: SidebarPrefs) => SidebarPrefs,
    opts?: { rethrow?: boolean }
  ) => {
    const cur = qc.getQueryData<V3Settings>(qk.settings());
    // prefs is written whole: never write before the stored map is known.
    if (!cur) return Promise.resolve(undefined);
    const saved = setPref("sidebar", next(prefsFromSettings(cur.prefs, free)));
    // A drag reorder wants to hear a rejection (it puts the old order back).
    return opts?.rethrow ? saved : saved.catch(() => undefined);
  };
  return [prefs, update, defaultPrefs(free)];
}
