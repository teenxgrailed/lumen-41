"use client";

import { type PropsWithChildren, useEffect, useState } from "react";

import "@/styles/v3-entry.css";

import { V3_FONT_CLASSES } from "@/lib/needt3/fonts";

type Side = "light" | "dim" | "dark";

/**
 * The `.needt-v3` scope for a public page that scrolls (booking, a shared
 * moodboard, legal text, a dead link). It takes the theme the root layout's
 * pre-paint script already put on `<html>` (`data-theme`: the person's stored
 * theme when signed in, the default otherwise), which is the theme these pages
 * had before they moved to v3. Paper and Warm are the light side of the v3
 * tokens; Dim and Dark map one to one.
 *
 * The inline script sets the same value on the scope before the first paint,
 * so a dark visitor never sees the light server render flash; the state then
 * agrees with the DOM after hydration.
 */
const READ_SIDE = `var t=document.documentElement.getAttribute("data-theme");return t==="dark"||t==="dim"?t:"light";`;

/** Same rule as `READ_SIDE`, for the state after hydration. */
function readSide(): Side {
  const t = document.documentElement.getAttribute("data-theme");
  return t === "dark" || t === "dim" ? t : "light";
}

export function PublicScope({ children }: PropsWithChildren) {
  const [side, setSide] = useState<Side>("light");
  useEffect(() => {
    setSide(readSide());
  }, []);
  return (
    <div
      className={`needt-v3 ${V3_FONT_CLASSES} pub-scope`}
      data-theme={side}
      suppressHydrationWarning
    >
      <script
        // Runs while the HTML is parsed, before the scope is painted.
        dangerouslySetInnerHTML={{
          __html: `(function(s){try{s.setAttribute("data-theme",(function(){${READ_SIDE}})())}catch(e){}})(document.currentScript.parentElement)`,
        }}
      />
      {children}
    </div>
  );
}
