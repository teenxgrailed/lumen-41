"use client";

import type { ReactNode } from "react";

import { Glyph, type GlyphName } from "../glyphs/Glyph";
import { PopupArt, type PopupArtProps } from "./PopupArt";
import { PopupShell, rise } from "./PopupShell";

/** What the announcement is, in the logic chat's words (update, tip, event, offer). */
export type AnnouncementKind = "update" | "tip" | "event" | "offer";

export const ANNOUNCEMENT_BADGE: Record<AnnouncementKind, string> = {
  update: "New",
  tip: "Tip",
  event: "Event",
  offer: "Offer",
};

/** One colour each, so a tip never looks like an offer. All are object hues. */
export const ANNOUNCEMENT_HUE: Record<AnnouncementKind, string> = {
  update: "var(--hue-green)",
  tip: "var(--hue-blue)",
  event: "var(--hue-violet)",
  offer: "var(--hue-orange)",
};

export interface WhatsNewItem {
  glyph: GlyphName;
  text: string;
}

export interface WhatsNewPopupProps {
  open: boolean;
  /** The X, Escape, the scrim and a drag down on the phone. */
  onClose: () => void;
  kind?: AnnouncementKind;
  /** Overrides the kind's badge ("New"). */
  badge?: string;
  title: string;
  /** One or two sentences under the headline. */
  body?: string;
  /** A quiet link after the body ("Learn more"). */
  learnMore?: { label: string; href: string };
  /** Up to three lines, each with a mark. */
  items?: readonly WhatsNewItem[];
  /** The main action, the light button ("Try Plan my day"). */
  primary: { label: string; onClick: () => void };
  /** The quiet button ("Later"). Calls `onClose` unless `onSecondary` is given. */
  secondaryLabel?: string;
  onSecondary?: () => void;
  /** The picture: our own texture. Defaults to the kind's hue. */
  art?: Partial<PopupArtProps>;
  /** Replaces the texture altogether (a real screenshot, say). */
  artNode?: ReactNode;
}

/**
 * The update popup: a badge, a serif headline, a line, up to three marked
 * items, a light button and a quiet one, and the texture beside it. On a
 * phone the same content is a bottom sheet with the texture as a band.
 */
export function WhatsNewPopup({
  open,
  onClose,
  kind = "update",
  badge,
  title,
  body,
  learnMore,
  items = [],
  primary,
  secondaryLabel = "Later",
  onSecondary,
  art,
  artNode,
}: WhatsNewPopupProps) {
  const picture = artNode ?? (
    <PopupArt hue={art?.hue ?? ANNOUNCEMENT_HUE[kind]} {...art} />
  );
  return (
    <PopupShell
      open={open}
      onClose={onClose}
      title={title}
      size="split"
      name="whats-new"
      art={picture}
      actions={
        <>
          <button
            type="button"
            className="pp-btn pp-btn-primary nx-press"
            onClick={primary.onClick}
          >
            {primary.label}
          </button>
          <button
            type="button"
            className="pp-btn pp-btn-quiet nx-press"
            onClick={onSecondary ?? onClose}
          >
            {secondaryLabel}
          </button>
        </>
      }
    >
      <span className="pp-badge pp-rise" style={rise(0)} data-pp-kind={kind}>
        {badge ?? ANNOUNCEMENT_BADGE[kind]}
      </span>
      <h2 className="pp-title px-display pp-rise" style={rise(1)}>
        {title}
      </h2>
      {body || learnMore ? (
        <p className="pp-text pp-rise" style={rise(2)}>
          {body}
          {learnMore ? (
            <>
              {body ? " " : null}
              <a
                className="pp-link"
                href={learnMore.href}
                target="_blank"
                rel="noopener noreferrer"
              >
                {learnMore.label}
              </a>
            </>
          ) : null}
        </p>
      ) : null}
      {items.length > 0 ? (
        <ul className="pp-items">
          {items.slice(0, 3).map((item, i) => (
            <li key={item.text} className="pp-item pp-rise" style={rise(3 + i)}>
              <Glyph name={item.glyph} size={18} className="pp-item-mark" />
              <span>{item.text}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </PopupShell>
  );
}
