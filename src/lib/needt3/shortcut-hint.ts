"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * Shortcut hints per platform. The shortcut tables are written once in the
 * Mac glyphs (⌘ ⇧ ⌥ ⌃); everything that draws a hint runs it through
 * `hintFor` / `useShortcutHint`, so a person on Linux or Windows reads
 * "Ctrl+K", not a ⌘ that is not on their keyboard. The key handlers already
 * accept Ctrl as well as Meta.
 */

type NavLike = { userAgent: string; platform?: string };

/** True for Mac, iPhone and iPad (and when there is no navigator to ask). */
export function isApplePlatform(
  nav: NavLike | undefined = typeof navigator === "undefined"
    ? undefined
    : navigator
): boolean {
  if (!nav) return true;
  return /Mac|iPhone|iPad|iPod/.test(`${nav.platform ?? ""} ${nav.userAgent}`);
}

const WORDS: Record<string, string> = {
  "⌘": "Ctrl",
  "⌃": "Ctrl",
  "⇧": "Shift",
  "⌥": "Alt",
};

/**
 * "⌘⇧F" -> "Ctrl+Shift+F" off the Mac; unchanged on it. Works on a whole
 * string (a tooltip, "Last 5 copies · ⌘⇧V") and on one key cap ("⌘" -> "Ctrl").
 */
export function hintFor(text: string, apple: boolean): string {
  if (apple) return text;
  if (WORDS[text]) return WORDS[text];
  return text
    .replace(/[⌘⌃⇧⌥]/g, (g) => `${WORDS[g]}+`)
    .replace(/\+(?=\s|$)/g, "");
}

function subscribe() {
  return () => {};
}

/**
 * The hint formatter for this device. The server (and the first client
 * render) assume a Mac; a Linux or Windows browser corrects on hydration
 * without a mismatch.
 */
export function useShortcutHint(): (text: string) => string {
  const apple = useSyncExternalStore(
    subscribe,
    () => isApplePlatform(),
    () => true
  );
  return useCallback((text: string) => hintFor(text, apple), [apple]);
}
