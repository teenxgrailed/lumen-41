/**
 * THE APP ICON — which of the thirteen Needt icons a person wears.
 *
 * The choice is a UI preference stored in `UserSettings.prefs.appIcon` (so it
 * follows the person to every device, like the accent) and is readable and
 * writable through `GET/PATCH /api/user-settings`. `prefs.seenIconPicker` is
 * set once the "New icons for Needt" popup has been dismissed or a choice made,
 * so it is shown one time only. Pure: no React, no DOM except
 * `applyDocumentIcons`.
 *
 * Free: Midnight, Ink, Sky, Paper. The rest are Pro (a trial counts).
 */

/** The key in `prefs`. */
export const APP_ICON_PREF = "appIcon";
/** The key in `prefs`: the one-time popup has been dealt with. */
export const SEEN_ICON_PICKER_PREF = "seenIconPicker";

export type AppIconTier = "free" | "pro";

export interface AppIconDef {
  id: string;
  name: string;
  tier: AppIconTier;
  /** Dark icons are listed first in the picker. */
  dark: boolean;
}

/** icons.json of the design pack, in its order. */
export const APP_ICONS: readonly AppIconDef[] = [
  { id: "midnight", name: "Midnight", tier: "free", dark: true },
  { id: "eclipse", name: "Eclipse", tier: "pro", dark: true },
  { id: "glass", name: "Glass", tier: "pro", dark: true },
  { id: "aurora", name: "Aurora", tier: "pro", dark: true },
  { id: "dusk", name: "Dusk", tier: "pro", dark: true },
  { id: "night", name: "Night sky", tier: "pro", dark: true },
  { id: "orb", name: "Orb", tier: "pro", dark: true },
  { id: "halftone", name: "Halftone", tier: "pro", dark: true },
  { id: "ember", name: "Ember", tier: "pro", dark: true },
  { id: "ink", name: "Ink", tier: "free", dark: true },
  { id: "sky", name: "Sky", tier: "free", dark: false },
  { id: "pearl", name: "Pearl", tier: "pro", dark: false },
  { id: "paper", name: "Paper", tier: "free", dark: false },
];

/** Midnight is the icon everywhere until a person picks another. */
export const DEFAULT_APP_ICON = "midnight";

export function isAppIconId(v: unknown): v is string {
  return typeof v === "string" && APP_ICONS.some((i) => i.id === v);
}

export function appIconDef(id: string | null | undefined): AppIconDef {
  return APP_ICONS.find((i) => i.id === id) ?? APP_ICONS[0];
}

/** The icon a person saved, or Midnight when none or unknown. */
export function appIconFromPrefs(
  prefs: Record<string, unknown> | null | undefined
): string {
  const v = prefs?.[APP_ICON_PREF];
  return isAppIconId(v) ? v : DEFAULT_APP_ICON;
}

export function seenIconPickerFromPrefs(
  prefs: Record<string, unknown> | null | undefined
): boolean {
  return prefs?.[SEEN_ICON_PICKER_PREF] === true;
}

/** A Pro icon is locked on Free; a trial or any paid plan unlocks all 13. */
export function appIconLocked(
  id: string,
  planKind: string | null | undefined
): boolean {
  return appIconDef(id).tier === "pro" && (planKind ?? "free") === "free";
}

/**
 * The one-time popup shows when settings and the plan have loaded, the person
 * has not seen it, and the window is not driven by a test runner.
 */
export function shouldShowIconPicker(input: {
  loaded: boolean;
  seen: boolean;
  automated?: boolean;
}): boolean {
  return input.loaded && !input.seen && !input.automated;
}

/** Why a `prefs` write about the icon is invalid, or null. For the API. */
export function appIconPrefsError(
  prefs: Record<string, unknown>
): string | null {
  if (APP_ICON_PREF in prefs && !isAppIconId(prefs[APP_ICON_PREF]))
    return "Invalid app icon";
  if (
    SEEN_ICON_PICKER_PREF in prefs &&
    typeof prefs[SEEN_ICON_PICKER_PREF] !== "boolean"
  )
    return "Invalid seenIconPicker";
  return null;
}

export const appIconSrc = (id: string) => `/app-icons/${id}/icon.svg`;

/** What a `<link>` of the page's head should point at for this icon. */
export function iconLinkHref(
  rel: string,
  type: string | null,
  id: string
): string | null {
  const rels = rel.toLowerCase().split(/\s+/);
  if (rels.includes("apple-touch-icon"))
    return `/app-icons/${id}/apple-touch-icon.png`;
  if (!rels.includes("icon")) return null;
  return type === "image/svg+xml"
    ? appIconSrc(id)
    : `/app-icons/${id}/favicon.png`;
}

/** Points the favicon(s) and the apple-touch-icon at the chosen icon. */
export function applyDocumentIcons(id: string): void {
  if (typeof document === "undefined") return;
  const links = document.head.querySelectorAll<HTMLLinkElement>(
    'link[rel~="icon"], link[rel="apple-touch-icon"]'
  );
  links.forEach((link) => {
    const href = iconLinkHref(link.rel, link.getAttribute("type"), id);
    if (href && link.getAttribute("href") !== href)
      link.setAttribute("href", href);
  });
}

/** The toast after a choice, exactly as the owner worded it. */
export const APP_ICON_CHANGED_TOAST =
  "Icon changed. On your home screen it updates after you re-add Needt.";

/** The iOS alternate-icon name; null is the primary icon (Midnight). */
export function nativeIconName(id: string): string | null {
  return id === DEFAULT_APP_ICON ? null : `AppIcon-${id}`;
}
