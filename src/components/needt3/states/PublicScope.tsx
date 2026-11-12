"use client";

import { type PropsWithChildren, useEffect, useState } from "react";

import "@/styles/v3-entry.css";

import { V3_FONT_CLASSES } from "@/lib/needt3/fonts";

/**
 * The `.needt-v3` scope for a public page that scrolls (booking, a shared
 * moodboard, legal text, a dead link). Like `AuthScope` it follows the
 * operating system's light / dark, because a visitor has no stored look; unlike
 * it, the page grows with its content instead of being pinned to the viewport.
 */
export function PublicScope({ children }: PropsWithChildren) {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    setDark(mq.matches);
    const read = (e: MediaQueryListEvent) => setDark(e.matches);
    mq.addEventListener("change", read);
    return () => mq.removeEventListener("change", read);
  }, []);
  return (
    <div
      className={`needt-v3 ${V3_FONT_CLASSES} pub-scope`}
      data-theme={dark ? "dark" : "light"}
      suppressHydrationWarning
    >
      {children}
    </div>
  );
}
