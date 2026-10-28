"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import { useSession } from "next-auth/react";
import { usePathname, useRouter } from "next/navigation";

import { useFocusSession } from "@/lib/needt3/hooks/focus";
import { usePlan } from "@/lib/needt3/hooks/plan";
import { useSettings } from "@/lib/needt3/hooks/settings";

import { useNeedt3Ui } from "@/store/needt3-ui";

import { planPill } from "../../shell/AccountMenu";
import { pkDotSweep } from "../kit/Material";
import { pkScrollY } from "../kit/scroll";
import { usePkSide } from "../kit/theme";
import { FocusDockButton } from "../menu/FocusDockButton";
import { Menu } from "../menu/Menu";
import {
  type MenuPlaceId,
  menuAction,
  menuIdForPath,
  menuTilesFrom,
} from "../menu/places";
import { usePhoneCounts } from "../menu/usePhoneCounts";
import { PhoneOverlays } from "../overlays/PhoneOverlays";
import { PageSnapshot } from "./PageSnapshot";
import { useCoverActive } from "./cover";
import {
  pageMotionCapture,
  pageMotionDiscard,
  pageMotionFor,
  pageMotionIsPop,
  pageMotionNotePop,
  pageMotionRun,
  placeKeyOf,
} from "./pageMotion";
import {
  scrollNotePop,
  scrollNotePush,
  scrollRecall,
  scrollRemember,
  scrollRestore,
  scrollTakePop,
} from "./scrollMemory";

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
 * Scroll to the top on a new route, back to the saved offset on back/forward.
 * The offset is remembered per path while the page scrolls, and at the moment
 * the page is replaced (PageSnapshot); scrollMemory.ts says why.
 */
function usePageScrollPerRoute(pathname: string) {
  const path = useRef(pathname);
  useEffect(() => {
    const pop = () => scrollNotePop(performance.now());
    /* Next scrolls to the top on a navigation before the new pathname
       arrives; committing a position only once the page has rested on the
       same path keeps that jump from overwriting where the screen was left. */
    let pending: number | undefined;
    const onScroll = () => {
      const at = path.current;
      const y = pkScrollY();
      window.clearTimeout(pending);
      pending = window.setTimeout(() => {
        if (path.current === at) scrollRemember(at, y);
      }, 150);
    };
    window.addEventListener("popstate", pop);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("popstate", pop);
      window.removeEventListener("scroll", onScroll);
      window.clearTimeout(pending);
    };
  }, []);
  /* Before the first paint of the new page, so the page change (pageMotion.ts)
   * never shows the new screen at the old offset. */
  useLayoutEffect(() => {
    if (path.current === pathname) return undefined;
    path.current = pathname;
    const y = scrollTakePop(performance.now()) ? scrollRecall(pathname) : 0;
    // the content may still be filling in: keep asking until it can hold y
    return scrollRestore(y);
  }, [pathname]);
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
  // A running session switches the dock to the focus-done row.
  const focusOn = !!useFocusSession().data;
  const settings = useSettings();
  const counts = usePhoneCounts();
  const composerOpen = useNeedt3Ui((s) => s.composerOpen);
  const askOpen = useNeedt3Ui((s) => s.askOpen);
  const covered = useCoverActive();

  const screen = menuIdForPath(pathname);
  const tiles = menuTilesFrom(settings.data?.prefs);

  const away = askOpen || covered;
  const morph = useLinger(composerOpen, MORPH_SETTLE_MS);

  /* The page scrolls (kit/scroll.ts), so a new screen starts at the top and
     going back returns to where that screen was left. */
  usePageScrollPerRoute(pathname);

  /* A place switch gets the one-shot halftone sweep; the first screen does not. */
  const lastScreen = useRef<MenuPlaceId | null>(screen);
  useEffect(() => {
    if (screen && screen !== lastScreen.current)
      pkDotSweep(undefined, "screen");
    lastScreen.current = screen;
  }, [screen]);

  /* A place switch moves the page with a direction (pageMotion.ts): from the
     dock's side, or rising from the dock for a place of the menu card. Back and
     Forward are Safari's own gesture and are left alone. */
  const motionFrom = useRef({ key: placeKeyOf(pathname), screen });
  useEffect(() => {
    const onPop = () => pageMotionNotePop();
    /* A tap on an internal link into another place keeps a still copy of the
       page first; the click still goes to the link. */
    const onClick = (e: MouseEvent) => {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey)
        return;
      const a = (e.target as Element | null)?.closest?.("a[href]") as
        | HTMLAnchorElement
        | null
        | undefined;
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      let url: URL;
      try {
        url = new URL(a.href, window.location.href);
      } catch {
        return;
      }
      if (url.origin !== window.location.origin) return;
      scrollNotePush();
      if (placeKeyOf(url.pathname) === placeKeyOf(window.location.pathname))
        return;
      pageMotionCapture();
    };
    window.addEventListener("popstate", onPop);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("popstate", onPop);
      document.removeEventListener("click", onClick, true);
    };
  }, []);
  useLayoutEffect(() => {
    const key = placeKeyOf(pathname);
    const prev = motionFrom.current;
    motionFrom.current = { key, screen };
    if (key === prev.key) return;
    // the first screen, a redirect into the app, or the browser's own Back
    if (!prev.key || pageMotionIsPop()) {
      pageMotionDiscard();
      return;
    }
    pageMotionRun(pageMotionFor(prev.screen, screen, tiles));
  }, [pathname, screen, tiles]);

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
      else {
        scrollNotePush();
        if (placeKeyOf(action.href) !== placeKeyOf(window.location.pathname))
          pageMotionCapture();
        router.push(action.href);
      }
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
        focus={<FocusDockButton />}
        focusOn={focusOn}
        morph={morph}
        onPick={onPick}
        onSettings={onSettings}
        onMoving={onMoving}
      />
      <PhoneOverlays />
      <PageSnapshot pathname={pathname} />
    </>
  );
}
