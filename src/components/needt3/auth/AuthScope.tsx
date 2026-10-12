"use client";

import { type PropsWithChildren, useEffect, useState } from "react";

// One entry, so the vendored CSS always loads before the port's overrides.
import "@/styles/v3-entry.css";

import { V3_FONT_CLASSES } from "@/lib/needt3/fonts";

/**
 * The `.needt-v3` scope for a screen that renders without the signed-in frame
 * (sign-in is visible to people who have no session, so `V3Root` is not there).
 * Follows the operating system's light / dark; there is no stored choice yet.
 */
export function AuthScope({ children }: PropsWithChildren) {
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
      className={`needt-v3 ${V3_FONT_CLASSES} relative h-dvh min-h-0 overflow-hidden`}
      data-theme={dark ? "dark" : "light"}
      style={{
        background: "var(--background)",
        color: "var(--text-primary)",
        font: "var(--type-ui)",
      }}
      suppressHydrationWarning
    >
      {children}
    </div>
  );
}
