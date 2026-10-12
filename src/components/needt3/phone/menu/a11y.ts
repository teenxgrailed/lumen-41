import type { NvaMode } from "@/lib/needt3/menu-a";

/** The card and the full list are the "open" stops; hidden and pill are closed. */
export function menuIsOpen(mode: NvaMode): boolean {
  return mode === "card" || mode === "full";
}

/** Where focus goes when the menu changes stop. */
export type MenuFocusMove = "tile" | "dots" | null;

/**
 * Opening (pill/handle -> card or full) puts focus on the first tile, so a
 * keyboard or screen-reader user lands inside what just appeared. Closing back
 * to the pill puts it on the "Every place" button that opened it. Moving
 * between the two open stops, or between the two closed ones, keeps focus
 * where it is. Going to the handle ("hidden") has no control to return to.
 */
export function menuFocusMove(prev: NvaMode, next: NvaMode): MenuFocusMove {
  const was = menuIsOpen(prev);
  const is = menuIsOpen(next);
  if (!was && is) return "tile";
  if (was && next === "pill") return "dots";
  return null;
}

/**
 * Set or clear the `inert` attribute on an element that React does not render
 * (the phone's screen host sits outside the menu). An inert subtree takes no
 * focus, no clicks and is hidden from assistive tech, which `aria-hidden`
 * alone does not do for focusable descendants.
 */
export function setInert(el: Element | null | undefined, on: boolean): void {
  if (!el) return;
  el.toggleAttribute("inert", on);
}
