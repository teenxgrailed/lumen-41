"use client";

import { useEffect, useRef, useState } from "react";

import { HaG, HaI, haCx } from "./ui";

export interface HaPull {
  id: string;
  title: string;
  /** "Tomorrow · 45 min" */
  when: string;
}

/**
 * 4 - all done for today: the counts, End day, See tomorrow, and "Pull
 * something in": 2-3 tasks that fit the free time, each moved to Today with
 * one tap (it leaves the list).
 */
export function HaAllDone({
  count,
  focused,
  free,
  pull,
  onEndDay,
  onSeeTomorrow,
  onPull,
}: {
  count: number;
  /** "5 h 10" */
  focused: string;
  /** "2 h 50" of free time the pulled tasks must fit. */
  free?: string;
  pull: readonly HaPull[];
  onEndDay?: () => void;
  onSeeTomorrow?: () => void;
  onPull?: (id: string) => void;
}) {
  const [gone, setGone] = useState<Record<string, boolean>>({});
  const timer = useRef(0);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const items = pull.filter((p) => !gone[p.id]);
  return (
    <div className="ha-card ha-done" data-ha-alldone="">
      <div className="ha-done-head">
        <span className="ha-done-sky" aria-hidden="true">
          <HaG name="spark" size={18} />
        </span>
        <div>
          <h2 className="ha-done-t">All done for today</h2>
          <span className="ha-meta">
            {count} of {count} · {focused} focused
          </span>
        </div>
      </div>
      <div className="ha-done-acts">
        <button
          type="button"
          className="ha-btn is-primary is-lg"
          onClick={onEndDay}
        >
          <HaI n="moon" />
          End day
        </button>
        <button type="button" className="ha-btn is-lg" onClick={onSeeTomorrow}>
          See tomorrow
        </button>
      </div>
      {items.length ? (
        <div className="ha-pull">
          <div className="ha-pull-h">
            <b>Pull something in</b>
            {free ? <span className="ha-meta">{free} free</span> : null}
          </div>
          {items.map((s) => (
            <div key={s.id} className="ha-sug">
              <div className="ha-sug-t">
                <b>{s.title}</b>
                <span>{s.when}</span>
              </div>
              <button
                type="button"
                className={haCx("ha-chip-act")}
                onClick={() => {
                  onPull?.(s.id);
                  setGone((g) => ({ ...g, [s.id]: true }));
                }}
              >
                <HaI n="arrow" s={13} />
                Today
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
