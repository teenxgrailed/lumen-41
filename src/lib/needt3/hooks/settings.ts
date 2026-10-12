"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";

import { qk } from "@/lib/needt3/query-keys";

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
      } satisfies V3Settings;
    },
    staleTime: 5 * 60_000,
  });
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
 * Patch settings. `prefs` replaces the whole stored map, as the server does;
 * use `useSetPref` to change one key.
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
        if (k === "prefs") back.prefs = cur.prefs;
        else (back as Record<string, unknown>)[k] = cur[k];
      }
      return back;
    },
    optimistic: (qc, patch) =>
      qc.setQueryData<V3Settings>(qk.settings(), (cur) =>
        cur ? { ...cur, ...patch, prefs: patch.prefs ?? cur.prefs } : cur
      ),
    request: (patch) =>
      sendJson<V3Settings>("/api/user-settings", "PATCH", patch),
  });
}

/**
 * Set one UI preference: `setPref("docsSort", "viewed")`. The server replaces
 * the whole `prefs` map, so the write needs the stored map to merge into.
 * Before settings have loaded there is nothing to merge with, and writing
 * `{ [key]: value }` alone would wipe every other preference; the write is
 * refused instead and resolves to `null`.
 */
export function useSetPref() {
  const qc = useQueryClient();
  const update = useUpdateSettings();
  return async (key: string, value: unknown) => {
    const cur = qc.getQueryData<V3Settings>(qk.settings());
    if (!cur) return null;
    return update.mutateAsync({ prefs: { ...cur.prefs, [key]: value } });
  };
}
