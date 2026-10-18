"use client";

import { PkButton } from "../phone/kit";
import { dur } from "./derive";
import { type FinishPick, finishHeadline, restLine } from "./finish";

/**
 * What a finished day offers, on the desktop Home and the phone Home. Both
 * parts hide themselves: no picks, no list; and the card says "All done" only
 * when nothing Home still lists is open (`finishHeadline`).
 */

interface ActionProps {
  phone?: boolean;
}

/** One small button: the desktop's text button, the phone's chip. */
function Act({
  phone,
  children,
  onClick,
  ...rest
}: ActionProps & {
  children: string;
  onClick: () => void;
  "data-fin"?: string;
  disabled?: boolean;
}) {
  return phone ? (
    <PkButton kind="chip" onClick={onClick} {...rest}>
      {children}
    </PkButton>
  ) : (
    <button
      type="button"
      className="nx-btn nx-btn-sm nx-btn-secondary"
      onClick={onClick}
      {...rest}
    >
      {children}
    </button>
  );
}

/** The best next tasks, one line each with a one-tap "Do today". */
export function FinishPicks({
  picks,
  onDoToday,
  phone,
}: ActionProps & {
  picks: readonly FinishPick[];
  onDoToday: (pick: FinishPick) => void;
}) {
  if (!picks.length) return null;
  return (
    <ul className="fin-picks" data-fin-picks="" aria-label="Good next tasks">
      {picks.map((p) => (
        <li key={p.task.id} className="fin-pick" data-fin-pick={p.task.id}>
          <span className="fin-pick-text">
            <span className="fin-pick-title">{p.task.title}</span>
            <span className="fin-pick-meta">{p.meta}</span>
          </span>
          <Act phone={phone} data-fin="do-today" onClick={() => onDoToday(p)}>
            Do today
          </Act>
        </li>
      ))}
    </ul>
  );
}

/** The desktop card: the headline, the picks, End day. */
export function FinishCard({
  count,
  mins,
  habits,
  open,
  picks,
  onDoToday,
  onEndDay,
  onPlan,
  onUndo,
}: {
  count: number;
  mins: number;
  habits: number;
  open: { late: number; inbox: number };
  picks: readonly FinishPick[];
  onDoToday: (pick: FinishPick) => void;
  onEndDay: () => void;
  onPlan: () => void;
  onUndo: () => void;
}) {
  const head = finishHeadline(open);
  const rest = restLine(open);
  return (
    <section
      className="nx-sheet hd-closed fin-card"
      data-hd-closed=""
      data-fin-card=""
      data-fin-all-done={head.rest ? "false" : "true"}
    >
      <div className="fin-head">
        <div className="fin-head-text">
          <h2 className="fin-title">{head.title}</h2>
          <p className="fin-line">
            {count} {count === 1 ? "task" : "tasks"} · {dur(mins) || "0 min"} of
            work · {habits} {habits === 1 ? "habit" : "habits"} kept
            {rest ? ` · ${rest}` : ""}
          </p>
        </div>
        <div className="fin-acts">
          <button type="button" className="nx-btn nx-btn-text" onClick={onUndo}>
            Undo last
          </button>
          <button type="button" className="nx-btn nx-btn-text" onClick={onPlan}>
            See tomorrow
          </button>
          <button
            type="button"
            className="nx-btn nx-btn-secondary"
            data-fin="end-day"
            onClick={onEndDay}
          >
            End day
          </button>
        </div>
      </div>
      <FinishPicks picks={picks} onDoToday={onDoToday} />
    </section>
  );
}
