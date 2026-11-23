/**
 * Where Safari's own bars are, written on `<html>` before the first paint so
 * the phone shell never moves after hydration:
 *
 * - `data-display-mode`: "standalone" in the installed app, "browser" in a tab.
 * - `data-safari-bar`: "bottom" when Safari's tab bar sits at the bottom of a
 *   tab (iOS 26 Compact and Bottom layouts), "top" when the address bar is at
 *   the top (Top layout). Absent when unknown, outside iOS Safari, or in the
 *   installed app.
 *
 * phone-ground.css lifts the dock and deepens the fog only for "bottom"; every
 * other case keeps the design's dock 30 px above the display edge, so a wrong
 * or missing answer never hides the dock behind a bar.
 *
 * Measured in the iOS 26 simulator (iPhone 17 Pro, screen 874 px, safari-phone
 * probe, safari-probe/bar-measure):
 *
 *   layout   innerHeight rest/scrolled   100lvh   bottom inset scrolled
 *   Compact  714 / 754                    754      0
 *   Bottom   654 / 754                    754      0
 *   Top      660 / 768                    812, then 874   34
 *
 * The large viewport is the one number that separates the layouts and does
 * not move while the page scrolls: with the bar at the bottom it stops short of
 * the display by the status row plus the minimised bar (120 px here); with
 * the bar on top it is the whole screen (or the screen less the status row
 * for the first instant after load). innerHeight cannot: Bottom at rest and
 * Top at rest differ by 6 px.
 */

export type SafariBar = "bottom" | "top";

export interface ViewportReading {
  /** `navigator.standalone` or `(display-mode: standalone)`. */
  standalone: boolean;
  /** An iPhone / iPad / iPod (WebKit with Safari's bars). */
  ios: boolean;
  /** The height of a `100lvh` box in CSS px (0 when unsupported). */
  largeViewport: number;
  /** `screen.width` / `screen.height` in CSS px. */
  screenWidth: number;
  screenHeight: number;
  /** `window.innerWidth` / `innerHeight`. */
  innerWidth: number;
  innerHeight: number;
}

/**
 * More than this between the large viewport and the screen's long side means
 * a bar sits under the page: the status row alone is at most 62 px, the
 * status row plus the minimised tab bar at least ~100 px on a notched phone.
 */
export const BOTTOM_BAR_MIN_GAP_PX = 90;

/**
 * THE rule. Serialised into VIEWPORT_BOOT_SCRIPT with `toString`, so the body
 * must stay self-contained: no imports, no module-scope references (the
 * threshold is passed in), nothing newer than what iOS Safari 15.4 (the first with lvh) runs.
 */
export function safariBarOf(
  r: ViewportReading,
  minGap: number
): SafariBar | null {
  if (r.standalone || !r.ios) return null;
  if (!(r.largeViewport > 0)) return null;
  // Landscape: the phone UI is not drawn, and Safari's bars change places.
  if (r.innerWidth > r.innerHeight) return null;
  const tall = Math.max(r.screenWidth, r.screenHeight);
  return tall - r.largeViewport > minGap ? "bottom" : "top";
}

/** The most the screen gap may add to the page's tail. */
export const SCREEN_GAP_MAX_PX = 100;

/**
 * How far the layout viewport falls short of the screen in the installed app:
 * `screen.height` less `innerHeight`, in portrait only, 0 when the viewport is
 * as tall as the screen or taller. This is the state measured on an iPhone 17
 * Pro (innerHeight 812, screen 874): the fixed dock hangs from the 812 line
 * while the page scrolls against the whole screen, so the dock stands that much
 * higher than the end of the page. phone-ground.css adds it to the tail
 * (`--v3-screen-gap`, capped there too). 0 everywhere else: a Safari tab, a
 * landscape phone, a healthy installed app.
 *
 * Serialised into VIEWPORT_BOOT_SCRIPT with `toString`: self-contained, no
 * imports, the cap is passed in.
 */
export function screenGapOf(r: ViewportReading, cap: number): number {
  // iOS only: another platform's installed app has no such shortfall.
  if (!r.standalone || !r.ios) return 0;
  // Landscape: the phone UI is not drawn.
  if (r.innerWidth > r.innerHeight) return 0;
  const gap = Math.max(r.screenWidth, r.screenHeight) - r.innerHeight;
  return gap > 0 ? Math.min(Math.round(gap), cap) : 0;
}

/**
 * Runs as a child of `.needt-v3` right after the look script, before anything
 * below it paints. Again on resize (Safari's bars collapse and grow, the phone
 * turns) and once after load, when Safari settles the large viewport. The
 * large viewport is measured (a layout) only on the first run, after load and
 * when the width changes; scrolling only re-reads numbers the rule already
 * has. Self-contained text.
 */
export const VIEWPORT_BOOT_SCRIPT = `(function(){try{
var w=window,d=document,h=d.documentElement,n=w.navigator,lv=0,lw=-1;
var rule=${safariBarOf.toString()};
var gapOf=${screenGapOf.toString()};
var lvh=function(){var p=d.createElement("div");p.style.cssText="position:absolute;visibility:hidden;pointer-events:none;top:0;left:0;width:0;height:100lvh";h.appendChild(p);var v=p.offsetHeight;h.removeChild(p);return v};
var set=function(force){var s=w.screen||{};
if(force===true||w.innerWidth!==lw){lw=w.innerWidth;lv=lvh()}
var r={standalone:n.standalone===true||w.matchMedia("(display-mode: standalone)").matches,
ios:/iP(hone|ad|od)/.test(n.userAgent)||(n.platform==="MacIntel"&&n.maxTouchPoints>1),
largeViewport:lv,screenWidth:s.width||0,screenHeight:s.height||0,
innerWidth:w.innerWidth,innerHeight:w.innerHeight},b=rule(r,${BOTTOM_BAR_MIN_GAP_PX});
h.setAttribute("data-display-mode",r.standalone?"standalone":"browser");
if(b){if(h.getAttribute("data-safari-bar")!==b)h.setAttribute("data-safari-bar",b)}else h.removeAttribute("data-safari-bar");
if(h.style){var g=gapOf(r,${SCREEN_GAP_MAX_PX})+"px";if(h.style.getPropertyValue("--v3-screen-gap")!==g)h.style.setProperty("--v3-screen-gap",g)}};
set(true);
if(!w.__needtSafariBar){w.__needtSafariBar=1;
w.addEventListener("resize",set);
w.addEventListener("orientationchange",set);
w.addEventListener("pageshow",set);
w.addEventListener("load",function(){setTimeout(function(){set(true)},1200)})}
}catch(x){}})();`;
