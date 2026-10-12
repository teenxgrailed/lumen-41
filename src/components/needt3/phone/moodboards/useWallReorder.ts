"use client";

import {
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import { moveId, sameOrder } from "@/lib/needt3/board-order";
import { HOLD_MS, holdMoved } from "@/lib/needt3/gesture";
import { haptic } from "@/lib/needt3/platform";

import { frameWriter, pkOwnGesture, pkTrack } from "../kit/pointer";
import { pkReduced } from "../kit/util";

/**
 * Hold a reference on the wall to lift it, drag it among the others, drop it
 * (phone-habits.jsx `PhbWall`). A press that moves before the hold fires is a
 * scroll and gives the finger back; a hold released where it started is a
 * long press (`onHold`); a lift that moved and changed the order commits it
 * (`onOrder`); a cancelled touch (`pointercancel`, an abort from another
 * gesture, unmount) never commits anything.
 *
 * Motion: the lifted tile follows the finger by `transform` written through a
 * ref once per frame (`frameWriter`; the edge scroll rides the same chain),
 * the others slide with a transform-only animation, and nothing here reads
 * layout in the pointer path: every tile's box is measured when the tile
 * lifts and again after the order changes, and a scroll is read as the
 * difference in `scrollTop` since. One gesture at a time: a second pointerdown
 * is ignored until the first ends. Every listener is removed on end and on
 * unmount.
 */

const LIFT_SCALE = 1.04;
const EDGE = 110;
const SWALLOW_MS = 450;

interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

interface Gesture {
  pid: number;
  id: string;
  sx: number;
  sy: number;
  x: number;
  y: number;
  /** Where inside the tile the finger took hold. */
  gx: number;
  gy: number;
  el: HTMLElement;
  lifted: boolean;
  moved: boolean;
  timer: number;
  untrack: () => void;
  release: (() => void) | null;
  scroller: HTMLElement | null;
  scrollTop0: number;
  boxes: Map<string, Box>;
  /** The ids in the order the wall now shows. */
  order: string[];
  before: Map<string, Box> | null;
  frame: ReturnType<typeof frameWriter>;
}

export interface WallReorderOptions {
  ids: readonly string[];
  canLift: (id: string) => boolean;
  /** The new order of every id; resolves when the write has settled. */
  onOrder: (order: string[]) => Promise<unknown> | void;
  /** A long press that did not move: open the tile's actions. */
  onHold: (id: string) => void;
}

const tiles = (box: HTMLElement) => [
  ...box.querySelectorAll<HTMLElement>("[data-phb-item]"),
];

function measure(box: HTMLElement, liftedId: string | null) {
  const out = new Map<string, Box>();
  for (const el of tiles(box)) {
    const id = el.getAttribute("data-phb-item") ?? "";
    const isLifted = id === liftedId;
    const was = el.style.transform;
    // The lifted tile is measured in its slot, not where the finger has it.
    if (isLifted) el.style.transform = "none";
    const r = el.getBoundingClientRect();
    if (isLifted) el.style.transform = was;
    out.set(id, {
      left: r.left,
      top: r.top,
      right: r.right,
      bottom: r.bottom,
    });
  }
  return out;
}

export function useWallReorder(opts: WallReorderOptions) {
  const live = useRef(opts);
  live.current = opts;
  const boxRef = useRef<HTMLDivElement>(null);
  const g = useRef<Gesture | null>(null);
  /** A click before this moment is the end of a hold, not a tap. */
  const swallowUntil = useRef(0);
  const [order, setOrder] = useState<string[] | null>(null);
  const [lift, setLift] = useState<string | null>(null);

  const tile = (id: string) =>
    tiles(boxRef.current ?? document.createElement("div")).find(
      (el) => el.getAttribute("data-phb-item") === id
    ) ?? null;

  /** The lifted tile sits under the finger, wherever its slot now is. */
  const follow = () => {
    const s = g.current;
    if (!s || !s.lifted) return;
    const el = tile(s.id);
    const slot = s.boxes.get(s.id);
    if (!el || !slot) return;
    const dy = s.scroller ? s.scroller.scrollTop - s.scrollTop0 : 0;
    const scale = pkReduced() ? "" : ` scale(${LIFT_SCALE})`;
    el.style.transform = `translate3d(${(s.x - s.gx - slot.left).toFixed(1)}px,${(
      s.y -
      s.gy -
      (slot.top - dy)
    ).toFixed(1)}px,0)${scale}`;
  };

  /** One frame of the drag: find the tile under the finger, reorder, follow, edge-scroll. */
  const step = () => {
    const s = g.current;
    if (!s || !s.lifted) return;
    const dy = s.scroller ? s.scroller.scrollTop - s.scrollTop0 : 0;
    let hit: string | null = null;
    for (const [id, b] of s.boxes) {
      if (id === s.id) continue;
      const h = b.bottom - b.top;
      if (
        s.x > b.left &&
        s.x < b.right &&
        s.y > b.top - dy + h * 0.2 &&
        s.y < b.bottom - dy - h * 0.2
      ) {
        hit = id;
      }
    }
    if (hit) {
      const to = s.order.indexOf(hit);
      const next = moveId(s.order, s.id, to);
      if (!sameOrder(next, s.order)) {
        // Remember where everything is now (scroll-corrected) for the slide.
        s.before = new Map(
          [...s.boxes].map(([id, b]) => [
            id,
            { ...b, top: b.top - dy, bottom: b.bottom - dy },
          ])
        );
        s.order = next;
        setOrder(next);
        return;
      }
    }
    follow();
    // Near the scroller's edge the wall scrolls under the hand.
    const sc = s.scroller;
    if (sc) {
      const r = sc.getBoundingClientRect();
      const v = s.y > r.bottom - EDGE ? 10 : s.y < r.top + EDGE ? -10 : 0;
      if (v) {
        sc.scrollTop += v;
        follow();
        s.frame.schedule(step);
      }
    }
  };

  // After a reorder: slide the others from where they were, re-measure.
  useLayoutEffect(() => {
    const s = g.current;
    const box = boxRef.current;
    if (!s || !s.lifted || !box || !order) return;
    s.boxes = measure(box, s.id);
    s.scrollTop0 = s.scroller ? s.scroller.scrollTop : 0;
    const before = s.before;
    s.before = null;
    if (before && !pkReduced()) {
      for (const el of tiles(box)) {
        const id = el.getAttribute("data-phb-item") ?? "";
        if (id === s.id) continue;
        const a = before.get(id);
        const b = s.boxes.get(id);
        if (!a || !b) continue;
        const dx = a.left - b.left;
        const dy = a.top - b.top;
        if (!dx && !dy) continue;
        el.animate(
          [
            { transform: `translate3d(${dx}px,${dy}px,0)` },
            { transform: "translate3d(0,0,0)" },
          ],
          { duration: 300, easing: "cubic-bezier(0.2, 0.9, 0.24, 1)" }
        );
      }
    }
    follow();
    // follow reads the gesture ref, not state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order]);

  const settle = (el: HTMLElement | null) => {
    if (!el) return;
    if (pkReduced() || typeof el.animate !== "function") {
      el.style.transform = "";
      return;
    }
    // Spring into the slot, then hand the transform back to CSS.
    const from = el.style.transform || "none";
    el.style.transform = "";
    el.animate([{ transform: from }, { transform: "none" }], {
      duration: 420,
      easing: "cubic-bezier(0.25, 1.35, 0.4, 1)",
    });
  };

  const stop = () => {
    const s = g.current;
    if (!s) return;
    window.clearTimeout(s.timer);
    s.untrack();
    s.frame.cancel();
    s.release?.();
    s.release = null;
    g.current = null;
  };

  // Unmount in the middle of a gesture: let go of everything, commit nothing.
  useEffect(
    () => () => {
      const s = g.current;
      if (s) tile(s.id)?.style.removeProperty("transform");
      stop();
    },
    []
  );

  const finish = (reason: "up" | "cancel") => {
    const s = g.current;
    if (!s) return;
    const { id, lifted, moved } = s;
    const final = s.order;
    const start = live.current.ids;
    const el = tile(id);
    stop();
    if (!lifted) return;
    swallowUntil.current = performance.now() + SWALLOW_MS;
    settle(el);
    setLift(null);
    if (reason === "cancel") {
      // A cancelled touch never commits: the wall goes back to what it was.
      setOrder(null);
      return;
    }
    if (moved && !sameOrder(final, start)) {
      Promise.resolve(live.current.onOrder(final)).finally(() =>
        setOrder(null)
      );
    } else {
      setOrder(null);
      if (!moved) live.current.onHold(id);
    }
  };

  const onPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLElement>, id: string) => {
      if (e.button || g.current) return; // a second pointer is ignored
      if (!live.current.canLift(id)) return;
      const el = e.currentTarget;
      const r = el.getBoundingClientRect();
      const frame = frameWriter();
      const s: Gesture = {
        pid: e.pointerId,
        id,
        sx: e.clientX,
        sy: e.clientY,
        x: e.clientX,
        y: e.clientY,
        gx: e.clientX - r.left,
        gy: e.clientY - r.top,
        el,
        lifted: false,
        moved: false,
        timer: 0,
        untrack: () => undefined,
        release: null,
        scroller: el.closest<HTMLElement>(".pk-scroll"),
        scrollTop0: 0,
        boxes: new Map(),
        order: [...live.current.ids],
        before: null,
        frame,
      };
      g.current = s;
      const onMove = (ev: PointerEvent) => {
        s.x = ev.clientX;
        s.y = ev.clientY;
        if (!s.lifted) {
          // Before the hold fires, travelling is a scroll: give the finger back.
          if (holdMoved(s.x - s.sx, s.y - s.sy)) stop();
          return;
        }
        if (Math.hypot(s.x - s.sx, s.y - s.sy) > 8) s.moved = true;
        s.frame.schedule(step);
      };
      const onEnd = (_ev: PointerEvent | null, reason: "up" | "cancel") => {
        if (g.current === s) finish(reason);
      };
      s.untrack = pkTrack(onMove, onEnd, e.pointerId);
      s.timer = window.setTimeout(() => {
        const box = boxRef.current;
        if (g.current !== s || !box) return;
        s.timer = 0;
        s.lifted = true;
        // pkOwnGesture aborts every tracker on the bus, this gesture's own
        // included: drop it first and follow the finger again afterwards.
        s.untrack();
        s.release = pkOwnGesture(s.pid);
        s.untrack = pkTrack(onMove, onEnd, s.pid);
        try {
          el.setPointerCapture(s.pid);
        } catch {
          /* the pointer already left */
        }
        haptic("light");
        s.scrollTop0 = s.scroller ? s.scroller.scrollTop : 0;
        s.boxes = measure(box, null);
        setLift(id);
        setOrder(s.order);
      }, HOLD_MS);
    },
    // step / finish / stop read refs only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  /** A click that ends a hold (lifted or not) must not also open the tile. */
  const onClickCapture = useCallback((e: ReactMouseEvent) => {
    if (performance.now() < swallowUntil.current) {
      e.preventDefault();
      e.stopPropagation();
      swallowUntil.current = 0;
    }
  }, []);

  const onContextMenu = useCallback((e: ReactMouseEvent, id: string) => {
    e.preventDefault();
    if (g.current?.lifted) return;
    stop();
    if (live.current.canLift(id)) live.current.onHold(id);
  }, []);

  return { boxRef, order, lift, onPointerDown, onClickCapture, onContextMenu };
}
