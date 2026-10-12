"use client";

import { useState } from "react";

import { LuX } from "react-icons/lu";

import { usePlan } from "@/lib/needt3/hooks/plan";
import { useSetPref, useSettings } from "@/lib/needt3/hooks/settings";
import { isPro } from "@/lib/needt3/paywall";
import { priceStrings } from "@/lib/needt3/pricing";

import { PxBadge, PxSky } from "../scenes";
import { openPaywall } from "./store";

const KEY = "promoDismissed";

/** The small upgrade card at the foot of the sidebar: a promo sky, "Needt Pro",
 *  the trial line. Free only; the x hides it for good (kept in settings). */
export function PromoCard() {
  const { data: plan } = usePlan();
  const settings = useSettings();
  const setPref = useSetPref();
  const [gone, setGone] = useState(false);
  const [leaving, setLeaving] = useState(false);
  if (!plan || !settings.data || isPro(plan.kind)) return null;
  if (gone || settings.data.prefs[KEY] === true) return null;
  const dismiss = (e: React.MouseEvent) => {
    e.stopPropagation();
    setLeaving(true);
    window.setTimeout(() => {
      setGone(true);
      void setPref(KEY, true).catch(() => undefined);
    }, 180);
  };
  return (
    <div
      className={"pw-promo nx-focus" + (leaving ? " is-leaving" : "")}
      role="button"
      tabIndex={0}
      data-pw-promo
      aria-label="Needt Pro — see plans"
      onClick={() => openPaywall()}
      onKeyDown={(e) => {
        if (
          e.target === e.currentTarget &&
          (e.key === "Enter" || e.key === " ")
        ) {
          e.preventDefault();
          openPaywall();
        }
      }}
    >
      <PxSky variant="d" intensity={0.9} horizon="none" scene="promo">
        <span className="pw-promo-glow" aria-hidden="true" />
        <span className="pw-promo-in">
          <span className="pw-promo-head">
            <span
              className="px-display px-on-sky pw-promo-card-text"
              data-px-calm
            >
              Needt
            </span>
            <PxBadge>Pro</PxBadge>
          </span>
          <span className="pw-promo-line" data-px-calm>
            Try Pro free for {priceStrings().trialDays} days — no card.
          </span>
        </span>
        <button
          type="button"
          className="pw-x px-chip-btn"
          aria-label="Dismiss Needt Pro"
          data-pw-promo-close
          onClick={dismiss}
        >
          <LuX size={12} />
        </button>
      </PxSky>
    </div>
  );
}
