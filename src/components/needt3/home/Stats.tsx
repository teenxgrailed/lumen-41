"use client";

import { useState } from "react";

import type { Stats, StatsRange } from "@/services/stats/home-stats";
import * as Dialog from "@radix-ui/react-dialog";

import { useV3PortalContainer } from "../ctx/PortalScope";
import { PkSheet } from "../phone/kit";
import { Card, CardLabel } from "./HomeParts";
import { dur } from "./derive";
import {
  type Bar,
  bestDayLine,
  dayBars,
  hasStatsToShow,
  statsSummary,
  weekdayBars,
  weekdayLong,
} from "./stats-model";

/**
 * STATS. A small "This week" card (done count, seven bars, the best day marked,
 * the streak) that hides itself when there is nothing to say, and a full view
 * behind it: week or month, done per day, by project, best weekday, and Focus
 * minutes when sessions were stored.
 */

function Bars({ bars, label }: { bars: readonly Bar[]; label?: boolean }) {
  return (
    <span className="st-bars" aria-hidden="true">
      {bars.map((b) => (
        <span
          key={b.key}
          className={`st-bar${b.best ? " is-best" : ""}`}
          data-st-bar={b.key}
          data-st-best={b.best ? "true" : undefined}
        >
          <span className="st-bar-fill" style={{ height: `${b.h * 100}%` }} />
          {label ? <span className="st-bar-label">{b.label}</span> : null}
        </span>
      ))}
    </span>
  );
}

/** The small card. Draws nothing without a week to show. */
export function StatsCard({
  stats,
  streak,
  onOpen,
}: {
  stats: Stats | undefined;
  /** Days closed in a row (the Streak card's number). */
  streak: number;
  onOpen: () => void;
}) {
  if (!stats || !hasStatsToShow(stats, streak)) return null;
  const best = bestDayLine(stats);
  const sub = streak ? `${streak}-day streak` : best;
  return (
    <Card hue="var(--success)" className="hd-card-sm st-card" label="This week">
      <button
        type="button"
        className="st-card-btn"
        data-st-card=""
        aria-label={`This week. ${statsSummary(stats)} Open stats.`}
        onClick={onOpen}
      >
        <CardLabel text="This week" />
        <span className="st-card-row">
          <span className="hd-card-stack">
            <span className="hd-card-big" data-st-total={stats.total}>
              {stats.total} done
            </span>
            {sub ? (
              <span className="hd-card-sub hd-card-clip">{sub}</span>
            ) : null}
          </span>
          <Bars bars={dayBars(stats)} />
        </span>
      </button>
    </Card>
  );
}

function Toggle({
  range,
  onRange,
}: {
  range: StatsRange;
  onRange: (r: StatsRange) => void;
}) {
  return (
    <span className="fin-seg" role="radiogroup" aria-label="Range">
      {(
        [
          ["week", "Week"],
          ["month", "Month"],
        ] as const
      ).map(([id, label]) => (
        <button
          key={id}
          type="button"
          role="radio"
          aria-checked={range === id}
          className="fin-seg-btn"
          data-st-range={id}
          onClick={() => onRange(id)}
        >
          {label}
        </button>
      ))}
    </span>
  );
}

export interface StatsBodyProps {
  stats: Stats | undefined;
  range: StatsRange;
  loading: boolean;
  onRange: (r: StatsRange) => void;
}

/** The full view's content. */
export function StatsBody({ stats, range, loading, onRange }: StatsBodyProps) {
  const maxProject = Math.max(
    1,
    ...(stats?.byProject.map((p) => p.done) ?? [])
  );
  return (
    <div className="st-full" data-st-full="">
      <div className="st-full-head">
        <Toggle range={range} onRange={onRange} />
        {stats ? (
          <span className="hd-meta-t hd-num">
            {stats.total} done
            {stats.focusMinutes != null
              ? ` · ${dur(stats.focusMinutes)} focus`
              : ""}
          </span>
        ) : null}
      </div>
      {!stats ? (
        <p className="st-note">{loading ? "Loading…" : "No data yet."}</p>
      ) : (
        <>
          <section className="st-sec" data-st-days="">
            <h3 className="fin-shut-h">Done per day</h3>
            <Bars bars={dayBars(stats)} label={range === "week"} />
          </section>

          {stats.byProject.length ? (
            <section className="st-sec" data-st-projects="">
              <h3 className="fin-shut-h">By project</h3>
              <ul className="st-projects">
                {stats.byProject.map((p) => (
                  <li key={p.projectId ?? "none"} className="st-project">
                    <span className="st-project-name">{p.name}</span>
                    <span className="st-project-track" aria-hidden="true">
                      <span
                        className="st-project-fill"
                        style={{ width: `${(p.done / maxProject) * 100}%` }}
                      />
                    </span>
                    <span className="hd-meta-t hd-num">{p.done}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section className="st-sec" data-st-weekday="">
            <h3 className="fin-shut-h">
              {stats.bestWeekday == null
                ? "Best weekday"
                : `Best weekday · ${weekdayLong(stats.bestWeekday)}`}
            </h3>
            <Bars bars={weekdayBars(stats)} label />
          </section>

          {stats.focusMinutes != null ? (
            <section className="st-sec" data-st-focus="">
              <h3 className="fin-shut-h">Focus</h3>
              <p className="st-focus">
                {dur(stats.focusMinutes)} in {stats.focusSessions}{" "}
                {stats.focusSessions === 1 ? "session" : "sessions"}
              </p>
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}

/** The desktop dialog or the phone sheet around the same body. */
export function StatsSheet({
  open,
  phone,
  onClose,
  ...body
}: StatsBodyProps & { open: boolean; phone?: boolean; onClose: () => void }) {
  const container = useV3PortalContainer();
  const [alive, setAlive] = useState(false);
  if (open && !alive) setAlive(true);
  if (phone) {
    if (!alive && !open) return null;
    return (
      <PkSheet
        open={open}
        onClose={onClose}
        onShut={() => setAlive(false)}
        title="Stats"
      >
        <StatsBody {...body} />
      </PkSheet>
    );
  }
  if (!open || !container) return null;
  return (
    <Dialog.Root
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <Dialog.Portal container={container}>
        <Dialog.Overlay className="tdc-scrim">
          <Dialog.Content
            className="tdc-card fin-dialog"
            aria-describedby={undefined}
          >
            <Dialog.Title className="fin-dialog-title">Stats</Dialog.Title>
            <StatsBody {...body} />
          </Dialog.Content>
        </Dialog.Overlay>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
