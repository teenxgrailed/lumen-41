"use client";

/* Pro gating (prototype paywall.jsx, "Pro gating"): one set of pieces for every
   place a Pro feature shows up. Never modal on load: only a click opens the
   paywall. The plan comes from `GET /api/billing`; the server enforces the same
   limits, so hiding a control here is never the boundary. */
import { type PropsWithChildren, useState } from "react";

import { LuLock, LuSparkles, LuX } from "react-icons/lu";

import { usePlan } from "@/lib/needt3/hooks/plan";
import { useSetPref, useSettings } from "@/lib/needt3/hooks/settings";
import {
  type ProLimitFacts,
  isPro,
  proLimitFull,
  proLimitText,
} from "@/lib/needt3/paywall";

import { openPaywall } from "./store";

/** True for the trial and every paid plan. Unknown (not loaded) counts as Pro:
 *  a gate must not flash shut for someone who has paid. */
export function useIsPro(): boolean {
  const { data } = usePlan();
  return data ? isPro(data.kind) : true;
}

/** The black "PRO" pill; `locked` adds the lock glyph. */
export function ProBadge({
  size,
  locked,
  className,
  title,
}: {
  size?: "sm" | "md";
  locked?: boolean;
  className?: string;
  title?: string;
}) {
  const sm = size === "sm";
  return (
    <span
      className={
        "pro-badge" +
        (sm ? " is-sm" : "") +
        (locked ? " is-locked" : "") +
        (className ? " " + className : "")
      }
      data-pro-badge={locked ? "locked" : "on"}
      title={title}
      aria-label={locked ? "Pro feature — locked" : "Pro feature"}
    >
      {locked ? <LuLock size={sm ? 8 : 9} /> : null}PRO
    </span>
  );
}

/** Free: children plus a locked PRO, any click opens the paywall on `feature`.
 *  Pro: children work, a small PRO beside them. */
export function ProGate({
  feature,
  children,
}: PropsWithChildren<{ feature: string }>) {
  const pro = useIsPro();
  if (pro)
    return (
      <>
        {children}
        <ProBadge size="sm" />
      </>
    );
  return (
    <span
      role="button"
      tabIndex={0}
      className="pro-gate"
      onClickCapture={(e) => {
        e.preventDefault();
        e.stopPropagation();
        openPaywall(feature);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          openPaywall(feature);
        }
      }}
    >
      {children}
      <ProBadge size="sm" locked />
    </span>
  );
}

/** Run `fn` for Pro; open the paywall on `feature` for Free. */
export function proGuard(isProNow: boolean, feature: string, fn: () => void) {
  if (isProNow) fn();
  else openPaywall(feature);
}

const upsellKey = (id: string) => `upsellDismissed.${id}`;

/** The one soft card a screen may carry. Free only; the x hides it for good
 *  (kept in the person's settings, so another device agrees). */
export function ProUpsell({
  id,
  title,
  line,
  cta,
  feature,
  className,
}: {
  id: string;
  title: string;
  line?: string;
  cta?: string;
  feature?: string;
  className?: string;
}) {
  const { data: plan } = usePlan();
  const settings = useSettings();
  const setPref = useSetPref();
  const [leaving, setLeaving] = useState(false);
  const [gone, setGone] = useState(false);
  if (!plan || isPro(plan.kind) || !settings.data) return null;
  if (gone || settings.data.prefs[upsellKey(id)] === true) return null;
  const dismiss = (e: React.MouseEvent) => {
    e.stopPropagation();
    setLeaving(true);
    window.setTimeout(() => {
      setGone(true);
      void setPref(upsellKey(id), true).catch(() => undefined);
    }, 180);
  };
  return (
    <div
      className={
        "pro-upsell nx-swap" +
        (leaving ? " is-leaving" : "") +
        (className ? " " + className : "")
      }
      data-pro-upsell={id}
      role="note"
    >
      <span className="pro-upsell-mark" aria-hidden="true">
        <LuSparkles size={15} />
      </span>
      <span className="pro-upsell-text">
        <span className="pro-upsell-title">
          {title}
          <ProBadge size="sm" />
        </span>
        {line ? <span className="pro-upsell-line">{line}</span> : null}
      </span>
      <button
        type="button"
        className="nx-btn nx-btn-secondary nx-btn-sm pro-upsell-cta"
        data-pro-upsell-cta={id}
        onClick={() => openPaywall(feature)}
      >
        {cta || "Try Pro free"}
      </button>
      <button
        type="button"
        className="pro-upsell-x"
        aria-label="Dismiss"
        data-pro-upsell-x={id}
        onClick={dismiss}
      >
        <LuX size={13} />
      </button>
    </div>
  );
}

/** "1 of 1 mail accounts · Upgrade for more". Free only. */
export function ProLimit({
  used,
  max,
  noun,
  feature,
  className,
}: ProLimitFacts & { feature?: string; className?: string }) {
  const pro = useIsPro();
  if (pro) return null;
  const facts = { used, max, noun };
  return (
    <span
      className={
        "pro-limit" +
        (proLimitFull(facts) ? " is-full" : "") +
        (className ? " " + className : "")
      }
      data-pro-limit={noun}
    >
      <span>{proLimitText(facts)}</span>
      {proLimitFull(facts) ? (
        <button
          type="button"
          className="pro-limit-up"
          onClick={(e) => {
            e.stopPropagation();
            openPaywall(feature);
          }}
        >
          Upgrade for more
        </button>
      ) : null}
    </span>
  );
}
