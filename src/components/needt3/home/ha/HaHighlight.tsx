"use client";

import type { ReactNode } from "react";

import { AiOrb } from "@/components/needt3/orb/AiOrb";
import { ProBadge } from "@/components/needt3/paywall/Pro";
import { PkSkyPlate } from "@/components/needt3/phone/kit";

import { HaI, haBreak, haCx } from "./ui";

/** What the card says about one task. */
export interface HaCard {
  id: string;
  title: string;
  /** "11:00" when the task has an hour. */
  time?: string;
  /** "1 h". */
  dur?: string;
  /** The line under the title (why, or the project). */
  sub: string;
}

export type HaHighlightState = "suggest" | "set" | "nextup";

/**
 * 3 - the daily Highlight, which takes the place of Next up.
 * suggest: the agent's pick with its reason, "Make this your highlight?" Yes /
 * Another (dots show how many); set: the one thing for today with Start focus
 * and Done; nextup: no highlight, the plain Next up. Free: Yes carries PRO and
 * opens the paywall. On the phone the card is the live sky plate, on desktop
 * the white Next up card with a mark ring when set.
 */
export function HaHighlight({
  phone,
  state,
  card,
  index = 0,
  count = 1,
  locked,
  late,
  onYes,
  onAnother,
  onUpgrade,
  onUnset,
  onSkip,
  onStart,
  onDone,
  onOpen,
}: {
  phone?: boolean;
  state: HaHighlightState;
  card: HaCard;
  /** suggest: which of `count` suggestions this is. */
  index?: number;
  count?: number;
  /** suggest, Free: Yes opens the paywall. */
  locked?: boolean;
  /** nextup: the task is overdue (the one place red is a word, never a fill). */
  late?: boolean;
  onYes?: () => void;
  onAnother?: () => void;
  onUpgrade?: () => void;
  /** set: take the highlight off (the card falls back to Next up). */
  onUnset?: () => void;
  /** nextup: show another task. */
  onSkip?: () => void;
  onStart?: () => void;
  onDone?: () => void;
  onOpen?: () => void;
}) {
  const kicker =
    state === "set" ? (
      <span className="ha-kicker">
        <span className="ha-hl-star">
          <HaI n="star" s={13} />
        </span>
        Highlight
      </span>
    ) : state === "nextup" ? (
      <span className={haCx("ha-kicker", late && "is-late")}>
        {late ? "Overdue" : "Next up"}
      </span>
    ) : (
      <span className="ha-kicker">
        <AiOrb size={12} tile={false} />
        Suggested highlight
      </span>
    );
  const body: ReactNode = (
    <div className="ha-hl-in" key={state + card.id + index} data-ha-hl={state}>
      <div className="ha-hl-top">
        {kicker}
        {card.time ? <span className="ha-hl-time">{card.time}</span> : null}
        {card.dur ? <span className="ha-hl-when">{card.dur}</span> : null}
        {state === "set" && onUnset ? (
          <button
            type="button"
            className="ha-btn is-text ha-hl-skip"
            onClick={onUnset}
          >
            Unset
          </button>
        ) : null}
        {state === "nextup" && onSkip ? (
          <button
            type="button"
            className="ha-btn is-text ha-hl-skip"
            data-ha-skip=""
            onClick={onSkip}
          >
            Skip
          </button>
        ) : null}
      </div>
      <h2
        className={haCx("ha-hl-title", state === "suggest" && "ha-hl-swap")}
        title={card.title}
      >
        {onOpen && state !== "suggest" ? (
          <button type="button" className="ha-hl-open" onClick={onOpen}>
            <span className="ha-hl-tx">{haBreak(card.title)}</span>
          </button>
        ) : (
          <span className="ha-hl-tx">{haBreak(card.title)}</span>
        )}
      </h2>
      <p className="ha-hl-sub">{card.sub}</p>
      {state === "suggest" ? (
        <div className="ha-hl-ask">
          <span>Make this your highlight?</span>
          {locked ? (
            <button
              type="button"
              className="ha-btn is-primary"
              data-ha-yes="locked"
              onClick={onUpgrade}
            >
              Yes <ProBadge size="sm" />
            </button>
          ) : (
            <button
              type="button"
              className="ha-btn is-primary"
              data-ha-yes=""
              onClick={onYes}
            >
              Yes
            </button>
          )}
          {count > 1 ? (
            <button
              type="button"
              className="ha-btn"
              data-ha-another=""
              onClick={onAnother}
              aria-label={`Another suggestion, ${index + 1} of ${count}`}
            >
              Another
            </button>
          ) : null}
          {count > 1 ? (
            <span className="ha-hl-dots" aria-hidden="true">
              {Array.from({ length: count }, (_, k) => (
                <i key={k} className={k === index ? "on" : ""} />
              ))}
            </span>
          ) : null}
        </div>
      ) : (
        <div className="ha-hl-acts">
          <button
            type="button"
            className="ha-btn is-primary is-lg"
            data-ha-start=""
            onClick={onStart}
          >
            <HaI n="target" />
            Start focus
          </button>
          <button
            type="button"
            className="ha-btn is-lg"
            data-ha-done=""
            onClick={onDone}
          >
            <HaI n="check" />
            Done
          </button>
        </div>
      )}
    </div>
  );
  const label =
    state === "set"
      ? "Today’s highlight"
      : state === "nextup"
        ? "Next up"
        : "Suggested highlight";
  return phone ? (
    <PkSkyPlate
      className={haCx("ha-hl", state === "set" && "is-highlight")}
      radius={26}
      data-ha-card={card.id}
      aria-label={label}
    >
      {body}
    </PkSkyPlate>
  ) : (
    <section
      className={haCx("ha-hl", state === "set" && "is-highlight")}
      data-ha-card={card.id}
      aria-label={label}
    >
      {body}
    </section>
  );
}
