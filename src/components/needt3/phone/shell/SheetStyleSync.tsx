"use client";

import { useEffect } from "react";

import { useSettings } from "@/lib/needt3/hooks/settings";
import { SHEET_STYLE_ATTR, sheetStyleFrom } from "@/lib/needt3/sheet-style";

/**
 * Puts the account's sheet look (`prefs.sheetStyle`) on the v3 frame as
 * `data-sheet-style`, where the sheet CSS and `PkSheet` read it. Nothing is
 * drawn. Until settings load the frame carries the default (a pop-up).
 */
export function SheetStyleSync() {
  const settings = useSettings();
  const style = sheetStyleFrom(settings.data?.prefs);
  useEffect(() => {
    const el = document.querySelector(".needt-v3");
    el?.setAttribute(SHEET_STYLE_ATTR, style);
  }, [style]);
  return null;
}
