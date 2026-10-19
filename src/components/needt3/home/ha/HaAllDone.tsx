"use client";

import { useState } from "react";

import { HaG, HaI } from "./ui";

export interface HaPull {
  id: string;
  title: string;
  /** "Tomorrow · 45 min" */
  when: string;
}

/**
 * 4 - all done for today: the counts, End day, See tomorrow, and "Pull
 * something in": 2-3 tasks that fit the free time, each moved to Today with
 * one tap (it leaves the list). When something is still open that Home lists
 * (overdue, Inbox) the title says the tasks are done, not the day.
 */
export function HaAllDone({
  title = "All done for today",
  meta,
  free,
  pull,
  onEndDay,
  onSeeTomorrow,
  onUndo,
  onPull,
}: {
  title?: string;
  /** "14 of 14 · 5 h 10 focused" */
  meta: string;
  /** "2 h 50": the free time the pulled tasks fit in. */
  free?: string;
  pull: readonly HaPull[];
  onEndDay?: () => void;
  /** Only when there is something tomorrow to look at. */
  onSeeTomorrow?: () => void;
  onUndo?: () => void;
  onPull?: (id: string) => void;
}) {
  const [gone, setGone] = useState<Record<string, boolean>>({});
  const items = pull.filter((p) => !gone[p.id]);
  return (
    <div className="ha-card ha-done" data-ha-alldone="">
      <div className="ha-done-head">
        <span className="ha-done-sky" aria-hidden="true">
          <HaG name="spark" size={18} />
        </span>
        <div>
          <h2 className="ha-done-t">{title}</h2>
          <span className="ha-meta">{meta}</span>
        </div>
      </div>
      <div className="ha-done-acts">
        <button
          type="button"
          className="ha-btn is-primary is-lg"
          data-ha="end-day"
          onClick={onEndDay}
        >
          <HaI n="moon" />
          End day
        </button>
        {onSeeTomorrow ? (
          <button
            type="button"
            className="ha-btn is-lg"
            data-ha="see-tomorrow"
            onClick={onSeeTomorrow}
          >
            See tomorrow
          </button>
        ) : null}
        {onUndo ? (
          <button
            type="button"
            className="ha-btn is-text"
            data-ha="undo-last"
            onClick={onUndo}
          >
            Undo last
          </button>
        ) : null}
      </div>
      {items.length ? (
        <div className="ha-pull" data-ha-pull="">
          <div className="ha-pull-h">
            <b>Pull something in</b>
            {free ? <span className="ha-meta">{free} free</span> : null}
          </div>
          {items.map((s) => (
            <div key={s.id} className="ha-sug" data-ha-pick={s.id}>
              <div className="ha-sug-t">
                <b>{s.title}</b>
                <span>{s.when}</span>
              </div>
              <button
                type="button"
                className="ha-chip-act"
                data-ha="pull"
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
