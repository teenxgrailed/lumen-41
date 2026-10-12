"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { useSession } from "next-auth/react";
import { usePathname, useRouter } from "next/navigation";

import { usePlan } from "@/lib/needt3/hooks/plan";
import { useSettings } from "@/lib/needt3/hooks/settings";

import { useNeedt3Ui } from "@/store/needt3-ui";

import { planPill } from "../../shell/AccountMenu";
import { pkDotSweep } from "../kit/Material";
import { usePkSide } from "../kit/theme";
import { Menu } from "../menu/Menu";
import {
  type MenuPlaceId,
  menuAction,
  menuIdForPath,
  menuTilesFrom,
} from "../menu/places";
import { usePhoneCounts } from "../menu/usePhoneCounts";
import { PhoneOverlays } from "../overlays/PhoneOverlays";
import { useCoverActive } from "./cover";

/**
 * How long the pill stays out after the composer closes: the sheet goes back
 * into it with a critically damped spring (k 380, MOTION.md), done in about
 * this long. //todo: replace with the sheet's own "shut" signal if P3 adds one
 * to the UI store.
 */
export const MORPH_SETTLE_MS = 380;

/** True while `open`, and for MORPH_SETTLE_MS after it turns false. */
function useLinger(open: boolean, ms: number) {
  const [lingering, setLingering] = useState(false);
  useEffect(() => {
    if (open) {
      setLingering(true);
      return undefined;
    }
    const id = window.setTimeout(() => setLingering(false), ms);
    return () => window.clearTimeout(id);
  }, [open, ms]);
  return open || lingering;
}

/**
 * The phone's chrome: menu A, the one-shot halftone sweep on a place switch,
 * and the overlay host. It is mounted by the frame (`ShellFrame`, via
 * `V3Shell`) in the phone UI only and sits beside the route children, never
 * above them; the screen host (`data-v2p-host`) and frame (`data-v2p-frame`)
 * are attributes on the frame's own elements, so the children are the same
 * React tree at every width (see root/ShellFrame.tsx).
 *
 * Wired to the app: places are routes (`PLACES` in shell/places.ts), Ask
 * Needt and the composer are the UI store's flags, Settings opens the Settings
 * sheet through the store.
 */
export function PhoneShell() {
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const side = usePkSide();
  const session = useSession();
  const plan = usePlan();
  const settings = useSettings();
  const counts = usePhoneCounts();
  const composerOpen = useNeedt3Ui((s) => s.composerOpen);
  const askOpen = useNeedt3Ui((s) => s.askOpen);
  const covered = useCoverActive();

  const screen = menuIdForPath(pathname);
  const tiles = menuTilesFrom(settings.data?.prefs);

  const away = askOpen || covered;
  const morph = useLinger(composerOpen, MORPH_SETTLE_MS);

  /* A place switch gets the one-shot halftone sweep; the first screen does not. */
  const lastScreen = useRef<MenuPlaceId | null>(screen);
  useEffect(() => {
    if (screen && screen !== lastScreen.current)
      pkDotSweep(undefined, "screen");
    lastScreen.current = screen;
  }, [screen]);

  /* While the menu moves, the screen under it gives up its own blur bands:
     exactly one backdrop-filter (the pill's glass) is live (motion.css P2). */
  const onMoving = useCallback((moving: boolean) => {
    const host = document.querySelector("[data-v2p-host]");
    if (!host) return;
    if (moving) host.setAttribute("data-nva-moving", "");
    else host.removeAttribute("data-nva-moving");
  }, []);

  const onPick = useCallback(
    (id: MenuPlaceId) => {
      const action = menuAction(id);
      const ui = useNeedt3Ui.getState();
      if (action.kind === "ask") ui.setAskOpen(true);
      else if (action.kind === "settings") ui.openSettings();
      else router.push(action.href);
    },
    [router]
  );
  const onSettings = useCallback(
    () => useNeedt3Ui.getState().openSettings(),
    []
  );

  const user = session.data?.user;
  const name = user?.name || user?.email?.split("@")[0] || "Account";
  const kind = plan.data?.kind ?? "free";
  const me = {
    name,
    initial: name.trim().charAt(0).toUpperCase() || "?",
    plan: planPill(kind, plan.data?.trialDaysLeft ?? null).text,
    pro: kind !== "free",
  };

  return (
    <>
      <Menu
        side={side}
        screen={screen}
        tiles={tiles}
        counts={counts}
        me={me}
        away={away}
        morph={morph}
        onPick={onPick}
        onSettings={onSettings}
        onMoving={onMoving}
      />
      <PhoneOverlays />
    </>
  );
}
