"use client";

/* Learn's small shared pieces: the topic glyph, the hue a topic wears, the
   chips row and the promo (the Connections promo card, `cn-promo*`, as
   Budget uses it). */
import type { ReactNode } from "react";

import { FiCheck, FiLock } from "react-icons/fi";
import {
  LuBookOpen,
  LuCode,
  LuCoins,
  LuGraduationCap,
  LuHeartPulse,
  LuLanguages,
  LuMusic,
  LuPenTool,
  LuSparkles,
} from "react-icons/lu";

import type { LearnColor, LearnIcon } from "@/lib/learn/schema";
import { priceStrings } from "@/lib/needt3/pricing";
import { useStoreDistribution } from "@/lib/use-store-distribution";

import { openPaywall } from "../paywall";
import { GlassCard } from "../scenes";

/** The CSS colour of a topic's wash: a token mix defined in learn.css. */
export const hueVar = (c: LearnColor) => `var(--ln-hue-${c})`;

export function LearnGlyph({
  icon,
  size = 18,
}: {
  icon: LearnIcon | null;
  size?: number;
}) {
  const p = { size, "aria-hidden": true } as const;
  switch (icon) {
    case "language":
      return <LuLanguages {...p} />;
    case "design":
      return <LuPenTool {...p} />;
    case "money":
      return <LuCoins {...p} />;
    case "book":
      return <LuBookOpen {...p} />;
    case "code":
      return <LuCode {...p} />;
    case "health":
      return <LuHeartPulse {...p} />;
    case "music":
      return <LuMusic {...p} />;
    case "spark":
      return <LuSparkles {...p} />;
    default:
      return <LuGraduationCap {...p} />;
  }
}

export interface ChipItem<K extends string> {
  key: K;
  label: string;
  /** A link chip ("New topic") instead of a filter. */
  onClick?: () => void;
  icon?: ReactNode;
}

/** A row of chips: one is on (a filter), or each is an action. */
export function LearnChips<K extends string>({
  items,
  current,
  onPick,
  label,
}: {
  items: readonly ChipItem<K>[];
  current?: K | null;
  onPick?: (key: K) => void;
  label: string;
}) {
  return (
    <div className="ln-chips" role="toolbar" aria-label={label}>
      {items.map((c) => (
        <button
          key={c.key}
          type="button"
          className={"ln-chip" + (current === c.key ? " is-on" : "")}
          aria-pressed={current === undefined ? undefined : current === c.key}
          data-ln-chip={c.key}
          onClick={() => (c.onClick ? c.onClick() : onPick?.(c.key))}
        >
          {c.icon}
          {c.label}
        </button>
      ))}
    </div>
  );
}

const P = priceStrings();

const PROMO_LINES = [
  "Name any topic; Needt writes the lessons",
  "Lessons in your calendar, next to your plans",
  "As many lessons a day as you like",
] as const;

/**
 * Learn's promo: shown before a lesson opens, never in the middle of one.
 * `reason` says why it is showing (the day's free lesson is used, or the
 * person asked for AI).
 */
export function LearnPromo({
  reason,
  trial,
  onClose,
}: {
  reason: "limit" | "ai" | "calendar";
  trial: boolean;
  onClose?: () => void;
}) {
  const store = useStoreDistribution();
  const line =
    reason === "limit"
      ? "Free includes one lesson a day, and today's is done. Come back tomorrow, or learn without limit with Pro."
      : reason === "calendar"
        ? "With Pro a lesson gets its own time in your calendar, placed around your plans."
        : "With Pro, Needt writes lessons for any topic you name, at your level and towards your goal.";
  return (
    <GlassCard
      className="cn-promo nx-swap ln-promo"
      pad={0}
      radius={24}
      data-ln-promo={reason}
    >
      <div className="cn-promo-in">
        <div className="cn-promo-icons" aria-hidden="true">
          <span className="ln-promo-mark">
            <LuGraduationCap size={28} />
          </span>
          <span className="cn-promo-lock">
            <FiLock size={18} aria-hidden />
          </span>
        </div>
        <div className="cn-promo-text">
          <h2 className="cn-promo-title">Learn with Pro</h2>
          <p className="cn-promo-line">{line}</p>
        </div>
        <ul className="cn-promo-list">
          {PROMO_LINES.map((t) => (
            <li key={t} className="cn-promo-li">
              <span className="cn-promo-check">
                <FiCheck size={13} aria-hidden />
              </span>
              {t}
            </li>
          ))}
        </ul>
        <div className="cn-promo-cta">
          {/* No buttons to buy or try Pro in a store build. */}
          {store ? null : (
            <button
              type="button"
              className="nx-btn nx-btn-primary cn-promo-btn"
              data-ln-promo-try=""
              onClick={() => openPaywall("Learn")}
            >
              {trial ? `Try Pro free for ${P.trialDays} days` : "Get Pro"}
            </button>
          )}
          {onClose ? (
            <button
              type="button"
              className="nx-btn nx-btn-secondary cn-promo-btn"
              data-ln-promo-close=""
              onClick={onClose}
            >
              Not now
            </button>
          ) : null}
        </div>
      </div>
    </GlassCard>
  );
}
