"use client";

/* KEEP PRO (owner 20.11, "в стиле крафт ток"): one frosted card on the sky,
   the usage card of the Craft reference. Title, one grey line, a Monthly /
   Yearly switch, the price, one neutral button, the withdrawal box (Terms
   5.5), a short list of what Pro includes, Lifetime as a small row while seats
   remain, one footer line. Both paywalls (desktop sheet, phone sheet) wear
   this one card; they bring the logic (`paywallCta`, checkout, trial) and
   pass it in. Nothing here is a literal price. */
import type { ReactNode } from "react";

import { LuCheck } from "react-icons/lu";

import { KEEP_PRO_FOOT, type PaywallPick } from "@/lib/needt3/paywall";
import { type PriceStrings, lifetimeLeftLine } from "@/lib/needt3/pricing";

import { NeedtAppIcon } from "../wordmark";

export interface KeepProCardProps {
  title: string;
  /** The one grey line under the title; null leaves it out. */
  line: string | null;
  /** The feature that asked, when a locked feature opened the card. */
  feature?: string | null;
  pick: PaywallPick;
  onPick: (pick: PaywallPick) => void;
  /** Which Pro cycle the switch shows while Lifetime is picked. */
  cycle: "monthly" | "annual";
  prices: PriceStrings;
  lifetimeLeft: number | null | undefined;
  /** Lifetime seats remain (the server's count; unknown counts as open). */
  lifetimeOpen: boolean;
  items: ReadonlyArray<string>;
  cta: {
    label: string;
    disabled: boolean;
    onClick: () => void;
    /** Under the button: why it is off, or a short note. */
    sub: string | null;
    /** The renewal terms (legal), small and grey. */
    terms: string | null;
  };
  /** The withdrawal box, when the button goes to checkout. */
  waiver?: ReactNode;
  /** Offline / error line. */
  status?: ReactNode;
  onClose?: () => void;
  /** A phone sheet has its own grabber and Close; the card draws none. */
  closeLabel?: string;
}

export function KeepProCard({
  title,
  line,
  feature = null,
  pick,
  onPick,
  cycle,
  prices: D,
  lifetimeLeft,
  lifetimeOpen,
  items,
  cta,
  waiver,
  status,
  onClose,
  closeLabel = "Close",
}: KeepProCardProps) {
  const life = pick === "lifetime";
  const seg = (id: "monthly" | "annual", label: string, save?: ReactNode) => (
    <button
      type="button"
      role="radio"
      aria-checked={!life && cycle === id}
      data-pw-cycle={id}
      className="kp-seg-b"
      onClick={() => onPick(id)}
    >
      {label}
      {save}
    </button>
  );
  const price = life ? D.lifetime : cycle === "monthly" ? D.monthly : D.yearly;
  const per = life ? "once" : cycle === "monthly" ? "/ month" : "/ year";
  const sub = life
    ? "One payment"
    : cycle === "monthly"
      ? "Cancel any time"
      : `${D.yearlyPerMonth} / month · save ${D.saveAmount}`;
  return (
    <div className="ac-card kp-card" role="dialog" aria-label={title}>
      <span className="ac-icon">
        <NeedtAppIcon size={56} />
      </span>
      {onClose ? (
        <button
          type="button"
          className="kp-x"
          aria-label={closeLabel}
          data-pw-close=""
          onClick={onClose}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
            <path
              d="M2 2l8 8M10 2l-8 8"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              fill="none"
            />
          </svg>
        </button>
      ) : null}
      <div className="kp-in">
        <h2 className="ac-title">{title}</h2>
        {feature ? (
          <p className="kp-line" data-pw-feature={feature}>
            {feature} is part of Pro
          </p>
        ) : line ? (
          <p className="kp-line">{line}</p>
        ) : null}
        <div className="kp-seg" role="radiogroup" aria-label="Billing">
          {seg("monthly", "Monthly")}
          {seg(
            "annual",
            "Yearly",
            <span className="kp-seg-save" data-pw-save="">
              −{D.savePct}%
            </span>
          )}
        </div>
        <div className="kp-price">
          <b data-pw-price={life ? "lifetime" : cycle}>{price}</b>
          <span>{per}</span>
        </div>
        <p className="kp-sub">{sub}</p>
        {status}
        {waiver}
        <button
          type="button"
          className="nx-btn nx-btn-primary kp-cta"
          data-pw-cta={pick}
          disabled={cta.disabled}
          onClick={cta.onClick}
        >
          {cta.label}
        </button>
        {cta.sub ? (
          <p className="kp-note" data-pw-cta-sub="">
            {cta.sub}
          </p>
        ) : null}
        {cta.terms ? (
          <p className="kp-note" data-pw-terms="">
            {cta.terms}
          </p>
        ) : null}
        <ul className="kp-list">
          {items.map((t) => (
            <li key={t}>
              <LuCheck size={13} aria-hidden="true" />
              <span>{t}</span>
            </li>
          ))}
        </ul>
        {lifetimeOpen ? (
          <button
            type="button"
            className="kp-life"
            data-pw-plan="lifetime"
            aria-pressed={life}
            onClick={() => onPick("lifetime")}
          >
            <span>
              Lifetime <i>{D.lifetime}</i>
            </span>
            <span data-pw-left="">
              {lifetimeLeftLine(lifetimeLeft, D.lifetimeCap)}
            </span>
          </button>
        ) : null}
        <p className="kp-foot" data-pw-foot="">
          {KEEP_PRO_FOOT}
        </p>
      </div>
    </div>
  );
}
