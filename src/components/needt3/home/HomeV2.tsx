"use client";

import { type ReactNode, useState } from "react";

import { Ring } from "../work/parts";
import { overdueLabel } from "./now";

/**
 * HOME V2 (flag `home_v2`): the two shared pieces of the three-block Today.
 * Everything else on the screen is the existing Home, rearranged.
 */

/** The Tasks project card's frame colour (work/ProjectCards.tsx `frame`). */
export const railFrame = (hue: string) =>
  `color-mix(in oklab, ${hue} 24%, var(--background))`;

/**
 * All overdue work as ONE row: "N overdue -> Sort out". Closed by default;
 * opened, it holds the existing Spread / Move to today actions and the rows.
 * The count is the row's own number, not a tally above rows already on the
 * screen: while it is closed no overdue row is visible.
 */
export function OverdueRow({
  count,
  actions,
  note,
  children,
}: {
  count: number;
  /** The existing Spread / Move to today buttons. */
  actions: ReactNode;
  note?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  if (count <= 0) return null;
  return (
    <section
      className="hv2-late"
      data-hv2-late=""
      data-open={open || undefined}
    >
      <div className="hv2-late-head">
        <button
          type="button"
          className="hv2-late-main"
          aria-expanded={open}
          data-hv2-late-toggle=""
          onClick={() => setOpen((o) => !o)}
        >
          <span className="hv2-late-n">{overdueLabel(count)}</span>
          <span className="hv2-late-go">
            {open ? "Hide" : "Sort out"}
            <span aria-hidden="true">{open ? " ↑" : " →"}</span>
          </span>
        </button>
      </div>
      {open ? (
        <div className="hv2-late-body" data-hv2-late-body="">
          <div className="hv2-late-acts">{actions}</div>
          {note ? <p className="hv2-late-note">{note}</p> : null}
          {children}
        </div>
      ) : null}
    </section>
  );
}

/**
 * A rail panel in the project-card style of Tasks: a frame in the hue, a white
 * plate inside it and a progress ring. `pct` null draws no ring (a panel with
 * no progress to show keeps the frame only). The panel inside keeps its own
 * content; CSS strips its own surface so the plate is the only card.
 */
export function RailFrame({
  hue,
  pct,
  label,
  children,
}: {
  hue: string;
  pct: number | null;
  label: string;
  children: ReactNode;
}) {
  return (
    <div
      className="hv2-frame"
      data-hv2-frame={label}
      data-hv2-hue={hue}
      style={{ background: railFrame(hue) }}
    >
      <div className="hv2-plate">
        {children}
        {pct != null ? (
          <span
            className="hv2-ring"
            role="img"
            aria-label={`${Math.round(pct * 100)}%`}
          >
            <Ring pct={pct} hue={hue} />
          </span>
        ) : null}
      </div>
    </div>
  );
}

/** done / total as 0..1; null when there is nothing to measure. */
export const ratio = (done: number, total: number): number | null =>
  total > 0 ? Math.min(1, Math.max(0, done / total)) : null;

/** The most common id (first wins a tie); null when none. */
export function dominant(ids: readonly (string | null | undefined)[]) {
  const n = new Map<string, number>();
  for (const id of ids) if (id) n.set(id, (n.get(id) ?? 0) + 1);
  let best: string | null = null;
  let top = 0;
  for (const [id, c] of n)
    if (c > top) {
      best = id;
      top = c;
    }
  return best;
}
