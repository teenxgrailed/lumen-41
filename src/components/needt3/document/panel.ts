"use client";

import { useCallback } from "react";

import { useSetPref, useSettings } from "@/lib/needt3/hooks/settings";

import { useNeedt3Ui } from "@/store/needt3-ui";

/**
 * The document's right inspector is closed while you read and opens on
 * request (prototype SCREENS.md "Side panels", 08.10.26). Its open state is
 * the person's "doc panel" preference (`UserSettings.prefs.docPanel`), so it
 * follows them across devices.
 *
 * It shares the right-hand slot with Ask Needt's docked panel, one at a time:
 * while Ask is open the inspector reads as closed (its preference is kept, so
 * it comes back when Ask goes), and opening the inspector puts Ask away.
 */
export const PANEL_PREF = "docPanel";

export const panelOpenFrom = (prefs: Record<string, unknown> | undefined) =>
  prefs?.[PANEL_PREF] === true;

export function useDocPanel(): [boolean, (open: boolean) => void] {
  const settings = useSettings();
  const setPref = useSetPref();
  const asking = useNeedt3Ui((s) => s.askOpen);
  const open = panelOpenFrom(settings.data?.prefs) && !asking;
  const loaded = !!settings.data;
  const set = useCallback(
    (next: boolean) => {
      // `prefs` is written whole; never write it before it has loaded.
      if (!loaded) return;
      if (next) useNeedt3Ui.getState().setAskOpen(false);
      void setPref(PANEL_PREF, next).catch(() => undefined);
    },
    [loaded, setPref]
  );
  return [open, set];
}

/**
 * ⌘⌥\ / Ctrl+Alt+\ toggles the panel. Matched by the physical key only: on
 * AltGr layouts (German, Nordic, Polish …) `\` is AltGr + a key, which the
 * browser reports as Ctrl+Alt with the AltGraph modifier, and that keystroke
 * is a character the person is typing.
 */
export function isPanelShortcut(
  e: Pick<KeyboardEvent, "metaKey" | "ctrlKey" | "altKey" | "code"> & {
    getModifierState?: (key: string) => boolean;
  }
) {
  if (e.getModifierState?.("AltGraph")) return false;
  return (e.metaKey || e.ctrlKey) && e.altKey && e.code === "Backslash";
}

/**
 * A database page has rows, not text blocks, so the inspector has no Insert
 * tab for it; a request for that tab (the top bar's Insert) shows Style.
 */
export function inspectorTab<T extends string>(tab: T, isDatabase: boolean) {
  return isDatabase && tab === "insert" ? "style" : tab;
}
