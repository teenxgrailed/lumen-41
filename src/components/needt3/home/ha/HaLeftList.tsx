"use client";

/** Where a left-over task goes: the day after, a picked date, or the Inbox. */
export type HaTarget = "tomorrow" | "date" | "inbox";

export interface HaLeft {
  id: string;
  title: string;
  /** "Overdue since 3 Sep", "Today · 30 min" */
  meta: string;
}

const TARGETS: readonly HaTarget[] = ["tomorrow", "date", "inbox"];

/**
 * The "Still open / Left over" rows of the End day and weekly review sheets:
 * each task with Tomorrow (or Monday) / Pick a date / Inbox, and one date field
 * while any task is set to a picked date.
 */
export function HaLeftList({
  leftovers,
  moves,
  labels,
  date,
  minDate,
  onMove,
  onDate,
}: {
  leftovers: readonly HaLeft[];
  moves: Readonly<Record<string, HaTarget>>;
  /** The first target's word: "Tomorrow" on a weekday, "Monday" on a Sunday. */
  labels?: { tomorrow: string };
  date: string;
  minDate: string;
  onMove: (id: string, to: HaTarget) => void;
  onDate: (date: string) => void;
}) {
  if (!leftovers.length) return null;
  const word: Record<HaTarget, string> = {
    tomorrow: labels?.tomorrow ?? "Tomorrow",
    date: "Pick a date",
    inbox: "Inbox",
  };
  const needsDate = leftovers.some((l) => moves[l.id] === "date");
  return (
    <>
      {leftovers.map((l) => (
        <div key={l.id} className="ha-left" data-ha-left={l.id}>
          <div className="ha-left-t">
            <b>{l.title}</b>
            <span className="ha-meta">{l.meta}</span>
          </div>
          <div className="ha-seg" role="group" aria-label={`Move ${l.title}`}>
            {TARGETS.map((o) => (
              <button
                key={o}
                type="button"
                data-ha-to={o}
                aria-pressed={(moves[l.id] ?? "tomorrow") === o}
                onClick={() => onMove(l.id, o)}
              >
                {word[o]}
              </button>
            ))}
          </div>
        </div>
      ))}
      {needsDate ? (
        <label className="ha-date">
          <span>Date</span>
          <input
            type="date"
            className="ha-field"
            min={minDate}
            value={date}
            onChange={(e) => onDate(e.target.value)}
          />
        </label>
      ) : null}
    </>
  );
}
