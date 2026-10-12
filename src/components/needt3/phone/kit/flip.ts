"use client";

import { type RefObject, useLayoutEffect, useRef } from "react";

import { pkReduced } from "./util";

/**
 * A removed row leaves in two steps: it fades and clips away where it stands
 * (opacity + clip-path), then the list closes the gap at once and the rows
 * below slide up from where they were (FLIP, transform only). Nothing animates
 * height, so no layout runs per frame.
 */

export interface FlipDelta {
  id: string;
  /** Pixels the row sat below its new position (positive = it moved up). */
  dy: number;
}

/** Rows present in both maps whose offset changed by more than half a pixel. */
export function flipDeltas(
  before: ReadonlyMap<string, number>,
  after: ReadonlyMap<string, number>
): FlipDelta[] {
  const out: FlipDelta[] = [];
  for (const [id, now] of after) {
    const was = before.get(id);
    if (was === undefined) continue;
    const dy = was - now;
    if (Math.abs(dy) > 0.5) out.push({ id, dy });
  }
  return out;
}

export const FLIP_MS = 200;

/**
 * Slide the rows of a list into their new places when its row set changes.
 * `signature` changes with the rows (their ids joined); offsets are measured
 * against the list's own top, so scrolling between renders cannot fake a move.
 * Reads layout once per change, never per frame.
 */
export function useFlipRows(
  ref: RefObject<HTMLElement | null>,
  signature: string
) {
  const prev = useRef<Map<string, number>>(new Map());
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const top = el.getBoundingClientRect().top;
    const rows = [...el.querySelectorAll<HTMLElement>("[data-pk-row]")];
    const next = new Map<string, number>();
    for (const r of rows)
      next.set(
        r.getAttribute("data-pk-row") ?? "",
        r.getBoundingClientRect().top - top
      );
    if (!pkReduced() && typeof Element.prototype.animate === "function") {
      for (const { id, dy } of flipDeltas(prev.current, next)) {
        rows
          .find((r) => r.getAttribute("data-pk-row") === id)
          ?.animate(
            [{ transform: `translate3d(0,${dy}px,0)` }, { transform: "none" }],
            { duration: FLIP_MS, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" }
          );
      }
    }
    prev.current = next;
    // `ref` is stable; the row set is what this reacts to
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);
}
