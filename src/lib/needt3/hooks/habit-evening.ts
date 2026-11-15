"use client";

import { useQuery } from "@tanstack/react-query";

import { qk } from "@/lib/needt3/query-keys";

import { fetchJson } from "./core";
import { usePushNotifications } from "./push";
import { useSetPref, useSettings } from "./settings";

/**
 * Whether the 20:00 habit push exists for this account (the
 * `habit_evening_push` flag, read on the server). A failed read counts as off,
 * so the switch never shows for a push that will not be sent.
 */
export function useHabitEveningPushFlag(): boolean {
  const query = useQuery({
    queryKey: qk.habitEveningPush(),
    queryFn: () => fetchJson<{ enabled: boolean }>("/api/habits/evening-push"),
    staleTime: 5 * 60_000,
    retry: false,
  });
  return query.data?.enabled === true;
}

/**
 * What the switch shows: the stored choice, or, when the person never chose,
 * the default the server applies: on only where a push device is subscribed
 * (`eveningEnabled` in src/services/habits/evening-push.ts).
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
  const flag = useHabitEveningPushFlag();
  const settings = useSettings();
  const setPref = useSetPref();
  const push = usePushNotifications();
  return {
    show: flag,
    on: eveningSwitchValue(settings.data?.prefs, push.state === "on"),
    disabled: !settings.data,
    set: (value: boolean) => setPref("habitEveningPush", value),
  };
}
