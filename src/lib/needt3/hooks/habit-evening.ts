"use client";

import { useQuery } from "@tanstack/react-query";

import { qk } from "@/lib/needt3/query-keys";

import { fetchJson } from "./core";
import { useSetPref, useSettings } from "./settings";

/**
 * Whether the 20:00 habit push exists for this account (the
 * `habit_evening_push` flag, read on the server). A failed read counts as off,
 * so the switch never shows for a push that will not be sent.
 */
export function useHabitEveningPush() {
  const query = useQuery({
    queryKey: qk.habitEveningPush(),
    queryFn: () =>
      fetchJson<{ enabled: boolean; hasSubscription: boolean }>(
        "/api/habits/evening-push"
      ),
    staleTime: 5 * 60_000,
    retry: false,
  });
  return {
    enabled: query.data?.enabled === true,
    /** Any device on the account, not only this one. */
    hasSubscription: query.data?.hasSubscription === true,
  };
}

/**
 * What the switch shows: the stored choice, or, when the person never chose,
 * the default the server applies: on only where the account has a push device
 * subscribed (`hasSubscription` from the route; `eveningEnabled` on the server).
 */
export function eveningSwitchValue(
  prefs: Record<string, unknown> | null | undefined,
  subscribed: boolean
): boolean {
  const stored = prefs?.habitEveningPush;
  return typeof stored === "boolean" ? stored : subscribed;
}

/**
 * The Notifications switch for the 20:00 habit push, on both Settings faces:
 * `show` is the flag; `on` is the stored choice or the default; `set` stores
 * a choice in `UserSettings.prefs.habitEveningPush`, which is the only thing
 * ever written (a person who never touches it keeps "default").
 */
export function useEveningPushSwitch() {
  const flag = useHabitEveningPush();
  const settings = useSettings();
  const setPref = useSetPref();
  return {
    show: flag.enabled,
    on: eveningSwitchValue(settings.data?.prefs, flag.hasSubscription),
    disabled: !settings.data,
    set: (value: boolean) => setPref("habitEveningPush", value),
  };
}
