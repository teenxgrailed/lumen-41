/**
 * Where each place's page was left, for the phone's Back/Forward.
 *
 * The phone scrolls the document (kit/scroll.ts), so the offset is remembered
 * per path here and put back when the browser goes Back. Three things used to
 * go wrong and are pinned by __tests__/scrollMemory.test.ts:
 *
 *  - the offset was committed 150 ms after the last scroll event, so a tap
 *    inside that window (a flick, then a tap on the dock) lost it; the shell
 *    now also records it at the moment the old page is replaced;
 *  - "this was a Back" was a flag that nothing cleared, so a popstate that
 *    changed no path (a query change, a closed overlay) made the next forward
 *    tap restore an old offset instead of starting at the top; it now expires;
 *  - the restore ran twice (now and one frame later), so a page that streamed
 *    in after that was clamped to the short skeleton's height; it now keeps
 *    asking, frame by frame, until the page is tall enough, and lets go the
 *    moment a finger or a key takes over.
 */
import { pkScrollMax } from "../kit/scroll";

/** A route change this soon after a popstate is Back/Forward. */
export const SCROLL_POP_WINDOW_MS = 4000;
/** How long a restore keeps waiting for the page to grow tall enough. */
export const SCROLL_RESTORE_MS = 1200;

const saved = new Map<string, number>();
let popAt = -Infinity;

export function scrollRemember(path: string, y: number): void {
  saved.set(path, Math.max(0, Math.round(y)));
}

export function scrollRecall(path: string): number {
  return saved.get(path) ?? 0;
}

/** The browser reported a popstate. */
export function scrollNotePop(now: number): void {
  popAt = now;
}

/** The user chose to go somewhere (a tap on a link or the dock): not a Back. */
export function scrollNotePush(): void {
  popAt = -Infinity;
}

/** True while a popstate is recent enough to be the cause of a route change. */
export function scrollPopRecent(now: number): boolean {
  return now - popAt < SCROLL_POP_WINDOW_MS;
}

/** Whether a route change now is a Back/Forward; consumes the mark. */
export function scrollTakePop(now: number): boolean {
  const recent = scrollPopRecent(now);
  popAt = -Infinity;
  return recent;
}

/** Test seam. */
export function scrollMemoryReset(): void {
  saved.clear();
  popAt = -Infinity;
}

/**
 * Puts the page at `y`, and keeps putting it there each frame until the page
 * is tall enough to hold it, the budget runs out, or the user takes over.
 * Returns the cancel.
 */
export function scrollRestore(
  y: number,
  budget = SCROLL_RESTORE_MS
): () => void {
  if (typeof window === "undefined") return () => undefined;
  window.scrollTo(0, y);
  if (y <= 0) return () => undefined;
  const start = performance.now();
  let raf = 0;
  let stopped = false;
  const events = ["touchstart", "wheel", "keydown", "mousedown"] as const;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    window.cancelAnimationFrame(raf);
    events.forEach((e) => window.removeEventListener(e, stop, true));
  };
  events.forEach((e) =>
    window.addEventListener(e, stop, { passive: true, capture: true })
  );
  const tick = () => {
    if (stopped) return;
    const max = pkScrollMax();
    window.scrollTo(0, Math.min(y, max));
    if (max >= y || performance.now() - start > budget) {
      stop();
      return;
    }
    raf = window.requestAnimationFrame(tick);
  };
  raf = window.requestAnimationFrame(tick);
  return stop;
}
