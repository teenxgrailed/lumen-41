"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";

import { qk } from "@/lib/needt3/query-keys";
import { serialByKey } from "@/lib/needt3/serial";

import {
  browserTimeZone,
  fetchJson,
  sendJson,
  useUndoableMutation,
} from "./core";

/** `GET /api/user-settings`, plus the UI-only `prefs` map (migration M1). */
export interface V3Settings {
  theme: string;
  defaultView: string;
  timeZone: string;
  weekStartDay: string;
  timeFormat: string;
  /** UI-only keys: sidebarTiles, docsSort, boardsSort, accent, … */
  prefs: Record<string, unknown>;
  /** When the settings row was made (read-only): the account's age. */
  createdAt?: string | null;
  /** The owner of the row (read-only). */
  userId?: string;
}

type SettingsPatch = Partial<Omit<V3Settings, "prefs">> & {
  prefs?: Record<string, unknown>;
};

export function useSettings() {
  return useQuery({
    queryKey: qk.settings(),
    queryFn: async () => {
      const row = await fetchJson<Partial<V3Settings>>("/api/user-settings");
      return {
        theme: row.theme ?? "system",
        defaultView: row.defaultView ?? "week",
        timeZone: row.timeZone || browserTimeZone(),
        weekStartDay: row.weekStartDay ?? "monday",
        timeFormat: row.timeFormat ?? "24h",
        prefs:
          row.prefs && typeof row.prefs === "object"
            ? (row.prefs as Record<string, unknown>)
            : {},
        createdAt: typeof row.createdAt === "string" ? row.createdAt : null,
        userId: typeof row.userId === "string" ? row.userId : undefined,
      } satisfies V3Settings;
    },
    staleTime: 5 * 60_000,
  });
}

/**
 * The one week-start setting every date picker and calendar reads
 * (Settings > Day). "monday" until the saved value loads, so no picker ever
 * disagrees with another because one read a different default.
 */
export function useWeekStartDay(): "monday" | "sunday" {
  const settings = useSettings();
  return settings.data?.weekStartDay === "sunday" ? "sunday" : "monday";
}

/** The person's IANA zone: the saved one once loaded, else the browser's. */
export function useTimeZone() {
  const qc = useQueryClient();
  const { data } = useSettings();
  return (
    data?.timeZone ??
    qc.getQueryData<V3Settings>(qk.settings())?.timeZone ??
    browserTimeZone()
  );
}

/**
 * Patch settings. `prefs` is a patch, as the server applies it: a shallow
 * merge of top-level keys, each key's value replaced whole (taskView,
 * homeBlocks), `null` removing a key. Use `useSetPref` to change one key.
 */
export function useUpdateSettings() {
  return useUndoableMutation<SettingsPatch, V3Settings>({
    scope: qk.settings(),
    label: "save the setting",
    inverse: (qc, patch) => {
      const cur = qc.getQueryData<V3Settings>(qk.settings());
      if (!cur) return null;
      const back: SettingsPatch = {};
      for (const k of Object.keys(patch) as (keyof SettingsPatch)[]) {
        // prefs is a patch: undo puts back each touched key (null: was absent)
        if (k === "prefs")
          back.prefs = Object.fromEntries(
            Object.keys(patch.prefs ?? {}).map((key) => [
              key,
              key in cur.prefs ? cur.prefs[key] : null,
            ])
          );
        else (back as Record<string, unknown>)[k] = cur[k];
      }
      return back;
    },
    optimistic: (qc, patch) =>
      qc.setQueryData<V3Settings>(qk.settings(), (cur) =>
        cur
          ? {
              ...cur,
              ...patch,
              prefs: patch.prefs
                ? applyPrefsPatch(cur.prefs, patch.prefs)
                : cur.prefs,
            }
          : cur
      ),
    request: (patch) =>
      sendJson<V3Settings>("/api/user-settings", "PATCH", patch),
  });
}

/**
 * `prefs` in a PATCH is a patch: the server merges it into the stored map
 * (`prefs || patch`) and removes keys sent as null. The cache does the same.
 */
export function applyPrefsPatch(
  cur: Record<string, unknown>,
  patch: Record<string, unknown>
): Record<string, unknown> {
  const next = { ...cur };
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) delete next[key];
    else next[key] = value;
  }
  return next;
}

/**
 * Set one UI preference: `setPref("docsSort", "viewed")`. Only that key is
 * sent; the server merges it, so another tab's or device's keys are never
 * overwritten from a stale cache. `null` removes the key.
 */
export function useSetPref() {
  const setPrefs = useSetPrefs();
  return (key: string, value: unknown) => setPrefs({ [key]: value });
}

/**
 * Several preferences in one write (`city` and `cityPlace` must land
 * together). Only the patch is sent and the server merges it, so writes from
 * two tabs or devices keep each other's keys. Writes from this tab still go
 * one after another, so the answers land in order.
 */
export function useSetPrefs() {
  const update = useUpdateSettings();
  return (patch: Record<string, unknown>) =>
    serialByKey("user-settings-prefs", () =>
      update.mutateAsync({ prefs: patch })
    );
}
