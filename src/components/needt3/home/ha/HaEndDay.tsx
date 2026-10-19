"use client";

import { useState } from "react";

import { type HaLeft, HaLeftList, type HaTarget } from "./HaLeftList";
import { HaI } from "./ui";

/**
 * 5 - the End day sheet: what was done (three lines and "+ N more"), what is
 * still open with Tomorrow / Pick a date / Inbox per task, a note for tomorrow
 * (it shows in tomorrow's brief) and one primary, "Close the day".
 */
export function HaEndDay({
  title,
  summary,
  done,
  leftovers,
  moves,
  date,
  minDate,
  note,
  busy,
  onMove,
  onDate,
  onNote,
  onSubmit,
  onClose,
}: {
  /** "End of Monday" */
  title: string;
  /** "6 done · 2 left" */
  summary: string;
  done: readonly string[];
  leftovers: readonly HaLeft[];
  moves: Readonly<Record<string, HaTarget>>;
  date: string;
  minDate: string;
  note: string;
  busy?: boolean;
  onMove: (id: string, to: HaTarget) => void;
  onDate: (date: string) => void;
  onNote: (text: string) => void;
  onSubmit: () => void;
  onClose: () => void;
}) {
  const [all, setAll] = useState(false);
  const shown = all ? done : done.slice(0, 3);
  return (
    <div
      className="ha-sheet"
      role="dialog"
      aria-label="End day"
      data-ha-endday=""
    >
      <div className="ha-grab" />
      <div className="ha-sheet-h">
        <div>
          <h3>{title}</h3>
          <span className="ha-meta">{summary}</span>
        </div>
        <button
          type="button"
          className="ha-x"
          aria-label="Close"
          onClick={onClose}
        >
          <HaI n="x" />
        </button>
      </div>
      {done.length ? (
        <>
          <div className="ha-sec-l">
            Done today <span>{done.length}</span>
          </div>
          {shown.map((t, i) => (
            <div key={`${i}-${t}`} className="ha-doneline">
              <span className="ha-tick">
                <HaI n="check" />
              </span>
              <s>{t}</s>
            </div>
          ))}
          {!all && done.length > 3 ? (
            <button
              type="button"
              className="ha-more"
              onClick={() => setAll(true)}
            >
              + {done.length - 3} more
            </button>
          ) : null}
        </>
      ) : null}
      {leftovers.length ? (
        <>
          <div className="ha-sec-l">
            Still open <span>move them</span>
          </div>
          <HaLeftList
            leftovers={leftovers}
            moves={moves}
            date={date}
            minDate={minDate}
            onMove={onMove}
            onDate={onDate}
          />
        </>
      ) : null}
      <div className="ha-sec-l">Note for tomorrow</div>
      <textarea
        className="ha-note"
        placeholder="What should tomorrow start with?"
        aria-label="A note for tomorrow"
        value={note}
        onChange={(e) => onNote(e.target.value)}
      />
      <div className="ha-sheet-foot">
        <button
          type="button"
          className="ha-btn is-primary is-lg"
          data-ha="close-day"
          disabled={busy}
          onClick={onSubmit}
        >
          Close the day
        </button>
      </div>
    </div>
  );
}
