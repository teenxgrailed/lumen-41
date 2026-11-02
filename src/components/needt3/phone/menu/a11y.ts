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
 * Keep the screen behind the open card out of reach, without `inert`.
 *
 * `inert` is an inherited part of the computed style: flipping it on the screen
 * host restyled every element under it (1,432 on Today), once per open and once
 * per close, about 0.3 s each on a 4x-throttled phone (PR "perf: Every place
 * style recalc"). This does the same job without touching style:
 *
 * - screen readers: `aria-hidden` on the host;
 * - keyboard: a `focusin` guard hands focus back to the card the moment it
 *   lands anywhere in the host (and does so now, if it is there already);
 * - pointer: the card's own scrim and shape already cover the screen.
 *
 * `data-nva-blocked` is the CSS hook (the host's glass rests under the dimming
 * scrim, phone-perf.css). Returns the undo.
 */
export function blockScreen(
  host: Element | null | undefined,
  refocus: () => void
): () => void {
  if (!host) return () => undefined;
  const inside = (n: EventTarget | Node | null) =>
    n instanceof Node && host.contains(n);
  const onFocusIn = (e: FocusEvent) => {
    if (inside(e.target)) refocus();
  };
  host.setAttribute("aria-hidden", "true");
  host.setAttribute("data-nva-blocked", "");
  document.addEventListener("focusin", onFocusIn);
  if (inside(document.activeElement)) refocus();
  return () => {
    document.removeEventListener("focusin", onFocusIn);
    host.removeAttribute("aria-hidden");
    host.removeAttribute("data-nva-blocked");
  };
}
