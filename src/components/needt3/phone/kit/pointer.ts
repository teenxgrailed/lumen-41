/**
 * Window-level pointer tracking for one drag (phone-kit.jsx `pkTrack`), the
 * abort bus a hold uses to take the finger (`pkOwnGesture`), and the
 * one-frame writer.
 */

export type EndReason = "up" | "cancel";

/**
 * Follow one drag on the window: `move(e)` for every pointermove of the
 * tracked pointer, `end(e, reason)` once, then the listeners are gone.
 *
 * - With `pointerId`, other fingers' events are ignored (a second finger
 *   lifting must not end this drag).
 * - `reason` is "up" for a pointerup and "cancel" for a pointercancel or an
 *   abort (`pkAbortGestures`). A cancelled drag must not commit anything, and
 *   its event carries no usable coordinates, so `end` gets the event only for
 *   an "up".
 *
 * Returns a function that detaches early (an unmount in the middle of a drag).
 */
export function pkTrack(
  move: (e: PointerEvent) => void,
  end: (e: PointerEvent | null, reason: EndReason) => void,
  pointerId?: number
) {
  let done = false;
  const mine = (e: PointerEvent) =>
    pointerId === undefined || e.pointerId === pointerId;
  const off = () => {
    done = true;
    window.removeEventListener("pointermove", mv, true);
    window.removeEventListener("pointerup", up, true);
    window.removeEventListener("pointercancel", cancel, true);
    unAbort();
  };
  const mv = (e: PointerEvent) => {
    if (!done && mine(e)) move(e);
  };
  const up = (e: PointerEvent) => {
    if (done || !mine(e)) return;
    off();
    end(e, "up");
  };
  const cancel = (e: PointerEvent) => {
    if (done || !mine(e)) return;
    off();
    end(null, "cancel");
  };
  const unAbort = onGestureAbort((id) => {
    if (
      done ||
      (pointerId !== undefined && id !== undefined && id !== pointerId)
    )
      return;
    off();
    end(null, "cancel");
  });
  window.addEventListener("pointermove", mv, true);
  window.addEventListener("pointerup", up, true);
  window.addEventListener("pointercancel", cancel, true);
  return off;
}

/* ---------- the abort bus ---------- */

const ABORT = "pk-gesture-abort";

/**
 * A hold has fired: every other gesture on the screen (a row's swipe, the
 * pull-down, a sheet drag) must let go of the finger without committing. This
 * replaces the prototype's synthetic `pointercancel`, whose coordinates are
 * zero and which a real browser cancel cannot be told apart from.
 */
export function pkAbortGestures(pointerId?: number) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(ABORT, { detail: { pointerId } }));
}

/** Subscribe to the abort bus; returns the unsubscribe. */
export function onGestureAbort(fn: (pointerId: number | undefined) => void) {
  const h = (e: Event) =>
    fn((e as CustomEvent<{ pointerId?: number }>).detail?.pointerId);
  window.addEventListener(ABORT, h);
  return () => window.removeEventListener(ABORT, h);
}

/**
 * A hold that becomes a lift (a drag) takes the finger: the screen's own
 * gestures are aborted, and touch moves stop scrolling until the returned
 * release() is called.
 */
export function pkOwnGesture(pointerId: number) {
  pkAbortGestures(pointerId);
  const stop = (e: TouchEvent) => {
    e.stopPropagation();
    if (e.cancelable) e.preventDefault();
  };
  window.addEventListener("touchmove", stop, { capture: true, passive: false });
  return () =>
    window.removeEventListener("touchmove", stop, {
      capture: true,
    } as EventListenerOptions);
}

/**
 * One animation frame per pointer stream: `schedule(fn)` runs `fn` on the
 * next frame, and a second call before then only replaces what runs. So a
 * burst of pointermoves paints once per frame.
 */
export function frameWriter() {
  let raf = 0;
  let next: (() => void) | null = null;
  return {
    schedule(fn: () => void) {
      next = fn;
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const run = next;
        next = null;
        run?.();
      });
    },
    cancel() {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      next = null;
    },
  };
}
