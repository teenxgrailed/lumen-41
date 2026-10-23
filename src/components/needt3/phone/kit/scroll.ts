/**
 * The phone scrolls the document, not a fixed inner container.
 *
 * Safari 26 paints its status bar and floating toolbar from whatever sits at the
 * top and bottom edge of the viewport inside a fixed container, so a phone
 * shell pinned with `position: fixed; inset: 0` gets solid bands there. Plain
 * document scrolling (as the Budget app does it) has nothing fixed at the
 * edges: the page colour is the ground and Safari samples that.
 *
 * Everything in the phone kit used to read `scrollTop` off the screen's
 * `.pk-scroll`. That element is now a plain block, and `pkAdoptDocumentScroll`
 * makes it answer for the document (scrollTop, scrollHeight, clientHeight, its
 * rect, scroll events), so gestures that already speak to "the scroller"
 * (pull-down, drag-to-reorder, the wall reorder) keep working unchanged.
 *
 * A sheet locks the page without a jump: the body is pinned at its current
 * offset and the offset is restored on release (`pkLockScroll`). While locked,
 * `pkScrollY` still reports the offset the page had, so the screen behind a
 * sheet keeps its collapsed header.
 */

let locks = 0;
let lockedY = 0;
let saved: Record<string, string> = {};

const root = () => document.scrollingElement ?? document.documentElement;

/** The page's vertical scroll offset, steady while a sheet holds the page. */
export function pkScrollY(): number {
  if (typeof window === "undefined") return 0;
  return locks > 0 ? lockedY : Math.max(0, window.scrollY);
}

/** True while a sheet (or anything else) holds the page still. */
export function pkScrollLocked(): boolean {
  return locks > 0;
}

/** How far the page can scroll. */
export function pkScrollMax(): number {
  return Math.max(0, root().scrollHeight - window.innerHeight);
}

const LOCKED = ["position", "top", "left", "right", "width"] as const;

/** Holds the page still; call the returned function to let go. Nests. */
export function pkLockScroll(): () => void {
  if (typeof document === "undefined") return () => undefined;
  if (locks === 0) {
    lockedY = Math.max(0, window.scrollY);
    const b = document.body;
    saved = {};
    for (const k of LOCKED) saved[k] = b.style.getPropertyValue(k);
    b.style.setProperty("position", "fixed");
    b.style.setProperty("top", `${-lockedY}px`);
    b.style.setProperty("left", "0");
    b.style.setProperty("right", "0");
    b.style.setProperty("width", "100%");
  }
  locks += 1;
  let done = false;
  return () => {
    if (done) return;
    done = true;
    locks -= 1;
    if (locks > 0) return;
    const b = document.body;
    for (const k of LOCKED) {
      if (saved[k]) b.style.setProperty(k, saved[k]);
      else b.style.removeProperty(k);
    }
    const y = lockedY;
    lockedY = 0;
    window.scrollTo(0, y);
  };
}

/**
 * Makes `el` the face of the document's scroll: reads and writes of
 * `scrollTop`, `scrollHeight`, `clientHeight` and `getBoundingClientRect`
 * (the viewport) go to the page, and the window's scroll events are forwarded
 * to it. Returns the undo.
 */
export function pkAdoptDocumentScroll(el: HTMLElement): () => void {
  const own = (name: string, desc: PropertyDescriptor) =>
    Object.defineProperty(el, name, { configurable: true, ...desc });
  own("scrollTop", {
    get: () => pkScrollY(),
    set: (v: number) => {
      if (locks > 0) {
        lockedY = Math.min(Math.max(0, v), pkScrollMax());
        document.body.style.setProperty("top", `${-lockedY}px`);
      } else window.scrollTo(0, v);
    },
  });
  own("scrollHeight", { get: () => root().scrollHeight });
  own("clientHeight", { get: () => window.innerHeight });
  own("getBoundingClientRect", {
    value: () =>
      ({
        x: 0,
        y: 0,
        left: 0,
        top: 0,
        right: window.innerWidth,
        bottom: window.innerHeight,
        width: window.innerWidth,
        height: window.innerHeight,
        toJSON: () => ({}),
      }) as DOMRect,
  });
  const forward = () => el.dispatchEvent(new Event("scroll"));
  window.addEventListener("scroll", forward, { passive: true });
  return () => {
    window.removeEventListener("scroll", forward);
    for (const k of [
      "scrollTop",
      "scrollHeight",
      "clientHeight",
      "getBoundingClientRect",
    ])
      delete (el as unknown as Record<string, unknown>)[k];
  };
}

/**
 * How far the phone's full-screen fixed layers (menu, sheet layer, scrim) stand
 * in from the top and bottom edge (`--v3-edge`, phone-ground.css): Safari 26
 * tints its bars from a full-width fixed element at an edge, so they keep off
 * it. Code that measures such a layer adds twice this back to get the screen.
 */
export function pkEdgeInset(el: Element): number {
  if (typeof getComputedStyle === "undefined") return 0;
  return parseFloat(getComputedStyle(el).getPropertyValue("--v3-edge")) || 0;
}

/**
 * The collapsing header's progress (phone-shell `psK`): 0 until 8 px of scroll,
 * 1 at 52 px, which is when the large title (36 px) is gone and the small one
 * has fully arrived. Written as `--ps-k` on the screen root.
 */
export function pkPsK(y: number): number {
  return Math.max(0, Math.min(1, (y - 8) / 44));
}
