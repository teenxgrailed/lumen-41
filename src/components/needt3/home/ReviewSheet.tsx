"use client";

import { useState } from "react";

import * as Dialog from "@radix-ui/react-dialog";

import { useV3PortalContainer } from "../ctx/PortalScope";
import { PkSheet } from "../phone/kit";
import { Act, type ActionProps } from "./Act";
import type { ShutdownRow } from "./Shutdown";
import type { LeftoverTarget } from "./finish";
import { REVIEW_FOCUSES } from "./review";

/**
 * THE WEEKLY REVIEW. A card on Sundays ("Review your week") and the short
 * guided sheet behind it: the week's wins, what is left over and where it
 * goes, and three focuses for next week. Saved as a page.
 */

export function ReviewCard({
  onStart,
  onLater,
  phone,
}: ActionProps & { onStart: () => void; onLater: () => void }) {
  return (
    <section className="nd-card" data-rv-card="" aria-label="Weekly review">
      <p className="nd-text">
        It&apos;s Sunday. Take two minutes to review the week.
      </p>
      <Act phone={phone} data-fin="review-start" onClick={onStart}>
        Review
      </Act>
      <button
        type="button"
        className="br-dismiss"
        data-rv="later"
        aria-label="Not now"
        onClick={onLater}
      >
        &times;
      </button>
    </section>
  );
}

export interface ReviewProps {
  wins: readonly string[];
  leftovers: readonly ShutdownRow[];
  choices: Readonly<Record<string, LeftoverTarget>>;
  date: string;
  minDate: string;
  focuses: readonly string[];
  busy: boolean;
  onChoice: (id: string, target: LeftoverTarget) => void;
  onDate: (date: string) => void;
  onFocus: (index: number, text: string) => void;
  onSubmit: () => void;
  onClose: () => void;
}

const TARGETS: readonly [LeftoverTarget, string][] = [
  ["tomorrow", "Monday"],
  ["date", "Date"],
  ["inbox", "Inbox"],
];

export function ReviewBody(p: ReviewProps) {
  const needsDate = p.leftovers.some((r) => p.choices[r.id] === "date");
  return (
    <div className="fin-shut" data-rv-body="">
      <section className="fin-shut-sec" data-rv-wins="">
        <h3 className="fin-shut-h">This week</h3>
        {p.wins.length ? (
          <ul className="fin-shut-list">
            {p.wins.map((w) => (
              <li key={w} className="fin-shut-done">
                {w}
              </li>
            ))}
          </ul>
        ) : (
          <p className="st-note">A quiet week.</p>
        )}
      </section>

      {p.leftovers.length ? (
        <section className="fin-shut-sec" data-rv-left="">
          <h3 className="fin-shut-h">Left over · {p.leftovers.length}</h3>
          <ul className="fin-shut-list">
            {p.leftovers.map((r) => (
              <li key={r.id} className="fin-shut-row" data-rv-left-row={r.id}>
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
                      data-rv-to={id}
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

      <section className="fin-shut-sec" data-rv-focus="">
        <h3 className="fin-shut-h">Three focuses for next week</h3>
        {Array.from({ length: REVIEW_FOCUSES }, (_, i) => (
          <input
            key={i}
            type="text"
            className="city-field rv-focus"
            aria-label={`Focus ${i + 1}`}
            placeholder={`Focus ${i + 1}`}
            maxLength={120}
            value={p.focuses[i] ?? ""}
            onChange={(e) => p.onFocus(i, e.target.value)}
          />
        ))}
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
          data-fin="review-save"
          disabled={p.busy}
          onClick={p.onSubmit}
        >
          Save review
        </button>
      </div>
    </div>
  );
}

/** The desktop dialog or the phone sheet around the same body. */
export function ReviewSheet({
  open,
  phone,
  ...body
}: ReviewProps & { open: boolean; phone?: boolean }) {
  const container = useV3PortalContainer();
  const [alive, setAlive] = useState(false);
  if (open && !alive) setAlive(true);
  if (phone) {
    if (!alive && !open) return null;
    return (
      <PkSheet
        open={open}
        onClose={body.onClose}
        onShut={() => setAlive(false)}
        title="Weekly review"
      >
        <ReviewBody {...body} />
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
            <Dialog.Title className="fin-dialog-title">
              Weekly review
            </Dialog.Title>
            <ReviewBody {...body} />
          </Dialog.Content>
        </Dialog.Overlay>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
