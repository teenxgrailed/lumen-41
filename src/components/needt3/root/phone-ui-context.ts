"use client";

import { createContext, useContext, useLayoutEffect, useState } from "react";

import {
  PHONE_MEDIA_QUERY,
  type PhoneUi,
  resolvePhoneUi,
} from "@/lib/needt3/phone-ui";

const PhoneUiContext = createContext<PhoneUi>("desktop");
export const PhoneUiProvider = PhoneUiContext.Provider;

/**
 * Which UI the frame is drawing now ("phone" | "desktop"). A screen that has
 * a phone layout of its own reads this; the route component itself stays
 * mounted when it changes, only what it chooses to draw differs.
 */
export function usePhoneUi() {
  return useContext(PhoneUiContext);
}

/**
 * The UI to draw: the server's pick on the first render (so hydration matches),
 * then the width (`matchMedia`, 700 px) unless the `needt-ui` cookie pinned a
 * side. The first read happens in a layout effect, before paint, so a tablet
 * the server guessed wrong never shows the wrong chrome. Only the chrome
 * changes with this value (see ShellFrame).
 */
export function useResolvedPhoneUi(initial: PhoneUi, forced: boolean): PhoneUi {
  const [narrow, setNarrow] = useState<boolean | null>(null);
  useLayoutEffect(() => {
    if (forced || typeof window.matchMedia !== "function") return undefined;
    const mq = window.matchMedia(PHONE_MEDIA_QUERY);
    // Not only the change event: a crossing that lands while the tab is
    // hidden, or a resize the browser reports without a media-query event,
    // must not leave the frame on the wrong UI until a reload. A media-query
    // event carries its answer; resize, orientation and a tab coming back
    // ask the query again.
    const read = (e?: Event | MediaQueryListEvent) =>
      setNarrow(
        e && "matches" in e && typeof e.matches === "boolean"
          ? e.matches
          : mq.matches
      );
    read();
    const onVisible = () => {
      if (document.visibilityState === "visible") read();
    };
    mq.addEventListener("change", read);
    const reread = () => read();
    window.addEventListener("resize", reread);
    window.addEventListener("orientationchange", reread);
    window.addEventListener("pageshow", reread);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      mq.removeEventListener("change", read);
      window.removeEventListener("resize", reread);
      window.removeEventListener("orientationchange", reread);
      window.removeEventListener("pageshow", reread);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [forced]);
  return resolvePhoneUi({ initial, forced, narrow });
}
