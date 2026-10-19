"use client";

import type { StarterScreen } from "@/lib/starter-game";

import { AiOrb } from "../orb/AiOrb";
import { ProBadge } from "../paywall/Pro";
import { SgIcon } from "./SgIcon";
import { SG_ENTRY } from "./model";

/**
 * THE ENTRY CARD (sg-game.jsx `SgEntry`). Sits in place of the empty state on
 * Home, Calendar and Tasks while a person has fewer than five open tasks. The
 * same card on each; only the title, the copy and the preview's bar change.
 * "Not now" hides it for 7 days, "Don't show again" for good. On Free the card
 * wears PRO and its button opens the plans.
 */
export function SgEntry({
  entry,
  locked,
  upgradeLabel,
  onStart,
  onUpgrade,
  onHide,
}: {
  entry: StarterScreen;
  /** Free: PRO on the title, and the button opens the plans. */
  locked?: boolean;
  /** The locked button's words. */
  upgradeLabel?: string;
  onStart: () => void;
  onUpgrade: () => void;
  onHide: (how: "7d" | "never") => void;
}) {
  const e = SG_ENTRY[entry];
  return (
    <div className="sg-entry-c" data-sg-entry={entry}>
      <section
        className={`sg-entry${locked ? " is-locked" : ""}`}
        aria-label={e.title}
      >
        <div>
          <div className="sg-entry-k">
            <span className="sg-orb">
              <AiOrb size={16} tile={false} />
            </span>
            Get started with Needt
          </div>
          <h3>
            {e.title}
            {locked ? <ProBadge /> : null}
          </h3>
          <p>{e.p}</p>
          <div className="sg-entry-acts">
            {locked ? (
              <button
                type="button"
                className="sg-btn is-primary"
                data-sg="upgrade"
                onClick={onUpgrade}
              >
                {upgradeLabel ?? "Try with Pro"}
              </button>
            ) : (
              <button
                type="button"
                className="sg-btn is-primary"
                data-sg="start"
                onClick={onStart}
              >
                Start · 1 min <SgIcon n="arrow" />
              </button>
            )}
            <button
              type="button"
              className="sg-btn is-text"
              data-sg="not-now"
              onClick={() => onHide("7d")}
            >
              Not now
            </button>
            <button
              type="button"
              className="sg-btn is-text sg-entry-menu"
              data-sg="never"
              onClick={() => onHide("never")}
            >
              Don’t show again
            </button>
          </div>
        </div>
        <div className="sg-prev" aria-hidden="true">
          <div className="sg-prev-grid">
            {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
              <span
                key={i}
                className={`sg-prev-t${i === 0 || i === 2 || i === 5 || i === 7 ? " go" : ""}`}
                style={{ "--i": i } as React.CSSProperties}
              />
            ))}
          </div>
          <div className="sg-prev-bar">{e.bar}</div>
        </div>
      </section>
    </div>
  );
}
