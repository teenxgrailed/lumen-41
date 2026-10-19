"use client";

import { useState } from "react";

import { HaI } from "./ui";

export type HaMove = "Tomorrow" | "Pick a date" | "Inbox";
const MOVES: readonly HaMove[] = ["Tomorrow", "Pick a date", "Inbox"];

export interface HaLeft {
  id: string;
  title: string;
  dur: string;
}

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
  note,
  busy,
  onMove,
  onNote,
  onSubmit,
  onClose,
}: {
  /** "End of Monday" */
  title: string;
  /** "6 done · 4 h 40 focused · 2 left" */
  summary: string;
  done: readonly string[];
  leftovers: readonly HaLeft[];
  moves: Readonly<Record<string, HaMove>>;
  note: string;
  busy?: boolean;
  onMove: (id: string, to: HaMove) => void;
  onNote: (text: string) => void;
  onSubmit: () => void;
  onClose: () => void;
}) {
  const [all, setAll] = useState(false);
  const shown = all ? done : done.slice(0, 3);
  return (
    <div className="ha-sheet" role="dialog" aria-label="End day">
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
          {leftovers.map((l) => (
            <div key={l.id} className="ha-left">
              <div className="ha-left-t">
                <b>{l.title}</b>
                <span className="ha-meta">{l.dur}</span>
              </div>
              <div
                className="ha-seg"
                role="group"
                aria-label={`Move ${l.title}`}
              >
                {MOVES.map((o) => (
                  <button
                    key={o}
                    type="button"
                    aria-pressed={(moves[l.id] ?? "Tomorrow") === o}
                    onClick={() => onMove(l.id, o)}
                  >
                    {o}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </>
      ) : null}
      <div className="ha-sec-l">Note for tomorrow</div>
      <textarea
        className="ha-note"
        placeholder="What should tomorrow start with?"
        value={note}
        onChange={(e) => onNote(e.target.value)}
      />
      <div className="ha-sheet-foot">
        <button
          type="button"
          className="ha-btn is-primary is-lg"
          disabled={busy}
          onClick={onSubmit}
        >
          Close the day
        </button>
      </div>
    </div>
  );
}
