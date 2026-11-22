/**
 * The look of a phone sheet, one per account (`UserSettings.prefs.sheetStyle`,
 * so it follows the person to every device and is readable and writable
 * through `/api/user-settings`).
 *
 * - "popup": a card that floats clear of the screen edges and pops up (the
 *   default, from 22.11.26).
 * - "classic": the frosted sheet docked to the bottom edge.
 * - "white": the classic sheet on a white plate, in either theme.
 */
export type SheetStyle = "popup" | "classic" | "white";

export const SHEET_STYLES: readonly SheetStyle[] = [
  "popup",
  "classic",
  "white",
];
export const DEFAULT_SHEET_STYLE: SheetStyle = "popup";
export const SHEET_STYLE_PREF = "sheetStyle";

export const isSheetStyle = (v: unknown): v is SheetStyle =>
  typeof v === "string" && (SHEET_STYLES as readonly string[]).includes(v);

/** The stored value, or the default when it is absent or not one of the three. */
export function sheetStyleFrom(prefs: unknown): SheetStyle {
  const raw =
    prefs && typeof prefs === "object"
      ? (prefs as Record<string, unknown>)[SHEET_STYLE_PREF]
      : null;
  return isSheetStyle(raw) ? raw : DEFAULT_SHEET_STYLE;
}

/** The attribute the phone frame carries; CSS and the sheet read it. */
export const SHEET_STYLE_ATTR = "data-sheet-style";
