"use client";

import { useCallback } from "react";

import { useSetPref, useSettings } from "@/lib/needt3/hooks/settings";

/**
 * The document's right inspector is closed while you read and opens on
 * request (prototype SCREENS.md "Side panels", 08.10.26). Its open state is
 * the person's "doc panel" preference (`UserSettings.prefs.docPanel`), so it
 * follows them across devices.
 */
export const PANEL_PREF = "docPanel";

export const panelOpenFrom = (prefs: Record<string, unknown> | undefined) =>
  prefs?.[PANEL_PREF] === true;

export function useDocPanel(): [boolean, (open: boolean) => void] {
  const settings = useSettings();
  const setPref = useSetPref();
  const open = panelOpenFrom(settings.data?.prefs);
  const loaded = !!settings.data;
  const set = useCallback(
    (next: boolean) => {
      // `prefs` is written whole; never write it before it has loaded.
      if (!loaded) return;
      void setPref(PANEL_PREF, next).catch(() => undefined);
    },
    [loaded, setPref]
  );
  return [open, set];
}
