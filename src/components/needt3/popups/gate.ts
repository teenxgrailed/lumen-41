import { isMacApp } from "@/lib/desktop";
import { desktopPlatform } from "@/lib/desktop";
import { isIosApp } from "@/lib/native";
import type { PopupContext, PopupPlatform } from "@/lib/popups/types";

import { useNeedt3Ui } from "@/store/needt3-ui";

import { usePaywallStore } from "../paywall/store";

/**
 * What the browser knows about whether a popup may appear right now, for the
 * coordinator (`pickPopup`). Client-only: the DOM, the stores and
 * sessionStorage.
 *
 * The feedback prompt plugs in here: ask `canShowPopup()` before drawing,
 * call `markPopupShown()` when it does, and write the show to the shared
 * history on the server (`recordPopupShown`) so it counts against the same
 * 3-day cap.
 */

const SESSION_KEY = "needt:popup-shown";
let shownInMemory = false;

/** The two routes that are onboarding (the 19-screen start, first-run setup). */
export function inOnboardingRoute(pathname: string): boolean {
  return (
    pathname === "/start" ||
    pathname.startsWith("/start/") ||
    pathname === "/setup" ||
    pathname.startsWith("/setup/")
  );
}

function shownThisSession(): boolean {
  if (shownInMemory) return true;
  try {
    return window.sessionStorage.getItem(SESSION_KEY) === "1";
  } catch {
    return false;
  }
}

/** True while some dialog other than a popup is open (a sheet, the paywall, the palette). */
function anotherDialogOpen(): boolean {
  if (usePaywallStore.getState().open) return true;
  const dialogs = document.querySelectorAll(
    '[role="dialog"], [role="alertdialog"]'
  );
  for (const el of dialogs) {
    // Our own popups wear a dialog too: the one that holds a popup does not count.
    if (!el.querySelector("[data-pp]")) return true;
  }
  return false;
}

export function popupContext(): PopupContext {
  if (typeof window === "undefined") return {};
  return {
    inOnboarding: inOnboardingRoute(window.location.pathname),
    inFocus: useNeedt3Ui.getState().focusOpen,
    dialogOpen: anotherDialogOpen(),
    shownThisSession: shownThisSession(),
  };
}

/** Whether any popup could show right now, by the browser's own facts. */
export function canShowPopup(): boolean {
  const ctx = popupContext();
  return !(
    ctx.inOnboarding ||
    ctx.inFocus ||
    ctx.dialogOpen ||
    ctx.shownThisSession
  );
}

/** One popup per session: call when a popup is drawn. */
export function markPopupShown(): void {
  shownInMemory = true;
  try {
    window.sessionStorage.setItem(SESSION_KEY, "1");
  } catch {
    /* Private mode: the in-memory flag still holds for this tab. */
  }
}

/** Where the app is running, for the announcement audience. */
export function popupPlatform(): PopupPlatform {
  if (isIosApp()) return "ios";
  const desktop = desktopPlatform();
  if (desktop === "windows") return "windows";
  if (desktop === "mac" || isMacApp()) return "mac";
  return "web";
}
