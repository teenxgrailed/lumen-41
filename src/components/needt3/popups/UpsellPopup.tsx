"use client";

import type { CSSProperties } from "react";

import { Glyph, type GlyphName } from "../glyphs/Glyph";
import { PopupShell, rise } from "./PopupShell";

export interface UpsellCard {
  key: string;
  glyph: GlyphName;
  title: string;
  body: string;
  /** The button under the card. */
  cta: string;
  onSelect: () => void;
  /**
   * The card to lean toward: a hint of its colour and the light button.
   * One card at most; the other is outlined.
   */
  primary?: boolean;
  /** The colour of the primary card's tint. Defaults to the blue object hue. */
  hue?: string;
}

export interface UpsellPopupProps {
  open: boolean;
  onClose: () => void;
  /** "You've reached the Free limit", "Your trial ends in 3 days". */
  title: string;
  /** What happened and what the two ways out are. One or two sentences. */
  body: string;
  /**
   * Two cards, or one when the second way out is closed (Lifetime sold out).
   * Free and trial accounts only: the caller decides who sees it.
   */
  cards: readonly [UpsellCard] | readonly [UpsellCard, UpsellCard];
  /** The quiet way out under the cards ("Not now"). Omit for none. */
  dismissLabel?: string;
}

/**
 * Limit reached, or the trial is about to end: two ways forward, each a card
 * with a mark, two lines and a button. Presentational only; the cards come
 * from the plan (`limitCards` / `trialCards` in ./copy are the stock ones).
 */
export function UpsellPopup({
  open,
  onClose,
  title,
  body,
  cards,
  dismissLabel,
}: UpsellPopupProps) {
  return (
    <PopupShell
      open={open}
      onClose={onClose}
      title={title}
      size="wide"
      name="upsell"
      actions={
        dismissLabel ? (
          <button
            type="button"
            className="pp-btn pp-btn-quiet nx-press"
            onClick={onClose}
          >
            {dismissLabel}
          </button>
        ) : null
      }
    >
      <h2 className="pp-title px-display pp-rise" style={rise(0)}>
        {title}
      </h2>
      <p className="pp-text pp-rise" style={rise(1)}>
        {body}
      </p>
      <div className="pp-opts" data-pp-count={cards.length}>
        {cards.map((card, i) => (
          <section
            key={card.key}
            className="pp-opt pp-rise"
            style={
              {
                ...rise(2 + i),
                ...(card.primary
                  ? { "--pp-hue": card.hue ?? "var(--hue-blue)" }
                  : null),
              } as CSSProperties
            }
            data-pp-primary={card.primary ? "" : undefined}
          >
            {card.primary ? <span className="pp-opt-grain" /> : null}
            <Glyph name={card.glyph} size={26} className="pp-opt-mark" />
            <h3 className="pp-opt-title">{card.title}</h3>
            <p className="pp-opt-text">{card.body}</p>
            <button
              type="button"
              className={
                "pp-btn nx-press " +
                (card.primary ? "pp-btn-primary" : "pp-btn-line")
              }
              onClick={card.onSelect}
            >
              {card.cta}
            </button>
          </section>
        ))}
      </div>
    </PopupShell>
  );
}
