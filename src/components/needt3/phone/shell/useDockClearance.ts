"use client";

import { useEffect } from "react";

import { tailExtra } from "@/lib/needt3/dock-clearance";

import { pkScrollLocked } from "../kit/scroll";

const PROP = "--v3-tail-extra";

/**
 * The installed app only: measures the floating dock against the page's tail
 * and, where the last row would end under the dock at the bottom of the page,
 * writes the missing height as `--v3-tail-extra` on <html> (phone-ground.css
 * adds it to the tail). The pure rule is `tailExtra` (lib/needt3/
 * dock-clearance.ts); the reasons are in phone-ground.css at `--v3-tail-h`.
 *
 * Nothing moves in a Safari tab: there the numbers in the CSS are measured and
 * the bars come and go with the scroll, so a measurement would chase them.
 */
export function useDockClearance(placeKey: string): void {
  useEffect(() => {
    const html = document.documentElement;
    if (html.getAttribute("data-display-mode") !== "standalone") return;

    let extra = 0;
    let raf = 0;

    const measure = () => {
      raf = 0;
      // A held page (a sheet pins the body) and a field with the keyboard up
      // are not the page at rest.
      if (pkScrollLocked()) return;
      const a = document.activeElement;
      if (
        a instanceof HTMLElement &&
        (a.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName))
      )
        return;
      const dock = document.querySelector(".nfb-pill");
      const tail = document.querySelector(".pk-tail");
      if (!dock || !tail) return;
      const d = dock.getBoundingClientRect();
      const t = tail.getBoundingClientRect();
      if (d.height === 0 || t.height === 0) return;
      const vv = window.visualViewport;
      const root = document.scrollingElement ?? html;
      const next = tailExtra({
        dockTop: d.top,
        tailTop: t.top,
        scrollY: window.scrollY,
        scrollHeight: root.scrollHeight,
        visibleHeight: Math.max(
          window.innerHeight,
          vv ? vv.height + vv.offsetTop : 0
        ),
        extra,
      });
      if (next === extra) return;
      extra = next;
      if (extra > 0) html.style.setProperty(PROP, `${extra}px`);
      else html.style.removeProperty(PROP);
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(measure);
    };

    schedule();
    window.addEventListener("resize", schedule);
    window.addEventListener("orientationchange", schedule);
    window.addEventListener("load", schedule);
    window.visualViewport?.addEventListener("resize", schedule);
    // The dock and the tail change with the screen and with the bar's style.
    const ro =
      typeof ResizeObserver === "function"
        ? new ResizeObserver(schedule)
        : null;
    const dock = document.querySelector(".nfb-pill");
    if (dock) ro?.observe(dock);
    // The first reading can run before the viewport settles; read once more.
    const settle = window.setTimeout(schedule, 1200);

    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.clearTimeout(settle);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("orientationchange", schedule);
      window.removeEventListener("load", schedule);
      window.visualViewport?.removeEventListener("resize", schedule);
      ro?.disconnect();
      html.style.removeProperty(PROP);
    };
  }, [placeKey]);
}
