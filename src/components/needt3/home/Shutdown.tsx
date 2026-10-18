"use client";

import { useState } from "react";

import * as Dialog from "@radix-ui/react-dialog";

import { useV3PortalContainer } from "../ctx/PortalScope";
import { PkSheet } from "../phone/kit";
import type { LeftoverTarget } from "./finish";

/**
 * END DAY. A short shutdown: what got done, what is left over and where it
 * goes (tomorrow, a date, the Inbox), and a note for tomorrow. One body for
 * both faces; the desktop wraps it in a dialog, the phone in its sheet.
 */

export interface ShutdownRow {
  id: string;
  title: string;
  /** "Overdue since 3 Sep", "Today", … */
  meta: string;
}

export interface ShutdownProps {
  done: readonly { id: string; title: string }[];
  leftovers: readonly ShutdownRow[];
  choices: Readonly<Record<string, LeftoverTarget>>;
  date: string;
  /** The first day a picked date may be. */
  minDate: string;
  note: string;
  busy: boolean;
  onChoice: (id: string, target: LeftoverTarget) => void;
  onDate: (date: string) => void;
  onNote: (text: string) => void;
  onSubmit: () => void;
  onClose: () => void;
}

const DONE_SHOWN = 4;
const TARGETS: readonly [LeftoverTarget, string][] = [
  ["tomorrow", "Tomorrow"],
  ["date", "Date"],
  ["inbox", "Inbox"],
];

export function ShutdownBody(p: ShutdownProps) {
  const needsDate = p.leftovers.some((r) => p.choices[r.id] === "date");
  return (
    <div className="fin-shut" data-fin-shutdown="">
      {p.done.length ? (
        <section className="fin-shut-sec" data-fin-done="">
          <h3 className="fin-shut-h">Done today · {p.done.length}</h3>
          <ul className="fin-shut-list">
            {p.done.slice(0, DONE_SHOWN).map((t) => (
              <li key={t.id} className="fin-shut-done">
                {t.title}
              </li>
            ))}
            {p.done.length > DONE_SHOWN ? (
              <li className="fin-shut-more">
                +{p.done.length - DONE_SHOWN} more
              </li>
            ) : null}
          </ul>
        </section>
      ) : null}

      {p.leftovers.length ? (
        <section className="fin-shut-sec" data-fin-left="">
          <h3 className="fin-shut-h">Left over · {p.leftovers.length}</h3>
          <ul className="fin-shut-list">
            {p.leftovers.map((r) => (
              <li key={r.id} className="fin-shut-row" data-fin-left-row={r.id}>
                <span className="fin-shut-text">
                  <span className="fin-shut-title">{r.title}</span>
                  <span className="fin-pick-meta">{r.meta}</span>
                </span>
                <span
                  className="fin-seg"
                  role="radiogroup"
                  aria-label={`Move ${r.title}`}
                >
                  {TARGETS.map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      role="radio"
                      aria-checked={(p.choices[r.id] ?? "tomorrow") === id}
                      className="fin-seg-btn"
                      data-fin-to={id}
                      onClick={() => p.onChoice(r.id, id)}
                    >
                      {label}
                    </button>
                  ))}
                </span>
              </li>
            ))}
          </ul>
          {needsDate ? (
            <label className="fin-shut-date">
              <span>Date</span>
              <input
                type="date"
                className="fin-field"
                min={p.minDate}
                value={p.date}
                onChange={(e) => p.onDate(e.target.value)}
              />
            </label>
          ) : null}
        </section>
      ) : null}

      <section className="fin-shut-sec">
        <label className="fin-shut-h" htmlFor="fin-note">
          A note for tomorrow
        </label>
        <textarea
          id="fin-note"
          className="fin-note"
          rows={3}
          value={p.note}
          placeholder="Where to pick up, what to remember"
          onChange={(e) => p.onNote(e.target.value)}
        />
      </section>

      <div className="fin-shut-acts">
        <button
          type="button"
          className="nx-btn nx-btn-text"
          onClick={p.onClose}
        >
          Cancel
        </button>
        <button
          type="button"
          className="nx-btn nx-btn-secondary"
          data-fin="confirm-end-day"
          disabled={p.busy}
          onClick={p.onSubmit}
        >
          End day
        </button>
      </div>
    </div>
  );
}

/** The desktop dialog or the phone sheet around the same body. */
export function ShutdownSheet({
  open,
  phone,
  ...body
}: ShutdownProps & { open: boolean; phone?: boolean }) {
  const container = useV3PortalContainer();
  // The phone's sheet stays mounted only while it is open or sliding away,
  // so a closed Home carries none of its body.
  const [alive, setAlive] = useState(false);
  if (open && !alive) setAlive(true);
  if (phone) {
    if (!alive && !open) return null;
    return (
      <PkSheet
        open={open}
        onClose={body.onClose}
        onShut={() => setAlive(false)}
        title="End day"
      >
        <ShutdownBody {...body} />
      </PkSheet>
    );
  }
  if (!open || !container) return null;
  return (
    <Dialog.Root
      open
      onOpenChange={(next) => {
        if (!next) body.onClose();
      }}
    >
      <Dialog.Portal container={container}>
        <Dialog.Overlay className="tdc-scrim">
          <Dialog.Content
            className="tdc-card fin-dialog"
            aria-describedby={undefined}
          >
            <Dialog.Title className="fin-dialog-title">End day</Dialog.Title>
            <ShutdownBody {...body} />
          </Dialog.Content>
        </Dialog.Overlay>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
