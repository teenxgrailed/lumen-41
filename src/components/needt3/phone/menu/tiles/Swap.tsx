"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";

import { pkCx } from "../../kit/util";
import { prefersReducedMotion, useCycle } from "./beat";

/** How long the old item blurs out before the next one is put in. */
const OUT_MS = 200;
/** How long the new one takes to sharpen. */
const IN_MS = 340;

/**
 * Items that take turns on a tile, as on craft.do: the shown one blurs and
 * fades out, the next is swapped in behind the blur, and sharpens. Only
 * opacity, filter and transform move (see menu-tiles.css), the timeline is the
 * shared one in beat.ts, and the swap itself is two timeouts, no frame loop.
 */
export function Swap<T>({
  items,
  offset,
  active,
  render,
  className,
}: {
  items: readonly T[];
  offset: number;
  active: boolean;
  render: (item: T, index: number) => ReactNode;
  className?: string;
}) {
  const want = useCycle(items.length, offset, active);
  const [shown, setShown] = useState(want);
  const [phase, setPhase] = useState<"rest" | "out" | "in">("rest");
  const timers = useRef<number[]>([]);

  const shownRef = useRef(want);
  shownRef.current = shown;
  const clear = () => {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
  };

  useEffect(() => {
    if (want === shownRef.current) return;
    clear();
    if (prefersReducedMotion()) {
      setShown(want);
      return;
    }
    setPhase("out");
    timers.current.push(
      window.setTimeout(() => {
        setShown(want);
        setPhase("in");
        timers.current.push(window.setTimeout(() => setPhase("rest"), IN_MS));
      }, OUT_MS)
    );
  }, [want]);
  useEffect(() => clear, []);

  const i = Math.min(shown, Math.max(items.length - 1, 0));
  if (!items.length) return null;
  return (
    <div className={pkCx("ntm-swap", `is-${phase}`, className)}>
      {render(items[i] as T, i)}
    </div>
  );
}

/** A list cut into pages of `size`, never empty (an empty page says "nothing"). */
export function pages<T>(list: readonly T[], size: number): T[][] {
  if (!list.length) return [[]];
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}
